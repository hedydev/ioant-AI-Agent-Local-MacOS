#!/usr/bin/env node
// Bounded, read-only TCC attribution check: no browser or port-file content reads.
import {spawn} from 'node:child_process';
import {lstatSync,openSync,closeSync,constants,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
const AUDIT='IOANT_CHROME_TCC_LIVE_PASSIVE';
const TARGET=join(homedir(),'Library','Application Support','Google','Chrome','DevToolsActivePort');
const MATCH='SystemPolicyAppDataDetailed';
const MAX=256*1024;
export function sanitizeTccEventLines(raw){
 if(typeof raw!=='string')return {eventCount:0,attributionLines:0,candidateResponsibleIdentifiers:[],deniedEventCount:0};
 const lines=raw.slice(0,MAX).split(/\r?\n/).filter(s=>s.includes(MATCH));
 const ids=new Set();let attributionLines=0,deniedEventCount=0;
 for(const line of lines){
  if(line.includes('AUTHREQ_ATTRIBUTION')||line.includes('responsible=')){
   attributionLines++;
   const m=line.match(/responsible\s*=\s*\{[^}\r\n]{0,500}?\bidentifier\s*=\s*([A-Za-z0-9_.-]{1,128})/);
   if(m)ids.add(m[1]);
  }
  if(/AUTHREQ_RESULT|Denied|authValue\s*=\s*0/.test(line))deniedEventCount++;
 }
 return {eventCount:lines.length,attributionLines,candidateResponsibleIdentifiers:[...ids].slice(0,8),deniedEventCount};
}
export function safeOpenClose(path){
 try{
  if(!lstatSync(path).isFile())return {state:'blocked',reason:'not_regular_file'};
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  closeSync(fd);return {state:'opened_closed',reason:null};
 }catch(e){return {state:'open_failed',reason:['EPERM','EACCES','ENOENT','ELOOP'].includes(e?.code)?e.code:'other'};}
}
export async function captureLive(){
 if(process.platform!=='darwin')return {audit:AUDIT,state:'blocked',reason:'macos_only'};
 let proc,output='',overLimit=false,stderrSeen=false,spawnError=false,exited=false;
 try{
  proc=spawn('/usr/bin/log',['stream','--info','--debug','--style','compact',
   '--predicate','process == "tccd" AND eventMessage CONTAINS[c] "SystemPolicyAppDataDetailed"'],
   {stdio:['ignore','pipe','pipe'],shell:false});
 }catch{return {audit:AUDIT,state:'blocked',reason:'log_spawn_failed'};}
 proc.on('error',()=>{spawnError=true;});
 proc.on('exit',()=>{exited=true;});
 proc.stdout?.on('data',b=>{
  if(output.length>=MAX){overLimit=true;return;}
  const text=String(b);
  if(text.length>MAX-output.length)overLimit=true;
  output+=text.slice(0,MAX-output.length);
 });
 proc.stderr?.on('data',()=>{stderrSeen=true;});
 await new Promise(r=>setTimeout(r,1150));
 const access=safeOpenClose(TARGET);
 await new Promise(r=>setTimeout(r,2400));
 const exitedBeforeStop=exited;
 if(!exited){try{proc.kill('SIGTERM');}catch{}}
 await new Promise(r=>setTimeout(r,250));
 return {audit:AUDIT,schemaVersion:1,state:'observed',
  uid:process.getuid?.()??null,euid:process.geteuid?.()??null,
  access,logStream:{spawnError,stderrSeen,exitedBeforeStop,bufferLimitReached:overLimit,
   ...sanitizeTccEventLines(output)},fileContentRead:false,portOpened:access.state==='opened_closed',
  browserCalled:false,tccDatabaseQueried:false,rawLogOutput:false,
  permissionsChanged:false,serviceRestarted:false,
  attributionToAccess:'unproven_if_multiple_events'};
}
if(process.argv[1]&&realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url))){
 if(process.argv.length!==2){console.log(JSON.stringify({audit:AUDIT,state:'blocked',reason:'no_arguments_supported'}));process.exitCode=2;}
 else console.log(JSON.stringify(await captureLive()));
}
