#!/usr/bin/env node
// Explicit operator-installed launchd Guard. Separate from all chat watchers.
// Uses launchd StartInterval (60s) to perform bounded, noninteractive scans.
// No browser tool, send, CUA action, task replay or automatic service restart.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,lstat,realpath,readFile,writeFile,unlink} from 'node:fs/promises';
import {inspectNodeRuntime,parseLaunchdRuntime} from './ops-supervisor.mjs';
const exec=promisify(execFile);
const HOME=homedir(),ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(HOME,'Library','Application Support','ioant-openclaw-ops','runtime');
const LABEL='com.ioant.openclaw.guard-worker';
const PLIST=join(HOME,'Library','LaunchAgents',LABEL+'.plist');
const LOGDIR=join(HOME,'Library','Logs','ioant-openclaw-ops');
const OUT=join(LOGDIR,'guard-stdout.log'),ERR=join(LOGDIR,'guard-stderr.log');
const AUDIT='IOANT_GUARD_SERVICE';
const owned=st=>(typeof process.getuid!=='function'||st.uid===process.getuid());
const privateFile=st=>st.isFile()&&!st.isSymbolicLink()&&
 owned(st)&&(st.mode&0o077)===0;
const privateDir=st=>st.isDirectory()&&!st.isSymbolicLink()&&
 owned(st)&&(st.mode&0o077)===0;
const xml=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
 .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const str=s=>'<string>'+xml(s)+'</string>';
export function renderGuardPlist(node=process.execPath){
 if(typeof node!=='string'||!node.startsWith('/')||node.includes('<')||
  node.includes('>')||node.length>1024)
  throw Error('unsafe_node_binary');
 const script=join(RUNTIME,'stage2','guard-worker.mjs');
 return '<?xml version="1.0" encoding="UTF-8"?>\n'+
  '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'+
  '<plist version="1.0"><dict>'+
  '<key>Label</key>'+str(LABEL)+
  '<key>ProgramArguments</key><array>'+str(node)+str(script)+str('once')+'</array>'+
  '<key>RunAtLoad</key><true/>'+
  '<key>StartInterval</key><integer>60</integer>'+
  '<key>KeepAlive</key><false/>'+
  '<key>ProcessType</key>'+str('Background')+
  '<key>Umask</key><integer>63</integer>'+
  '<key>StandardOutPath</key>'+str(OUT)+
  '<key>StandardErrorPath</key>'+str(ERR)+
  '</dict></plist>\n';
}
const base=(state,reason,extra={})=>({audit:AUDIT,schemaVersion:1,
 state,reason,service:LABEL,readOnlyGuard:true,
 browserAccess:false,chatMessageSent:false,workersRestarted:false,
 chatBindingsChanged:false,...extra});
