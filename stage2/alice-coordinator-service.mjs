#!/usr/bin/env node
// Independently opt-in AliceAI launchd coordinator. Never installed from a chat task.
// Only one pinned read-only ChatGPT Project; cannot manage the existing ops service.
import {mkdir,lstat,realpath,readFile,writeFile,unlink} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseProjectChatUrl,resolveProjectRoute} from './project-chat-routing.mjs';
import {chatKey} from './protocol.mjs';
import {inspectNodeRuntime,parseLaunchdRuntime} from './ops-supervisor.mjs';

const exec=promisify(execFile);
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const HOME=homedir();
const REPO='hedydev/ioant-AI-Agent-Local-MacOS';
const ALICE_REPO='hedydev/ioant-AI-Minecraft-Alice';
const ALICE_URL='https://chatgpt.com/g/g-p-6acaef839af081919426a885b3209f54-ai-mc-alice/c/6ade11a5-f0c0-83ec-add1-8a0cff00c938';
const LABEL='com.ioant.openclaw.alice-coordinator';
const SUPPORT=join(HOME,'Library','Application Support','ioant-openclaw-ops');
const RUNTIME=join(SUPPORT,'runtime');
const PLIST=join(HOME,'Library','LaunchAgents',LABEL+'.plist');
const LOCAL_LOGS=join(HOME,'Library','Logs');
const LOG_PARENT=join(LOCAL_LOGS,'ioant-openclaw-ops');
const LOG_DIR=join(LOG_PARENT,'alice-coordinator');
const LOG_STDOUT=join(LOG_DIR,'stdout.log');
const LOG_STDERR=join(LOG_DIR,'stderr.log');
const CACHE='/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos';
const SAFE_PATH='/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
const ORIGINS=new Set(['https://github.com/'+REPO+'.git',
 'https://github.com/'+REPO,'git@github.com:'+REPO+'.git']);
const XML=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
 .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const owner=s=>typeof process.getuid!=='function'||s.uid===process.getuid();
const privateDir=s=>s.isDirectory()&&!s.isSymbolicLink()&&owner(s)&&(s.mode&0o077)===0;
const privateFile=s=>s.isFile()&&!s.isSymbolicLink()&&owner(s)&&(s.mode&0o077)===0;
const fixedNodeDir=s=>typeof s==='string'&&/^\/[A-Za-z0-9_.@+/-]{1,511}$/.test(s)&&
 !s.includes('//')&&!s.endsWith('/')&&s.split('/').every(p=>p!=='.'&&p!=='..')&&
 (s==='/usr/bin'||[HOME+'/', '/opt/homebrew/','/usr/local/','/usr/bin/','/Volumes/LunaDrive/'].some(x=>s.startsWith(x)));
