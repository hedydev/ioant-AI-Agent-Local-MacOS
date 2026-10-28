#!/usr/bin/env node
// Independent, bounded, read-only Mac Worker guard.
// 'watch' only persists private, same-chat-scoped incident tickets.
// It NEVER calls the browser, sends messages, changes LaunchAgents,
// issues Computer Use actions, kills processes, or migrates chat routes.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {constants as C} from 'node:fs';
import {lstat,realpath,readFile,open,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {installedPlistBinding,parseLaunchdRuntime} from './ops-supervisor.mjs';
import {aliceCoordinatorManifest,recognizeAliceCoordinatorPlist}
 from './alice-coordinator-service.mjs';
import {chatKey} from './protocol.mjs';
import {classifyGuardObservation,classifyWorkerLogTail,
 evaluateGuardHandoff} from './guard-worker-core.mjs';
const exec=promisify(execFile);
const HOME=homedir();
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(HOME,'Library','Application Support','ioant-openclaw-ops','runtime');
const GUARD=join(HOME,'Library','Application Support','ioant-openclaw-ops','guard');
const CACHE='/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos';
const SERVICES=Object.freeze([
 {key:'openclaw-workflow',label:'com.ioant.openclaw.safe-watcher',
  log:join(HOME,'Library','Logs','ioant-openclaw-ops','stderr.log')},
 {key:'alice-ai',label:'com.ioant.openclaw.alice-coordinator',
  log:join(HOME,'Library','Logs','ioant-openclaw-ops','alice-coordinator','stderr.log')}
]);
const AUDIT='IOANT_GUARD_WORKER';
const JOURNAL=join(GUARD,'incidents.jsonl');
const privateEntry=s=>s.isFile()&&!s.isSymbolicLink()&&
 (s.mode&0o077)===0&&
 (typeof process.getuid!=='function'||s.uid===process.getuid());
const privateDir=s=>s.isDirectory()&&!s.isSymbolicLink()&&
 (s.mode&0o077)===0&&
 (typeof process.getuid!=='function'||s.uid===process.getuid());
const safeReason=e=>e?.code==='ENOENT'?'absent':'unavailable';
export function safeServiceIdentity(key,plist){
 if(typeof plist!=='string'||plist.length>12000)return null;
 if(key==='openclaw-workflow'){
  const binding=installedPlistBinding(plist);
  return binding?.kind==='local'?{chatUrl:binding.chatUrl,
   conversationId:binding.conversationId}:null;
 }
 if(key==='alice-ai'&&recognizeAliceCoordinatorPlist(plist)){
  const x=aliceCoordinatorManifest();
  return {chatUrl:x.chatUrl,conversationId:x.chatUrl.split('/').at(-1)};
 }
 return null;
}
async function verifiedText(path,max){
 const st=await lstat(path);
 if(!privateEntry(st)||st.size>max||await realpath(path)!==path)
  throw Error('unsafe_private_file');
 return readFile(path,'utf8');
}
async function safeLogTail(path){
 try{
  const st=await lstat(path);
  if(!privateEntry(st)||st.size>16*1024*1024)return {code:null,age:null};
  const n=Math.min(st.size,32768),fd=await open(path,C.O_RDONLY|C.O_NOFOLLOW);
  let text='';
  try{
   if(!privateEntry(await fd.stat()))return {code:null,age:null};
   const buf=Buffer.alloc(n);
   const v=await fd.read(buf,0,n,st.size-n);
   text=buf.subarray(0,v.bytesRead).toString('utf8');
  }finally{await fd.close()}
  return {code:classifyWorkerLogTail(text),
   age:Math.max(0,Math.floor((Date.now()-st.mtimeMs)/1000))};
 }catch{return {code:null,age:null}}
}
async function safePending(url){
 const file=join(CACHE,'chatgpt-loop',chatKey(url),'state.json');
 try{
  const content=await verifiedText(file,512*1024);
  const data=JSON.parse(content);
  const pending=data?.feedbackPending;
  if(pending===null||pending===undefined)return {state:'observed',phase:'none',age:null};
  if(typeof pending!=='object'||Array.isArray(pending))
   return {state:'unavailable',phase:'none',age:null};
  const phase=['prepared','press_intent'].includes(pending.phase)?
   pending.phase:'unknown';
  // mtime age is a conservative proxy for last file update, not the
  // exact send intent's age. No task ID or content is read out.
  const st=await lstat(file);
  return {state:'observed',phase,
   age:Math.max(0,Math.floor((Date.now()-st.mtimeMs)/1000))};
 }catch(e){
  return {state:e?.code==='ENOENT'?'absent':'unavailable',phase:'none',age:null};
 }
}
async function getLaunchStatus(label){
 try{
  const {stdout}=await exec('/bin/launchctl',
   ['print','gui/'+process.getuid()+'/'+label],
   {shell:false,timeout:8500,maxBuffer:180000,cwd:RUNTIME});
  const s=parseLaunchdRuntime(stdout);
  return s.state==='running'?'running':
   s.state==='stopped'?'stopped':'unknown';
 }catch(e){
  if(e?.code===113||e?.code===3)return 'unloaded';
  return 'unknown';
 }
}
export async function scanGuard({
 plistRead=verifiedText,queryStatus=getLaunchStatus,
 pendingRead=safePending,logsRead=safeLogTail
}={}){
 if(process.platform!=='darwin'||ROOT!==RUNTIME||
  await realpath(RUNTIME).catch(()=>null)!==RUNTIME)
  return {audit:AUDIT,schemaVersion:1,state:'blocked',
   reason:'private_mac_runtime_required',readOnly:true};
 const services=[];
 for(const svc of SERVICES){
  const plist=join(HOME,'Library','LaunchAgents',svc.label+'.plist');
  let identity=null;
  try{identity=safeServiceIdentity(svc.key,await plistRead(plist,12000))}
  catch{/* uninstalled or unexpected, no blind trust */}
  const status=await queryStatus(svc.label).catch(()=>'unknown');
  const pending=identity?
   await pendingRead(identity.chatUrl).catch(()=>({state:'unavailable',phase:'none',age:null})):
   {state:'unavailable',phase:'none',age:null};
  const log=await logsRead(svc.log).catch(()=>({code:null,age:null}));
  const report=classifyGuardObservation({
   identityVerified:!!identity,serviceState:status,
   privateState:pending.state,pendingPhase:pending.phase,
   pendingAgeSeconds:pending.age,recentLogCode:log.code,
   recentLogAgeSeconds:log.age
  });
  services.push({projectKey:svc.key,
   ...(identity?{conversationId:identity.conversationId}:{}),
   ...report});
 }
 return {audit:AUDIT,schemaVersion:1,state:'observed',
  readOnly:true,browserAccess:false,desktopInput:false,
  actionsTaken:false,restartsAttempted:false,
  incidentDeliveryAttempted:false,services};
}
async function ensureGuardDirectory(){
 const parent=join(HOME,'Library','Application Support','ioant-openclaw-ops');
 if(!privateDir(await lstat(parent)))throw Error('unsafe_guard_parent');
 try{await mkdir(GUARD,{mode:0o700})}
 catch(e){if(e.code!=='EEXIST')throw e}
 if(!privateDir(await lstat(GUARD))||await realpath(GUARD)!==GUARD)
  throw Error('unsafe_guard_directory');
}
export function incidentKey(service,code,day){
 return createHash('sha256').update(
  [service.projectKey,service.conversationId,code,day].join('|')).digest('hex').slice(0,24);
}
async function persistIncidents(report){
 await ensureGuardDirectory();
 let known=new Set();
 try{
  const old=await verifiedText(JOURNAL,2*1024*1024);
  known=new Set(old.trim().split('\n').filter(Boolean).map(s=>JSON.parse(s).key));
 }catch(e){if(e?.code!=='ENOENT')throw e}
 const pending=[];
 for(const svc of report.services??[]){
  if(!svc.conversationId||svc.identityVerified!==true)continue;
  for(const code of svc.incidentCodes){
   const observedAt=new Date().toISOString();
   const key=incidentKey(svc,code,observedAt.slice(0,10));
   if(known.has(key))continue;
   pending.push({key,projectKey:svc.projectKey,
    conversationId:svc.conversationId,code,observedAt,
    delivery:'queued',messageSent:false});
   known.add(key);
  }
 }
 if(pending.length===0)return {newIncidents:0};
 const fd=await open(JOURNAL,C.O_CREAT|C.O_APPEND|C.O_WRONLY|C.O_NOFOLLOW,0o600);
 try{
  if(!privateEntry(await fd.stat()))throw Error('unsafe_guard_journal');
  for(const p of pending)await fd.writeFile(JSON.stringify(p)+'\n');
  await fd.sync();
 }finally{await fd.close()}
 return {newIncidents:pending.length};
}
async function handoffCheck(projectKey,url){
 if(!SERVICES.some(s=>s.key===projectKey))
  return {audit:'IOANT_GUARD_HANDOFF_CHECK',schemaVersion:1,
   state:'blocked',reason:'unknown_project_service',readOnly:true};
 const r=await scanGuard();
 if(r.state!=='observed')return {...r,audit:'IOANT_GUARD_HANDOFF_CHECK'};
 const svc=r.services.find(x=>x.projectKey===projectKey);
 if(!svc?.conversationId||svc.identityVerified!==true)
  return {audit:'IOANT_GUARD_HANDOFF_CHECK',schemaVersion:1,
   state:'blocked',reason:'current_chat_binding_not_verified'};
 // Source is the exact installed LaunchAgent, not the stale project
 // route registry or a guessed ChatGPT window.
 const label=SERVICES.find(s=>s.key===projectKey).label;
 const plist=await verifiedText(join(HOME,'Library','LaunchAgents',
  label+'.plist'),12000);
 const source=safeServiceIdentity(projectKey,plist);
 const result=evaluateGuardHandoff({oldUrl:source.chatUrl,newUrl:url,
  oldFeedbackClear:svc.feedbackPending===false});
 return {...result,projectKey,currentChatBindingVerified:true,
  currentServiceState:svc.serviceState};
}
async function main(args){
 if(args.length===1&&args[0]==='scan'){
  console.log(JSON.stringify(await scanGuard()));return;
 }
 if(args.length===1&&args[0]==='once'){
  const report=await scanGuard();
  if(report.state!=='observed'){
   console.log(JSON.stringify(report));process.exitCode=1;return;
  }
  const saved=await persistIncidents(report);
  // Scheduled runs are silent when healthy. Avoid unbounded launchd logs.
  if(saved.newIncidents>0)
   console.log(JSON.stringify({audit:AUDIT,schemaVersion:1,
    state:'incident_queued',readOnlyHost:true,browserAccess:false,
    incidentTicketsQueued:saved.newIncidents,chatMessagesSent:0}));
  return;
 }
 if(args.length===3&&args[0]==='handoff-check'){
  console.log(JSON.stringify(await handoffCheck(args[1],args[2])));return;
 }
 if(args.length===1&&args[0]==='watch'){
  for(;;){
   const report=await scanGuard();
   if(report.state!=='observed'){
    console.log(JSON.stringify(report));process.exitCode=1;return;
   }
   const p=await persistIncidents(report);
   console.log(JSON.stringify({audit:AUDIT,schemaVersion:1,
    state:'monitoring',readOnlyHost:true,chatMessagesSent:0,
    incidentTicketsQueued:p.newIncidents,
    registeredServiceCount:report.services.filter(s=>s.identityVerified).length}));
   await new Promise(r=>setTimeout(r,60000));
  }
 }
 console.log(JSON.stringify({audit:AUDIT,schemaVersion:1,state:'blocked',
  reason:'usage_scan_once_watch_or_handoff_check'}));
 process.exitCode=2;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 await main(process.argv.slice(2)).catch(()=>{
  console.log(JSON.stringify({audit:AUDIT,schemaVersion:1,
   state:'inconclusive',reason:'guard_inspection_unavailable',
   browserAccess:false,actionsTaken:false}));
  process.exitCode=1;
 });
}
