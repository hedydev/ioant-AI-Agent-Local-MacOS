#!/usr/bin/env node
// Explicit operator-only same-Project LaunchAgent rebind. No ChatGPT task action.
// A successful rebind leaves launchd UNLOADED. A separate start is required.
import {readFile,lstat,realpath,mkdir,writeFile,rename,unlink,open} from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {boundChat,installedPlistBinding,renderPlist} from './ops-supervisor.mjs';
import {chatKey} from './protocol.mjs';

const exec=promisify(execFile);
const HOME=homedir();
const REPO=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const EXPECTED=join(HOME,'Documents','workspace','ioant-AI-Agent-Local-MacOS');
const DEPLOY=join(HOME,'Library','Application Support','ioant-openclaw-ops');
const RUNTIME=join(DEPLOY,'runtime');
const PLIST=join(HOME,'Library','LaunchAgents','com.ioant.openclaw.safe-watcher.plist');
const LABEL='com.ioant.openclaw.safe-watcher';
const CACHE='/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos';
const ORIGINS=new Set([
 'https://github.com/hedydev/ioant-AI-Agent-Local-MacOS.git',
 'https://github.com/hedydev/ioant-AI-Agent-Local-MacOS',
 'git@github.com:hedydev/ioant-AI-Agent-Local-MacOS.git'
]);
const reply=(state,reason,extra={})=>({audit:'IOANT_MAC_OPS_REBIND',schemaVersion:1,state,reason,service:LABEL,...extra});
async function cmd(bin,args,cwd=REPO){
 const o=await exec(bin,args,{cwd,timeout:15000,maxBuffer:512*1024});
 return String(o.stdout??'').trim();
}
async function privateFile(file){
 const st=await lstat(file);
 return st.isFile()&&!st.isSymbolicLink()&&
  (typeof process.getuid!=='function'||st.uid===process.getuid())&&
  (st.mode&0o077)===0&&await realpath(file)===file;
}
async function privateDirectory(dir){
 const st=await lstat(dir);
 return st.isDirectory()&&!st.isSymbolicLink()&&
  (typeof process.getuid!=='function'||st.uid===process.getuid())&&
  (st.mode&0o077)===0&&await realpath(dir)===dir;
}
async function verifyRepo(root){
 if(await cmd('git',['symbolic-ref','--quiet','--short','HEAD'],root)!=='main')throw Error('wrong_branch');
 const origin=await cmd('git',['remote','get-url','origin'],root);
 if(!ORIGINS.has(origin))throw Error('wrong_origin');
 if(await cmd('git',['status','--porcelain=v1','--untracked-files=all'],root))throw Error('dirty_worktree');
 return await cmd('git',['rev-parse','--verify','HEAD'],root);
}
async function preflight(){
 if(process.platform!=='darwin'||REPO!==EXPECTED)throw Error('wrong_host_or_path');
 const [a,b]=await Promise.all([verifyRepo(REPO),verifyRepo(RUNTIME)]);
 if(a!==b)throw Error('source_runtime_revision_mismatch');
 if(await realpath('/Volumes/LunaDrive')!=='/Volumes/LunaDrive'||
    await realpath(CACHE)!==CACHE)throw Error('cache_unavailable');
 if(!await privateDirectory(DEPLOY)||!await privateDirectory(RUNTIME))
  throw Error('unsafe_runtime');
 return a;
}
async function registered(){
 try{return await cmd('/bin/launchctl',['print','gui/'+process.getuid()+'/'+LABEL]);}
 catch{return null;}
}
// New target is never allowed to inherit an existing lock, recovery guard,
// or state file. Nothing here deletes or repairs the new conversation's files.
async function noLock(url,{fresh=false}={}){
 const base=join(CACHE,'chatgpt-loop',chatKey(url));
 for(const name of fresh?['watch.lock','watch.lock.recovery','state.json']:
  ['watch.lock','watch.lock.recovery']){
  try{await lstat(join(base,name));return false;}
  catch(e){if(e.code!=='ENOENT')throw Error('lock_state_unknown');}
 }
 return true;
}
const validPid=pid=>Number.isSafeInteger(pid)&&pid>1&&pid<=2147483647;
const lockMetadataSafe=(st,uid)=>st.isFile()&&!st.isSymbolicLink()&&
 st.size>0&&st.size<=512&&(st.mode&0o077)===0&&
 (typeof uid!=='number'||st.uid===uid);