const str=s=>'<string>'+XML(s)+'</string>';
const array=a=>'<array>'+a.map(str).join('')+'</array>';
const args=['/bin/bash',join(RUNTIME,'scripts','alice-coordinator-readonly.sh'),'--watch'];
export function aliceCoordinatorManifest(){
 return Object.freeze({label:LABEL,chatUrl:ALICE_URL,projectKey:'alice-ai',
  agentId:'alice-ai',repo:ALICE_REPO,profile:'chrome',mode:'watch',
  readOnly:true,hostCommands:false,ssh:false,serviceManagerScope:'alice-only',
  keepAlive:false,programArgs:[...args]});
}
export function renderAliceCoordinatorPlist(nodeDir='/opt/homebrew/bin'){
 if(!fixedNodeDir(nodeDir))throw Error('unsafe_node_runtime');
 return '<?xml version="1.0" encoding="UTF-8"?>\n'+
 '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'+
 '<plist version="1.0"><dict>'+
 '<key>Label</key>'+str(LABEL)+
 '<key>ProgramArguments</key>'+array(args)+
 '<key>EnvironmentVariables</key><dict>'+
 '<key>IOANT_CHATGPT_BROWSER_PROFILE</key>'+str('chrome')+
 '<key>IOANT_BACKGROUND_SAFE_REPORTS</key>'+str('1')+
 '<key>PATH</key>'+str(nodeDir+':'+SAFE_PATH)+
 '</dict>'+
 '<key>RunAtLoad</key><true/>'+
 '<key>KeepAlive</key><false/>'+
 '<key>ProcessType</key>'+str('Interactive')+
 '<key>Umask</key><integer>63</integer>'+
 '<key>StandardOutPath</key>'+str(LOG_STDOUT)+
 '<key>StandardErrorPath</key>'+str(LOG_STDERR)+
 '</dict></plist>\n';
}
export function recognizeAliceCoordinatorPlist(content){
 if(typeof content!=='string'||content.length>10000)return null;
 const token='<key>PATH</key><string>';
 const at=content.indexOf(token);
 if(at<0||content.indexOf(token,at+1)!==-1)return null;
 const end=content.indexOf('</string>',at+token.length);
 if(end<0)return null;
 const value=content.slice(at+token.length,end);
 if(!value.endsWith(':'+SAFE_PATH))return null;
 const nodeDir=value.slice(0,-SAFE_PATH.length-1);
 if(!fixedNodeDir(nodeDir))return null;
 return content===renderAliceCoordinatorPlist(nodeDir)?{nodeDir,label:LABEL}:null;
}
async function command(bin,argv,{cwd=ROOT,timeout=16000}={}){
 const p=await exec(bin,argv,{cwd,timeout,maxBuffer:512*1024});
 return p.stdout.trim();
}
export function launchdServiceAbsent(error){
 const message=String(error?.stderr??error?.message??'');
 return /Could not find service|service not found|No such service/i.test(message);
}
async function ownedDirectory(path,{create=false,strict=true}={}){
 if(create)await mkdir(path,{recursive:true,mode:0o700});
 const st=await lstat(path);
 if(!(strict?privateDir(st):st.isDirectory()&&!st.isSymbolicLink()&&owner(st)&&(st.mode&0o022)===0)||
    await realpath(path)!==path)throw Error('unsafe_private_directory');
}
async function privateLog(path){
 try{
  const st=await lstat(path);
  if(!privateFile(st)||st.size>8*1024*1024||await realpath(path)!==path)
   throw Error('unsafe_log_file');
 }catch(e){
  if(e.code!=='ENOENT')throw e;
  await writeFile(path,'',{flag:'wx',mode:0o600});
 }
}
async function exactPlist(){
 const st=await lstat(PLIST);
 if(!privateFile(st)||await realpath(PLIST)!==PLIST)throw Error('unexpected_alice_plist');
 const contents=await readFile(PLIST,'utf8');
 if(!recognizeAliceCoordinatorPlist(contents))throw Error('unexpected_alice_plist');
 return contents;
}
async function preflight(){
 if(process.platform!=='darwin')throw Error('macos_only');
 if(ROOT!==RUNTIME)throw Error('private_runtime_required');
 if(await realpath(RUNTIME)!==RUNTIME)throw Error('unsafe_runtime_root');
 await ownedDirectory(RUNTIME);
 if(await command('git',['-C',ROOT,'remote','get-url','origin']).then(x=>ORIGINS.has(x))!==true)
  throw Error('unexpected_origin');
 if(await command('git',['-C',ROOT,'symbolic-ref','--quiet','--short','HEAD'])!=='main')
  throw Error('not_main');
 if(await command('git',['-C',ROOT,'status','--porcelain=v1','--untracked-files=all']))
  throw Error('dirty_runtime');
 const head=await command('git',['-C',ROOT,'rev-parse','--verify','HEAD']);
 if(!/^[0-9a-f]{40}$/.test(head))throw Error('unverified_runtime_head');
 const script=join(RUNTIME,'scripts','alice-coordinator-readonly.sh');
 const scriptStat=await lstat(script);
 if(!scriptStat.isFile()||scriptStat.isSymbolicLink()||!owner(scriptStat)||
    (scriptStat.mode&0o022)!==0||await realpath(script)!==script)
  throw Error('unsafe_alice_script');
 const doc=JSON.parse(await readFile(join(ROOT,'config','chat-projects.json'),'utf8'));
 const route=resolveProjectRoute(doc,ALICE_URL);
 if(route.key!=='alice-ai'||route.repo!==ALICE_REPO||route.agentId!=='alice-ai'||
    route.chatUrl!==ALICE_URL||route.role!=='project-lead'||
    parseProjectChatUrl(ALICE_URL).conversationId!==route.conversationId)
  throw Error('alice_route_mismatch');
 const lock=join(CACHE,'chatgpt-loop',chatKey(ALICE_URL),'watch.lock');
 try{await lstat(lock);throw Error('alice_watcher_lock_exists')}
 catch(e){if(e.code!=='ENOENT')throw e}
 try{await lstat(PLIST);throw Error('alice_service_already_installed')}
 catch(e){if(e.code!=='ENOENT')throw e}
 // A service can remain registered even when its plist was unexpectedly lost.
 try{await command('/bin/launchctl',['print','gui/'+process.getuid()+'/'+LABEL]);throw Error('alice_service_already_loaded')}
 catch(e){if(e.message==='alice_service_already_loaded')throw e;
  if(!launchdServiceAbsent(e))throw Error('launchctl_query_unverified')}
 const st=await lstat(LOCAL_LOGS);
 if(!st.isDirectory()||st.isSymbolicLink()||!owner(st)||(st.mode&0o022)!==0||
    await realpath(LOCAL_LOGS)!==LOCAL_LOGS)throw Error('unsafe_local_log_parent');
 await ownedDirectory(LOG_PARENT);
 await ownedDirectory(LOG_DIR,{create:true});
 await privateLog(LOG_STDOUT);
 await privateLog(LOG_STDERR);
 await ownedDirectory(join(HOME,'Library','LaunchAgents'),{strict:false});
 const nodeDir=await inspectNodeRuntime();
 await command(join(HOME,'.openclaw','bin','openclaw'),['gateway','health'],{timeout:15000});
 return {nodeDir,head};
}
const base=(state,reason,extra={})=>({audit:'IOANT_ALICE_COORDINATOR_SERVICE',
 schemaVersion:1,state,reason,label:LABEL,readOnly:true,changesExistingOps:false,...extra});
