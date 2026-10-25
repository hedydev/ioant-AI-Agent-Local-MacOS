#!/usr/bin/env node
// Fixed incident repair ONLY: OpenClaw Dev claim persisted before an
// unregistered diagnostic event threw on 2026-10-25. Never clears generic
// uncertain claims and never invokes creation, tools or Gateway writes.
import {lstat,readFile,writeFile,rename,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chatKey} from './protocol.mjs';
import {acquireConversationLock} from './conversation-lock.mjs';
import {preflightDev} from './openclaw-dev-preflight.mjs';

const AUDIT='IOANT_OPENCLAW_DEV_INTERRUPTED_CLAIM';
const ATTEMPT='openclaw-dev-create-20261025-062';
const LOG_NAME='run-20261024T235448Z-82118-ca6d81ec.jsonl';
const TARGET='https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/6add3565-d868-83ec-804e-1e7a00eb0a59';
const CACHE='/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos';
const report=(state,reason)=>({audit:AUDIT,schemaVersion:1,state,reason,configWrite:false,agentCreation:false});
const obj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const privateFile=st=>st.isFile()&&!st.isSymbolicLink()&&st.size>0&&st.size<=2*1024*1024&&
 (st.mode&0o077)===0&&
 (typeof process.getuid!=='function'||st.uid===process.getuid());
const stamp=s=>typeof s==='string'&&Number.isFinite(Date.parse(s))?Date.parse(s):NaN;

export function proofPreInvocationCrash(state,events,readiness){
 if(!obj(state)||!obj(state.devAgentCreationAttempted)||
    state.devAgentCreationAttempted.id!==ATTEMPT||
    !Number.isFinite(stamp(state.devAgentCreationAttempted.at))||
    state.feedbackPending!==null||state.lastTaskId===ATTEMPT||
    state.devAgentCreationRecovery!==undefined||
    !Array.isArray(events)||events.length<4||events.length>20000||
    readiness?.audit!=='IOANT_OPENCLAW_DEV_PREFLIGHT'||readiness.state!=='ready'||
    readiness.configWrite!==false||readiness.writeApproved!==false)return false;
 const normalized=events.every(x=>obj(x)&&x.source==='ioant-loop'&&
   typeof x.event==='string'&&Number.isFinite(stamp(x.at)));
 if(!normalized)return false;
 const relevant=events.filter(x=>x.taskId===ATTEMPT);
 if(relevant.length!==2||
    relevant[0].event!=='task_seen'||relevant[0].action!=='openclaw-dev-create'||
    relevant[1].event!=='action_started'||relevant[1].action!=='openclaw-dev-create')
   return false;
 const started=stamp(relevant[1].at);
 const claimed=stamp(state.devAgentCreationAttempted.at);
 if(Math.abs(claimed-started)>120000)return false;
 const error=events.findIndex((x,i)=>i>events.indexOf(relevant[1])&&
   x.event==='worker_error'&&x.code==='unexpected');
 const stopped=events.findIndex((x,i)=>i>events.indexOf(relevant[1])&&x.event==='watch_stopped');
 const launcherExit=events.findIndex((x,i)=>i>error&&x.event==='launcher_exit');
 if(error<0||stopped<0||launcherExit<0||stamp(events[error].at)<claimed)return false;
 if(events.some(x=>['openclaw_dev_create_claimed','action_finished',
      'report_saved','feedback_pending','feedback_confirmed'].includes(x.event)&&
      x.taskId===ATTEMPT))return false;
 // In the pre-fix worker this diagnostic event was NOT on the allowlist.
 // The synchronous throw preceded the only call to runAction(dev-create).
 return true;
}
export async function recoverInterruptedClaim({preflight=preflightDev,
  load=async path=>JSON.parse(await readFile(path,'utf8')),
  save=async(path,state)=>{
   const tmp=path+'.'+process.pid+'.incident-recovery.tmp';
   await writeFile(tmp,JSON.stringify(state,null,2)+'\n',{flag:'wx',mode:0o600});
   await rename(tmp,path);
  }}={}){
 const env=process.env;
 if(process.platform!=='darwin'||env.PROJECT_DEV_CACHE!==CACHE||
    env.OPENCLAW_CONFIG_PATH||env.OPENCLAW_STATE_DIR||env.OPENCLAW_PROFILE)
   return report('blocked','unsafe_environment');
 const store=join(CACHE,'chatgpt-loop',chatKey(TARGET));
 const stateFile=join(store,'state.json');
 const logFile=join(CACHE,'logs','chatgpt-loop',LOG_NAME);
 let unlock;
 try{
  // A running watcher, even one with a stale-looking PID, prohibits repair.
  try{await lstat(join(store,'watch.lock'));return report('blocked','watcher_lock_present')}
  catch(e){if(e?.code!=='ENOENT')return report('blocked','lock_uncertain')}
  if(await realpath(CACHE)!==CACHE||
     await realpath(store)!==store||
     await realpath(logFile)!==logFile||
     await realpath(stateFile)!==stateFile)return report('blocked','unsafe_path');
  // Take the same exclusive per-chat lock used by the foreground worker.
  // This prevents a watcher racing state repair or starting the old task.
  unlock=await acquireConversationLock(store);
  const stat=await lstat(stateFile),logStat=await lstat(logFile);
  if(!privateFile(stat)||stat.size>512*1024||!privateFile(logStat))
   return report('blocked','unsafe_evidence');
  const state=await load(stateFile);
  const events=(await readFile(logFile,'utf8')).trim().split('\n').map(x=>JSON.parse(x));
  const readiness=await preflight();
  if(!proofPreInvocationCrash(state,events,readiness))
   return report('blocked','claim_or_evidence_unverified');
  const next={...state,lastTaskId:ATTEMPT,
   devAgentCreationRecovery:{id:ATTEMPT,reason:'preinvoke_unregistered_diagnostic_event',
    at:new Date().toISOString()}};
  delete next.devAgentCreationAttempted;
  await save(stateFile,next);
  return report('recovered','old_claim_closed_new_id_required');
 }catch{return report('blocked','inspection_or_write_failed')}
 finally{if(unlock)await unlock()}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
 if(process.argv.length!==2){
  console.log(JSON.stringify(report('blocked','arguments_not_allowed')));process.exitCode=2;
 }else{
  recoverInterruptedClaim().then(result=>{
   console.log(JSON.stringify(result));
   if(result.state!=='recovered')process.exitCode=1;
  }).catch(()=>{
   console.log(JSON.stringify(report('blocked','unexpected_error')));process.exitCode=1;
  });
 }
}