const sameLock=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&
 a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;
function ownerPidDead(pid){
 try{process.kill(pid,0);return false;}
 catch(e){return e?.code==='ESRCH';} // EPERM, EINVAL and all other failures block.
}
// Read-only preservation check: an orphaned old lock is inert for changing
// the launchd target. Never unlink it or lose the old conversation's state.
export async function inspectOldWatchLock(url,{
 root=CACHE,stat=lstat,openFile=open,probe=ownerPidDead,uid=process.getuid?.()
}={}){
 const directory=join(root,'chatgpt-loop',chatKey(url));
 const guard=join(directory,'watch.lock.recovery');
 // No recovery may be underway or interrupted, even if watch.lock is absent.
 try{await stat(guard);throw Error('old_lock_recovery_present');}
 catch(e){if(e?.code!=='ENOENT')throw e;}
 const path=join(directory,'watch.lock');
 let first;
 try{first=await stat(path);}
 catch(e){
  if(e?.code==='ENOENT')return {state:'absent'};
  throw Error('old_lock_unverifiable');
 }
 if(!lockMetadataSafe(first,uid))throw Error('old_lock_untrusted');
 let handle;
 try{
  handle=await openFile(path,fsConstants.O_RDONLY|fsConstants.O_NOFOLLOW|fsConstants.O_NONBLOCK);
  const opened=await handle.stat();
  if(!lockMetadataSafe(opened,uid)||!sameLock(first,opened))
   throw Error('old_lock_changed');
  const raw=await handle.readFile('utf8');
  let value;
  try{value=JSON.parse(raw);}catch{throw Error('old_lock_untrusted');}
  if(!value||!validPid(value.pid)||
     typeof value.startedAt!=='string'||!Number.isFinite(Date.parse(value.startedAt))||
     typeof value.nonce!=='string'||!/^[0-9a-f-]{36}$/i.test(value.nonce))
   throw Error('old_lock_untrusted');
  // A dead PID is only a point-in-time observation. Recheck the same file
  // identity and PID just before taking any irreversible rebind action.
  if(probe(value.pid)!==true)throw Error('old_lock_owner_not_proven_dead');
  const last=await stat(path);
  if(!lockMetadataSafe(last,uid)||!sameLock(opened,last)||
     probe(value.pid)!==true)
   throw Error('old_lock_changed_or_owner_unverified');
  try{await stat(guard);throw Error('old_lock_recovery_present');}
  catch(e){if(e?.code!=='ENOENT')throw e;}
  return {state:'orphan',pid:value.pid,dev:opened.dev,ino:opened.ino,
    mtimeMs:opened.mtimeMs,ctimeMs:opened.ctimeMs,nonce:value.nonce};
 }catch(e){
  if(['old_lock_untrusted','old_lock_changed','old_lock_owner_not_proven_dead',
      'old_lock_changed_or_owner_unverified','old_lock_recovery_present'].includes(e?.message))
   throw e;
  throw Error('old_lock_unverifiable');
 }finally{if(handle)await handle.close();}
}
export function candidatePlist(current,newUrl){
 const parsed=boundChat(newUrl);
 const old=installedPlistBinding(current);
 if(!old||old.kind!=='local')throw Error('unrecognized_plist');
 if(old.conversationId===parsed.conversationId)throw Error('same_conversation');
 const next=renderPlist(old.nodeDir,{chatUrl:parsed.canonicalUrl});
 if(installedPlistBinding(next)?.conversationId!==parsed.conversationId)
  throw Error('replacement_not_verifiable');
 return {old,target:parsed,next};
}
async function requireStopped(){
 const raw=await registered();
 if(!raw||!/^\s*state = not running\s*$/m.test(raw)||
    /^\s*pid = \d+\s*$/m.test(raw))throw Error('worker_not_proven_stopped');
 return raw;
}
async function rebind(url){
 // URL/project validation occurs before any source or launchd operations.
 const target=boundChat(url);
 await preflight();
 if(!await privateFile(PLIST))throw Error('unsafe_plist');
 const original=await readFile(PLIST,'utf8');
 const plan=candidatePlist(original,target.canonicalUrl);
 await requireStopped();
 const oldLock=await inspectOldWatchLock(plan.old.chatUrl);
 if(!await noLock(plan.target.canonicalUrl,{fresh:true}))
  throw Error('target_lock_or_state_exists');
 const backupDir=join(DEPLOY,'rebind-backups');
 await mkdir(backupDir,{recursive:true,mode:0o700});
 if(!await privateDirectory(backupDir))throw Error('unsafe_backup_dir');
 const nonce=randomBytes(6).toString('hex');
 const backup=join(backupDir,'before-'+nonce+'.plist');
 // Restore evidence exists before launchctl unload or plist write.
 await writeFile(backup,original,{flag:'wx',mode:0o600});
 // Compare the complete old-file observation immediately before bootout.
 // A worker reclaiming the lock, or any changed identity, halts rebind.
 const lastLock=await inspectOldWatchLock(plan.old.chatUrl);
 if(JSON.stringify(lastLock)!==JSON.stringify(oldLock))
  throw Error('old_lock_changed_before_bootout');
 if(!await noLock(plan.target.canonicalUrl,{fresh:true}))
  throw Error('target_lock_or_state_exists');
 await requireStopped();
 await cmd('/bin/launchctl',['bootout','gui/'+process.getuid()+'/'+LABEL]);
 if(await registered())throw Error('bootout_unconfirmed');
 // Atomic plist replacement; preserve old state/lock/backup, never delete these.
 if(await readFile(PLIST,'utf8')!==original)throw Error('plist_changed');
 const temp=PLIST+'.pending-'+process.pid+'-'+nonce;
 try{
  await writeFile(temp,plan.next,{flag:'wx',mode:0o600});
  await rename(temp,PLIST);
 }finally{
  try{await unlink(temp);}catch(e){if(e.code!=='ENOENT')throw Error('temporary_file_cleanup_failed');}
 }
 if(!await privateFile(PLIST)||
    installedPlistBinding(await readFile(PLIST,'utf8'))?.conversationId!==target.conversationId)
  throw Error('new_binding_unverified');
 return reply('rebound_unloaded','explicit_start_required',{
  oldConversationId:plan.old.conversationId,
  newConversationId:target.conversationId
 });
}
async function start(url){
 const requested=boundChat(url);
 await preflight();
 if(!await privateFile(PLIST))throw Error('unsafe_plist');
 const installed=installedPlistBinding(await readFile(PLIST,'utf8'));
 if(!installed||installed.kind!=='local'||installed.conversationId!==requested.conversationId)
  throw Error('target_not_bound');
 if(await registered())throw Error('service_already_registered');
 if(!await noLock(installed.chatUrl))throw Error('watcher_lock_exists');
 await cmd(join(HOME,'.openclaw','bin','openclaw'),['gateway','health']);
 await cmd('/bin/launchctl',['bootstrap','gui/'+process.getuid(),PLIST]);
 return reply('start_requested','verify_worker_and_message_receipt',{
  chatConversationId:requested.conversationId
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(args.length!==2||!['rebind','start'].includes(args[0])){
  console.log(JSON.stringify(reply('blocked','usage_rebind_or_start_with_explicit_chat_url')));
  process.exitCode=2;
 }else{
  try{
   const result=await (args[0]==='rebind'?rebind(args[1]):start(args[1]));
   console.log(JSON.stringify(result));
  }catch(e){
   const safe=new Set(['wrong_host_or_path','wrong_branch','wrong_origin','dirty_worktree',
    'source_runtime_revision_mismatch','cache_unavailable','unsafe_runtime',
    'unsafe_plist','unrecognized_plist','same_conversation','replacement_not_verifiable',
    'worker_not_proven_stopped','lock_state_unknown','watcher_lock_or_target_state_exists',
    'unsafe_backup_dir','bootout_unconfirmed','plist_changed','temporary_file_cleanup_failed',
    'new_binding_unverified','target_not_bound','service_already_registered',
    'watcher_lock_exists','target_lock_or_state_exists',
    'old_lock_recovery_present','old_lock_untrusted','old_lock_changed',
    'old_lock_owner_not_proven_dead','old_lock_changed_or_owner_unverified',
    'old_lock_unverifiable','old_lock_changed_before_bootout',
    'cross_project_rebind','not_a_project_chat',
    'invalid_chat_url','invalid_chat_origin','unapproved_chat_query']);
   console.log(JSON.stringify(reply('blocked_or_inconclusive',
    safe.has(e?.message)?e.message:'inspect_local_logs_no_auto_retry')));
   process.exitCode=1;
  }
 }
}
