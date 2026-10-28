// Durable, exclusive first-read checkpoint for a newly launched watcher.
// Called ONLY while the single-Chat conversation lock is held. Existing
// session files are never overwritten or repaired and '--once' stays read-only.
import {open} from 'node:fs/promises';
const START=Object.freeze({lastTaskId:null,feedbackPending:null,initSent:false});
export function initialWatcherState(){return {...START}}
export async function persistInitialWatcherState(file,state){
 if(typeof file!=='string'||!file.endsWith('/state.json')||
    !state||typeof state!=='object'||Array.isArray(state)||
    Object.keys(state).sort().join('|')!=='feedbackPending|initSent|lastTaskId'||
    state.lastTaskId!==null||state.feedbackPending!==null||state.initSent!==false)
  throw Error('initial_watcher_state_untrusted');
 let handle;
 try{
  // wx refuses an existing state file or symlink. Never overwrite
  // another owner or revive an ambiguous pending receipt.
  handle=await open(file,'wx',0o600);
  await handle.writeFile(JSON.stringify(state)+'\n');
  await handle.sync();
  return Object.freeze({created:true,durable:true});
 }catch(e){
  if(e?.code==='EEXIST')throw Error('initial_watcher_state_race');
  throw e;
 }finally{if(handle)await handle.close()}
}