async function cmd(bin,args){
 const {stdout}=await exec(bin,args,{shell:false,cwd:RUNTIME,
  timeout:12000,maxBuffer:128000});
 return stdout;
}
async function runtimePreflight(){
 if(process.platform!=='darwin'||ROOT!==RUNTIME||
  await realpath(RUNTIME)!==RUNTIME)throw Error('private_runtime_required');
 await inspectNodeRuntime();
 const file=join(ROOT,'stage2','guard-worker.mjs');
 const st=await lstat(file);
 if(!st.isFile()||st.isSymbolicLink()||!owned(st)||
  await realpath(file)!==file)throw Error('guard_entry_unverified');
 const [origin,dirty]=await Promise.all([
  cmd('git',['-C',RUNTIME,'remote','get-url','origin']),
  cmd('git',['-C',RUNTIME,'status','--porcelain=v1','--untracked-files=all'])
 ]);
 if(!/^(?:https:\/\/github\.com\/hedydev\/ioant-AI-Agent-Local-MacOS(?:\.git)?|git@github\.com:hedydev\/ioant-AI-Agent-Local-MacOS\.git)\s*$/.test(origin)
 ||dirty.trim())throw Error('untrusted_runtime_repository');
}
async function secureLog(path){
 try{
  const st=await lstat(path);
  if(!privateFile(st)||st.size>8*1024*1024)throw Error('unsafe_guard_log');
 }catch(e){
  if(e.code!=='ENOENT')throw e;
  await writeFile(path,'',{flag:'wx',mode:0o600});
 }
}
async function preflightInstall(){
 await runtimePreflight();
 await mkdir(LOGDIR,{recursive:true,mode:0o700});
 if(!privateDir(await lstat(LOGDIR)))throw Error('unsafe_log_directory');
 await secureLog(OUT);await secureLog(ERR);
 const agents=join(HOME,'Library','LaunchAgents');
 const st=await lstat(agents);
 if(!st.isDirectory()||st.isSymbolicLink()||!owned(st)||
  (st.mode&0o022)!==0)throw Error('unsafe_launchagents_directory');
 const installed=await lstat(PLIST).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e});
 if(installed)throw Error('guard_already_installed');
 const current=await cmd('/bin/launchctl',['print','gui/'+process.getuid()+'/'+LABEL])
  .then(()=>true,()=>false);
 if(current)throw Error('guard_already_registered');
}
async function installedPlist(){
 const st=await lstat(PLIST);
 if(!privateFile(st)||await realpath(PLIST)!==PLIST)throw Error('unsafe_guard_plist');
 const txt=await readFile(PLIST,'utf8');
 // Only accept the already installed exact approved runtime binary from
 // an absolute, safe app-owned or Homebrew path.
 const matches=[...txt.matchAll(/<key>ProgramArguments<\/key><array><string>([^<]+)<\/string>/g)];
 if(matches.length!==1)throw Error('unexpected_guard_plist');
 const node=matches[0][1].replace(/&amp;/g,'&');
 if(!/^\/(?:Users\/[^<]+|opt\/homebrew\/[^<]+|usr\/local\/[^<]+|usr\/bin\/[^<]+|Volumes\/LunaDrive\/[^<]+)$/.test(node)||
  renderGuardPlist(node)!==txt)throw Error('unexpected_guard_plist');
 return {node};
}
async function status(){
 if(process.platform!=='darwin')return base('blocked','macos_only');
 try{await installedPlist()}
 catch(e){return base('blocked',e?.code==='ENOENT'?'not_installed':'unexpected_guard_plist')}
 try{
  const raw=await cmd('/bin/launchctl',['print','gui/'+process.getuid()+'/'+LABEL]);
  const s=parseLaunchdRuntime(raw);
  return base(s.state,s.state==='running'?'guard_process_running':
   'scheduled_by_launchd',{registered:true,
   // A periodic job is usually 'not running' between polls.
   startIntervalSeconds:60,periodic:true,
   ...(s.pid?{pid:s.pid}:{})});
 }catch{return base('unloaded','not_registered',{registered:false})}
}
async function install(){
 await preflightInstall();
 const node=await realpath(process.execPath);
 await writeFile(PLIST,renderGuardPlist(node),{flag:'wx',mode:0o600});
 try{
  await cmd('/bin/launchctl',['bootstrap','gui/'+process.getuid(),PLIST]);
  return base('installed','guard_scheduled',{startIntervalSeconds:60});
 }catch{return base('inconclusive','bootstrap_unconfirmed')}
}
async function uninstall(){
 const s=await status();
 if(!['running','stopped','unloaded'].includes(s.state))
  return base('blocked','guard_identity_not_verified');
 if(s.registered) {
  try{await cmd('/bin/launchctl',['bootout','gui/'+process.getuid()+'/'+LABEL])}
  catch{return base('inconclusive','bootout_unconfirmed')}
 }
 try{
  await installedPlist();
  await unlink(PLIST);
  return base('uninstalled','plist_removed_incident_journal_preserved');
 }catch{return base('inconclusive','plist_preservation_state_uncertain')}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);
  const r=args.length!==1?base('blocked','usage_install_status_uninstall'):
   args[0]==='status'?await status():args[0]==='install'?await install():
   args[0]==='uninstall'?await uninstall():base('blocked','unsupported_command');
  console.log(JSON.stringify(r));
  if(['blocked','inconclusive'].includes(r.state))process.exitCode=1;
 }catch(e){
  const reasons=new Set(['private_runtime_required','guard_entry_unverified',
   'untrusted_runtime_repository','unsafe_log_directory','unsafe_guard_log',
   'unsafe_launchagents_directory','guard_already_installed',
   'guard_already_registered','unsafe_guard_plist','unexpected_guard_plist']);
  console.log(JSON.stringify(base('blocked',reasons.has(e.message)?e.message:
   'service_operation_unavailable')));
  process.exitCode=1;
 }
}
