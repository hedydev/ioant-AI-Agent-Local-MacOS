#!/usr/bin/env node
// 184B: bounded read-only host diagnostics for the app-owned macOS CUA daemon.
// NEVER invoke computer.act, attach to the private driver socket, request TCC
// permissions, use UI automation, or print raw process/log/window contents.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {basename,join,resolve} from 'node:path';
import {lstat,readdir,readFile,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile);
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(homedir(),'Library','Application Support',
 'ioant-openclaw-ops','runtime');
const APP_CUA=join(homedir(),'Library','Application Support',
 'OpenClaw','cua');
const AUDIT='IOANT_CUA_DRIVER_HOST_READONLY';
const COUNTS=Object.freeze({
 socketDirectoriesExamined:0,socketsPresent:0,pidFilesPresent:0,
 pidProcessesAlive:0,cuaProcessIdentityMatches:0
});
const LOG_FLAGS=Object.freeze({
 ready:/embedded CUA ready at/i,
 startupTimeout:/embedded CUA startup timed out/i,
 launchFailure:/embedded CUA launch failed/i,
 unexpectedExit:/embedded CUA exited unexpectedly/i,
 unbundledDriver:/driver is not bundled/i,
 socketError:/socket (?:directory|path)/i,
 pidRecordFailure:/could not record the spawned daemon pid/i
});
export function safeCuaHostLogFlags(text){
 if(typeof text!=='string')return Object.freeze({available:false});
 // Never expose even a single line or arbitrary key/value from unified logs.
 const flags={available:true};
 for(const [key,re] of Object.entries(LOG_FLAGS))flags[key]=re.test(text);
 return Object.freeze(flags);
}
export function safeCuaProcessIdentity(comm){
 if(typeof comm!=='string'||comm.length>4096)return false;
 // ps comm= exposes a *command name*, not proof of an authenticated PID.
 // Require one known CUA daemon basename; never return the path or PID.
 const name=basename(comm.trim());
 return /^(?:cua-driver|cua-driver-rs)(?:-[a-z0-9._-]{1,32})?$/i.test(name);
}
const isOwnedDirectory=(st,privateOnly=false)=>st?.isDirectory()===true&&
 st.isSymbolicLink()===false&&st.uid===process.getuid()&&
 (!privateOnly||(st.mode&0o077)===0);
export async function inspectSocketRoot({root=APP_CUA,stat=lstat,list=readdir,
 read=readFile,ps=exec}={}){
 const report={socketRoot:'unavailable',...COUNTS};
 let st;
 try{st=await stat(root)}catch(e){
  return {...report,socketRoot:e?.code==='ENOENT'?'absent':'unavailable'};
 }
 if(!isOwnedDirectory(st))return report;
 let entries;
 try{entries=await list(root,{withFileTypes:true})}catch{return report}
 report.socketRoot='present';
 const candidates=entries.filter(d=>d.isDirectory()&&
  /^[a-f0-9]{16}$/.test(d.name)).slice(0,16);
 for(const d of candidates){
  const folder=join(root,d.name);
  let folderStat;
  try{folderStat=await stat(folder)}catch{continue}
  if(!isOwnedDirectory(folderStat,true))continue;
  report.socketDirectoriesExamined++;
  try{
   const socket=await stat(join(folder,'cua.sock'));
   if(socket.isSocket()&&!socket.isSymbolicLink()&&
      socket.uid===process.getuid())report.socketsPresent++;
  }catch{}
  try{
   const pidFile=join(folder,'cua.pid'),metadata=await stat(pidFile);
   if(!metadata.isFile()||metadata.isSymbolicLink()||
      metadata.uid!==process.getuid()||metadata.size>32)continue;
   const pidText=(await read(pidFile,'utf8')).trim();
   if(!/^[1-9][0-9]{0,9}$/.test(pidText))continue;
   report.pidFilesPresent++;
   const {stdout}=await ps('/bin/ps',['-p',pidText,'-o','comm='],
    {encoding:'utf8',timeout:2500,maxBuffer:8192,shell:false});
   if(typeof stdout!=='string'||!stdout.trim())continue;
   report.pidProcessesAlive++;
   if(safeCuaProcessIdentity(stdout))report.cuaProcessIdentityMatches++;
  }catch{}
 }
 return report;
}
export async function inspectHostLogs({run=exec}={}){
 try{
  const {stdout}=await run('/usr/bin/log',[
   'show','--last','45m','--style','compact','--predicate',
   'subsystem == "ai.openclaw" AND category == "cua-driver-host"'
  ],{encoding:'utf8',timeout:15000,maxBuffer:2097152,shell:false});
  return safeCuaHostLogFlags(stdout);
 }catch{return {available:false}}
}
export async function cuaDriverHostReadonly({sockets=inspectSocketRoot,
 logs=inspectHostLogs,platform=process.platform,checkRuntime=true}={}){
 const base={audit:AUDIT,schemaVersion:1,readOnly:true,
  invokedComputerAct:false,screenshotTaken:false,desktopInput:false,
  changedBrowser:false,driverSocketConnected:false,changedPermissions:false,
  changedServices:false};
 if(platform!=='darwin')return {...base,state:'blocked',reason:'macos_required'};
 if(checkRuntime){
  try{if(ROOT!==RUNTIME||(await realpath(RUNTIME))!==RUNTIME)
   return {...base,state:'blocked',reason:'private_runtime_required'};
  }catch{return {...base,state:'blocked',reason:'private_runtime_required'}}
 }
 // Read each bounded source independently; never emit raw errors or logs.
 let socketState;
 try{socketState=await sockets()}catch{socketState={socketRoot:'unavailable',...COUNTS}}
 let logState;
 try{logState=await logs()}catch{logState={available:false}}
 return {...base,state:socketState.socketRoot==='unavailable'&&
  logState.available!==true?'inconclusive':'observed',
  socketRoot:['present','absent'].includes(socketState.socketRoot)?
   socketState.socketRoot:'unavailable',
  ...Object.fromEntries(Object.keys(COUNTS).map(k=>[k,
   Number.isInteger(socketState[k])&&socketState[k]>=0&&
   socketState[k]<=16?socketState[k]:null])),
  hostLogs:{available:logState.available===true,
   ...(logState.available===true?Object.fromEntries(
    Object.keys(LOG_FLAGS).map(k=>[k,logState[k]===true])):{})}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 cuaDriverHostReadonly().then(report=>{
  process.stdout.write(JSON.stringify(report)+'\n');
  if(report.state==='blocked')process.exitCode=1;
 }).catch(()=>{
  process.stdout.write(JSON.stringify({
   audit:AUDIT,schemaVersion:1,readOnly:true,state:'inconclusive',
   reason:'diagnostic_unavailable',invokedComputerAct:false,
   screenshotTaken:false,desktopInput:false,changedBrowser:false
  })+'\n');
  process.exitCode=1;
 });
}
