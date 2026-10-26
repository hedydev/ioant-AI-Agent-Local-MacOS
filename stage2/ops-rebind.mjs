#!/usr/bin/env node
// Explicit operator-only same-Project LaunchAgent rebind. No ChatGPT task action.
// A successful rebind leaves launchd UNLOADED. A separate start is required.
import {readFile,lstat,realpath,mkdir,writeFile,rename,unlink} from 'node:fs/promises';
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
async function noLock(url,{fresh=false}={}){
 const base=join(CACHE,'chatgpt-loop',chatKey(url));
 for(const name of fresh?['watch.lock','state.json']:['watch.lock']){
  try{await lstat(join(base,name));return false;}
  catch(e){if(e.code!=='ENOENT')throw Error('lock_state_unknown');}
 }
 return true;
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
 if(!await noLock(plan.old.chatUrl)||!await noLock(plan.target.canonicalUrl,{fresh:true}))
  throw Error('watcher_lock_or_target_state_exists');
 const backupDir=join(DEPLOY,'rebind-backups');
 await mkdir(backupDir,{recursive:true,mode:0o700});
 if(!await privateDirectory(backupDir))throw Error('unsafe_backup_dir');
 const nonce=randomBytes(6).toString('hex');
 const backup=join(backupDir,'before-'+nonce+'.plist');
 // Restore evidence exists before launchctl unload or plist write.
 await writeFile(backup,original,{flag:'wx',mode:0o600});
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
    'watcher_lock_exists','cross_project_rebind','not_a_project_chat',
    'invalid_chat_url','invalid_chat_origin','unapproved_chat_query']);
   console.log(JSON.stringify(reply('blocked_or_inconclusive',
    safe.has(e?.message)?e.message:'inspect_local_logs_no_auto_retry')));
   process.exitCode=1;
  }
 }
}