async function status(){
 if(process.platform!=='darwin')return base('blocked','macos_only');
 try{await exactPlist()}
 catch(e){return base('blocked',e.code==='ENOENT'?'not_installed':'unexpected_alice_plist')}
 const chatId=parseProjectChatUrl(ALICE_URL).conversationId;
 try{
  const result=await command('/bin/launchctl',['print','gui/'+process.getuid()+'/'+LABEL]);
  const found=parseLaunchdRuntime(result);
  return base(found.state,found.state==='running'?'pid_observed':'service_not_running',{
   registered:true,running:found.state==='running',chatConversationId:chatId,
   ...(found.pid?{pid:found.pid}:{}),
   ...(found.lastExitCode!==undefined?{lastExitCode:found.lastExitCode}:{})});
 }catch(e){return launchdServiceAbsent(e)?
  base('unloaded','not_registered',{registered:false,running:false,chatConversationId:chatId}):
  base('inconclusive','launchctl_query_unverified',{registered:null,running:null,chatConversationId:chatId})}
}
async function install(){
 const {nodeDir,head}=await preflight();
 const file=renderAliceCoordinatorPlist(nodeDir);
 await writeFile(PLIST,file,{flag:'wx',mode:0o600});
 try{
  await command('/bin/launchctl',['bootstrap','gui/'+process.getuid(),PLIST],{timeout:18000});
  return base('installed','launchctl_bootstrap_accepted',{head});
 }catch{return base('inconclusive','bootstrap_result_unknown',{head})}
}
async function uninstall(){
 const state=await status();
 if(!['running','stopped','unloaded'].includes(state.state))
  return base('blocked','not_managed_alice_service');
 if(state.registered){
  try{await command('/bin/launchctl',['bootout','gui/'+process.getuid()+'/'+LABEL])}
  catch{return base('inconclusive','bootout_result_unknown')}
 }
 try{await exactPlist();await unlink(PLIST)}
 catch{return base('inconclusive','private_plist_removal_unknown')}
 return base('uninstalled','alice_only_service_removed');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const argv=process.argv.slice(2);
 if(argv.length!==1||!['install','status','uninstall'].includes(argv[0])){
  console.log(JSON.stringify(base('blocked','usage_install_status_uninstall')));
  process.exitCode=2;
 }else{
  try{
   const result=await (argv[0]==='install'?install():
    argv[0]==='status'?status():uninstall());
   console.log(JSON.stringify(result));
   if(['blocked','inconclusive'].includes(result.state))process.exitCode=1;
  }catch(e){
   const known=new Set(['macos_only','private_runtime_required','unsafe_runtime_root',
    'unsafe_private_directory','unexpected_origin','not_main','dirty_runtime',
    'unverified_runtime_head','unsafe_alice_script','alice_route_mismatch',
    'alice_watcher_lock_exists','alice_service_already_installed',
    'alice_service_already_loaded','unsafe_local_log_parent','unsafe_log_file',
    'unsafe_node_runtime','launchctl_query_unverified']);
   console.log(JSON.stringify(base('blocked',known.has(e.message)?e.message:'preflight_failed')));
   process.exitCode=1;
  }
 }
}
