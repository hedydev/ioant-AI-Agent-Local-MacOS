#!/usr/bin/env node
// User-installable, per-login-session macOS watcher supervisor.
// Not callable from the ChatGPT task protocol, OpenClaw Agent or Gateway.
// One-time setup requires the user at the local Mac terminal. No sudo.
// install runs a fixed exact ChatGPT conversation, Chrome extension profile,
// main-branch repo and a narrowly bounded set of launcher flags.
import {mkdir,lstat,readFile,writeFile,realpath,unlink} from 'node:fs/promises';
import {homedir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const exec=promisify(execFile);
const REPO='hedydev/ioant-AI-Agent-Local-MacOS';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const HOME=homedir();
const SLUG='com.ioant.openclaw.safe-watcher';
const VOLUME='/Volumes/LunaDrive';
const CACHE=join(VOLUME,'DeveloperCache','projects','ioant-ai-agent-local-macos');
const TARGET='https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/6add3565-d868-83ec-804e-1e7a00eb0a59';
const PLIST=join(HOME,'Library','LaunchAgents',SLUG+'.plist');
const LOG_DIR=join(CACHE,'logs','ops-supervisor');
const LOG_OUT=join(LOG_DIR,'stdout.log');
const LOG_ERR=join(LOG_DIR,'stderr.log');
const SAFE_PATH='/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
// Trust the actual running Node binary after canonical path and ownership checks,
// not whichever node happens to be on Homebrew PATH.
const NODE_DIR=/^\/[A-Za-z0-9_.@+/-]{1,511}$/;
const safeNodeDir=s=>typeof s==='string'&&NODE_DIR.test(s)&&
  !s.includes('//')&&!s.endsWith('/')&&
  s.split('/').every(x=>x!=='.'&&x!=='..');
export async function inspectNodeRuntime({binary=process.execPath,
 canonical=realpath,stat=lstat,uid=process.getuid?.(),home=HOME}={}){
 const reject=()=>{throw Error('unsafe_node_runtime')};
 try{
  if(typeof binary!=='string'||!binary.startsWith('/'))return reject();
  const real=await canonical(binary);
  if(typeof real!=='string'||!real.startsWith('/')||
    ![home,'/opt/homebrew','/usr/local','/usr/bin',VOLUME].some(base=>
      real.startsWith(base+'/'))||!safeNodeDir(dirname(real)))return reject();
  const segments=dirname(real).split('/').filter(Boolean);
  let path='';
  for(const segment of segments){
   path+='/'+segment;
   const info=await stat(path);
   if(!info.isDirectory()||info.isSymbolicLink()||
      (info.mode&0o022)!==0||
      (typeof uid==='number'&&info.uid!==uid&&info.uid!==0))return reject();
  }
  const info=await stat(real);
  if(!info.isFile()||info.isSymbolicLink()||(info.mode&0o111)===0||
     (info.mode&0o022)!==0||
     (typeof uid==='number'&&info.uid!==uid&&info.uid!==0))return reject();
  return dirname(real);
 }catch{return reject()}
}
function pinnedNodeDir(plist){
 if(typeof plist!=='string'||plist.length>10000)return null;
 const marker='<key>PATH</key><string>';
 const start=plist.indexOf(marker);
 if(start<0||plist.indexOf(marker,start+marker.length)>=0)return null;
 const end=plist.indexOf('</string>',start+marker.length);
 if(end<0)return null;
 const value=plist.slice(start+marker.length,end),suffix=':'+SAFE_PATH;
 if(!value.endsWith(suffix))return null;
 const nodeDir=value.slice(0,-suffix.length);
 return safeNodeDir(nodeDir)?nodeDir:null;
}
const ARGS=['/bin/bash',join(ROOT,'scripts','chatgpt-loop.sh'),
 '--chat-url',TARGET,'--enable-self-update','--enable-gui-readonly',
 '--dev-agent','openclaw-dev','--watch'];
const xml=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
 .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const owned=s=>typeof process.getuid!=='function'||s.uid===process.getuid();
const privateDir=s=>s.isDirectory()&&!s.isSymbolicLink()&&owned(s)&&
 (s.mode&0o077)===0;
const privateFile=s=>s.isFile()&&!s.isSymbolicLink()&&owned(s)&&
 (s.mode&0o077)===0;
const plString=s=>'<string>'+xml(s)+'</string>';
const plArray=a=>'<array>'+a.map(plString).join('')+'</array>';
export function supervisorManifest(){
 return {label:SLUG,repo:REPO,chatUrl:TARGET,profile:'chrome',
  args:[...ARGS],readOnlyGui:true,selfUpdate:true,devAgent:'openclaw-dev',
  portChanges:false,configWrites:false,remoteOps:false};
}
export function renderPlist(nodeDir='/opt/homebrew/bin'){
 if(!safeNodeDir(nodeDir))throw Error('unsafe_node_runtime');
 return '<?xml version="1.0" encoding="UTF-8"?>\n'+
  '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'+
  '<plist version="1.0"><dict>'+
  '<key>Label</key>'+plString(SLUG)+
  '<key>ProgramArguments</key>'+plArray(ARGS)+
  '<key>EnvironmentVariables</key><dict>'+
   '<key>IOANT_CHATGPT_BROWSER_PROFILE</key>'+plString('chrome')+
   '<key>PATH</key>'+plString(nodeDir+':'+SAFE_PATH)+
  '</dict>'+
  '<key>RunAtLoad</key><true/>'+
  // Fail closed on unexpected failures rather than looping on Gateway auth,
  // mounted-volume failures or unavailable Chrome extension credentials.
  '<key>KeepAlive</key><false/>'+
  '<key>ProcessType</key>'+plString('Interactive')+
  '<key>Umask</key><integer>63</integer>'+
  '<key>StandardOutPath</key>'+plString(LOG_OUT)+
  '<key>StandardErrorPath</key>'+plString(LOG_ERR)+
  '</dict></plist>\n';
}
const safe=(audit,state,reason)=>({audit,schemaVersion:1,state,reason,
 label:SLUG,readOnlyGui:true,noSudo:true,agentToolGrant:false});
const audit='IOANT_MAC_OPS_SUPERVISOR';
async function command(bin,args,{cwd=ROOT,timeout=16000}={}){
 const o=await exec(bin,args,{cwd,timeout,maxBuffer:2048*1024});
 return (o.stdout||'').trim();
}
async function requireRepo(){
 if(process.platform!=='darwin')throw Error('macos_only');
 if(ROOT!==join(HOME,'Documents','workspace','ioant-AI-Agent-Local-MacOS'))
  throw Error('repo_path_mismatch');
 const origin=await command('git',['remote','get-url','origin']);
 if(!['https://github.com/'+REPO+'.git','https://github.com/'+REPO,
      'git@github.com:'+REPO+'.git'].includes(origin))
  throw Error('unexpected_git_origin');
 if(await command('git',['symbolic-ref','--quiet','--short','HEAD'])!=='main')
  throw Error('not_main');
 if(await command('git',['status','--porcelain=v1','--untracked-files=all']))
  throw Error('dirty_worktree');
 if(await realpath(VOLUME)!==VOLUME||
    await realpath(CACHE)!==CACHE)throw Error('unsafe_external_volume');
 // The actual verified Node is pinned into launchd's PATH; no arbitrary argv.
 const nodeDir=await inspectNodeRuntime();
 if(Number(process.versions.node.split('.')[0])<20)
  throw Error('unsupported_node_version');
 // A headless LaunchAgent cannot answer an interactive Gateway credential
 // prompt. Establish that the existing non-interactive CLI is authenticated.
 await command(join(HOME,'.openclaw','bin','openclaw'),['gateway','health'],{timeout:12000});
 return nodeDir;
}
async function safeUserDir(dir,{create=false}={}){
 if(create)await mkdir(dir,{recursive:true,mode:0o700});
 const st=await lstat(dir);
 if(!privateDir(st)||await realpath(dir)!==dir)
  throw Error('unsafe_private_directory');
}
async function ensurePrivateLog(file){
 try{const st=await lstat(file);if(!privateFile(st)||st.size>8*1024*1024)
  throw Error('unsafe_log_file');}
 catch(e){if(e.code!=='ENOENT')throw e;
  await writeFile(file,'',{flag:'wx',mode:0o600});}
}
export async function installationPreflight(){
 const nodeDir=await requireRepo();
 await safeUserDir(LOG_DIR,{create:true});
 for(const path of [LOG_OUT,LOG_ERR])await ensurePrivateLog(path);
 // Never compete with an existing foreground worker for the exact chat.
 // If a stale lock is present, let the original watcher handle recovery.
 const {chatKey}=await import('./protocol.mjs');
 const lock=join(CACHE,'chatgpt-loop',chatKey(TARGET),'watch.lock');
 try{await lstat(lock);throw Error('watcher_already_active_or_uncertain')}
 catch(e){if(e.code!=='ENOENT')throw e;}
 const agents=join(HOME,'Library','LaunchAgents');
 await mkdir(agents,{recursive:true,mode:0o700});
 const stat=await lstat(agents);
 if(!stat.isDirectory()||stat.isSymbolicLink()||!owned(stat)||
    (stat.mode&0o022)!==0)
  throw Error('unsafe_launchagents_directory');
 try{await lstat(PLIST);throw Error('supervisor_already_installed')}
 catch(e){if(e.code!=='ENOENT')throw e;}
 return {ok:true,nodeDir};
}
async function install(){
 const {nodeDir}=await installationPreflight();
 const content=renderPlist(nodeDir);
 await writeFile(PLIST,content,{flag:'wx',mode:0o600});
 try{
  const uid=process.getuid();
  await command('/bin/launchctl',['bootstrap','gui/'+uid,PLIST],{timeout:12000});
  return safe(audit,'installed','login_user_supervisor_started');
 }catch{
  // Refuse deleting a potentially installed or activated service entry.
  return safe(audit,'inconclusive','launchctl_bootstrap_unconfirmed');
 }
}
async function status(){
 if(process.platform!=='darwin')return safe(audit,'blocked','macos_only');
 try{
  const stat=await lstat(PLIST);
  const content=await readFile(PLIST,'utf8');
  const configured=pinnedNodeDir(content);
  if(!privateFile(stat)||await realpath(PLIST)!==PLIST||
     !configured||content!==renderPlist(configured))
    return safe(audit,'blocked','unexpected_launch_agent');
  let active=false;
  try{await command('/bin/launchctl',['print','gui/'+process.getuid()+'/'+SLUG]);
   active=true;}catch{}
  return safe(audit,active?'registered':'unloaded',
   active?'supervisor_exists':'launchctl_not_registered');
 }catch(e){return safe(audit,'blocked',e?.code==='ENOENT'?'not_installed':'unverified');}
}
async function uninstall(){
 const st=await status();
 if(!['registered','unloaded'].includes(st.state))
  return safe(audit,'blocked','not_managed_plist');
 if(st.state==='registered'){
  try{await command('/bin/launchctl',['bootout','gui/'+process.getuid()+'/'+SLUG]);}
  catch{return safe(audit,'inconclusive','bootout_unconfirmed')}
 }
 try{
  const content=await readFile(PLIST,'utf8');
  const configured=pinnedNodeDir(content);
  if(!privateFile(await lstat(PLIST))||
     await realpath(PLIST)!==PLIST||
     !configured||content!==renderPlist(configured))
    return safe(audit,'blocked','plist_changed');
  await unlink(PLIST);
  return safe(audit,'uninstalled','fixed_service_removed_logs_preserved');
 }catch{return safe(audit,'inconclusive','plist_removal_unconfirmed')}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(args.length!==1||!['install','status','uninstall'].includes(args[0])){
  console.log(JSON.stringify(safe(audit,'blocked','usage_install_status_uninstall')));
  process.exitCode=2;
 }else{
  try{
   const result=await (args[0]==='install'?install():
    args[0]==='status'?status():uninstall());
   console.log(JSON.stringify(result));
   if(result.state==='blocked'||result.state==='inconclusive')process.exitCode=1;
  }catch(e){
   const messages=new Set(['macos_only','repo_path_mismatch',
     'unexpected_git_origin','not_main','dirty_worktree','unsafe_external_volume',
     'gateway_health_empty','unsafe_node_runtime','unsupported_node_version','unsafe_private_directory','unsafe_log_file',
     'unsafe_launchagents_directory','watcher_already_active_or_uncertain',
     'supervisor_already_installed']);
   console.log(JSON.stringify(safe(audit,'blocked',
    messages.has(e.message)?e.message:'preflight_unavailable')));
   process.exitCode=1;
  }
 }
}
