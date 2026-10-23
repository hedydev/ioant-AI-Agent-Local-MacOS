// Foreground single-conversation lease. Recover only provably orphaned local locks.
// Never remove a lock with a living PID, unreadable ownership, or changed identity.
import { open, readFile, lstat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const LOCK='watch.lock';
const RECOVERY='watch.lock.recovery';
function safePid(pid){ return Number.isSafeInteger(pid) && pid > 1 && pid <= 2147483647; }
function definitelyDead(pid){
  try { process.kill(pid,0); return false; }
  catch(err){ return err?.code==='ESRCH'; } // EPERM and all other errors = unknown.
}
function plainOwnedLock(info){
  return info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= 512
    && (info.mode & 0o077)===0
    && (typeof process.getuid!=='function' || info.uid===process.getuid());
}
async function currentLock(file){
  const meta=await lstat(file);
  if(!plainOwnedLock(meta))throw Error('Untrusted existing watch.lock; no deletion. Inspect local lock permissions/ownership.');
  const value=JSON.parse(await readFile(file,'utf8'));
  if(!value || !safePid(value.pid) || typeof value.startedAt!=='string'
     || !Number.isFinite(Date.parse(value.startedAt)))
    throw Error('Malformed existing watch.lock; no deletion.');
  return {meta,value};
}
async function recoverOrphan(folder){
  const file=join(folder,LOCK),guard=join(folder,RECOVERY);
  let handle;
  try{handle=await open(guard,'wx',0o600);}
  catch(err){
    if(err.code==='EEXIST')throw Error('Lock recovery already in progress or interrupted; no lock was deleted. Inspect watch.lock.recovery.');
    throw err;
  }
  try{
    let existing;
    try{existing=await currentLock(file);}
    catch(err){
      if(err.code==='ENOENT')return; // Another prior owner cleaned its own file.
      throw err;
    }
    const pid=existing.value.pid;
    if(!definitelyDead(pid)){
      throw Error('Another ChatGPT watcher may be active (watch.lock PID '+pid+'). No second worker started. Inspect: ps -p '+pid+' -o pid=,command=');
    }
    const verify=await currentLock(file);
    if(verify.meta.ino!==existing.meta.ino || verify.meta.dev!==existing.meta.dev
      || verify.value.pid!==pid || verify.value.startedAt!==existing.value.startedAt){
      throw Error('watch.lock changed during stale-owner verification; no deletion.');
    }
    await unlink(file);
    console.log('[loop] Recovered orphan watch.lock: previous PID '+pid+' no longer exists. No application process was stopped.');
  }finally{
    await handle.close();
    await unlink(guard);
  }
}
export async function acquireConversationLock(folder){
  const file=join(folder,LOCK);
  const identity={pid:process.pid,startedAt:new Date().toISOString(),nonce:randomUUID()};
  let handle;
  try{handle=await open(file,'wx',0o600);}
  catch(err){
    if(err.code!=='EEXIST')throw err;
    await recoverOrphan(folder);
    try{handle=await open(file,'wx',0o600);}
    catch(e){
      if(e.code==='EEXIST')throw Error('Another watcher claimed this conversation while recovering a stale lock; no second instance started.');
      throw e;
    }
  }
  try{
    await handle.writeFile(JSON.stringify(identity)+'\n');
    await handle.sync();
  }catch(err){
    await handle.close();
    // Only remove what our process created; do not delete unexpected replacement.
    try{const existing=await currentLock(file);
      if(existing.value.nonce===identity.nonce)await unlink(file);
    }catch{}
    throw err;
  }
  await handle.close();
  return async()=>{
    // Never remove another worker's lock, including after a file replacement.
    try{const existing=await currentLock(file);
      if(existing.value.pid===identity.pid && existing.value.nonce===identity.nonce)
        await unlink(file);
    }catch(err){
      if(err.code!=='ENOENT')console.error('[loop] Lock cleanup refused: '+err.message);
    }
  };
}
