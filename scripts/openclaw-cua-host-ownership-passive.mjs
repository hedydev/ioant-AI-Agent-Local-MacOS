#!/usr/bin/env node
// Passive OpenClaw computer-host ownership evidence audit.
// No computer.act, native screen/window query, GUI, browser, process
// restart, lock release, node disconnect, or permission change.
// Read only a small already-redacted Gateway logs tail via official CLI.
// Never print raw log lines, execution IDs, app names, tokens or paths.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const exec=promisify(execFile);
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(homedir(),'Library','Application Support','ioant-openclaw-ops','runtime');
const CLI=join(homedir(),'.openclaw','bin','openclaw');
const AUDIT='IOANT_CUA_HOST_OWNERSHIP_PASSIVE';
const LOG_ARGS=['logs','--json','--limit','1000','--max-bytes','250000'];
const VERSION_ARGS=['--version'];
const BOUND=300000;
const base={audit:AUDIT,schemaVersion:1,readOnly:true,
 invokedComputerAct:false,computerReadCalls:0,changedDesktop:false,
 movedPointer:false,performedKeyboardInput:false,screenshotTaken:false,
 browserAccess:false,changedBrowser:false,rawGatewayLogsEmitted:false,
 gatewayServiceRestarted:false,ownerReleaseAttempted:false,
 nodeDisconnectAttempted:false,changedPermissions:false};

export function parseSafeOpenClawVersion(raw){
 const value=typeof raw==='string'?raw.slice(0,200):'';
 const matches=value.match(/\b20\d{2}\.\d{1,2}\.\d{1,3}\b/g)??[];
 return matches.length===1?matches[0]:null;
}
export function classifyPassiveLogTail(raw){
 if(typeof raw!=='string'||raw.length>BOUND)
  return Object.freeze({state:'inconclusive',reason:'log_tail_unavailable_or_oversized'});
 const lines=raw.split(/\r?\n/).filter(x=>x.length>0).slice(-1000);
 const exact=lines.filter(x=>/\bCOMPUTER_HOST_BUSY\b/.test(x));
 const phrase=lines.filter(x=>/another provider execution owns this computer/i.test(x));
 const mismatch=lines.filter(x=>/\bCOMPUTER_EXECUTION_(?:ID|OWNER|MISMATCH)\b/.test(x));
 const closing=lines.filter(x=>/\b__close_execution\b/.test(x));
 // Presence and counts prove only what this small log tail recorded.
 // A release log entry is NOT proof that the exact owner was released.
 return Object.freeze({
  state:'observed',
  inspectedLines:lines.length,
  exactComputerHostBusyCodeObserved:exact.length>0,
  exactHostBusyCodeOccurrences:Math.min(exact.length,1000),
  hostBusyOwnershipPhraseObserved:phrase.length>0,
  executionMismatchCodeObserved:mismatch.length>0,
  closeExecutionMentioned:closing.length>0,
  currentOwnerVerified:false,
  staleOwnerVerified:false,
  activeExecutionVerified:false,
  safeToReleaseOwner:false
 });
}
async function readCLI(args,timeout){
 const {stdout}=await exec(CLI,args,{
  cwd:RUNTIME,timeout,maxBuffer:450000,shell:false});
 return stdout;
}
export async function passiveCUAHostAudit({
 run=readCLI,
 allowedRuntime=async()=>process.platform==='darwin'&&
  ROOT===RUNTIME&&await realpath(RUNTIME)===RUNTIME
}={}){
 try{
  if(!await allowedRuntime())return {...base,state:'blocked',
   reason:'private_macos_runtime_required'};
  let version=null;
  try{version=parseSafeOpenClawVersion(await run(VERSION_ARGS,8000))}catch{}
  let log;
  try{log=await run(LOG_ARGS,20000)}
  catch{return {...base,state:'inconclusive',
   installedOpenClawVersion:version,
   reason:'gateway_log_tail_unavailable'};}
  const evidence=classifyPassiveLogTail(log);
  return {...base,state:evidence.state,installedOpenClawVersion:version,
   logTail:evidence};
 }catch{
  return {...base,state:'inconclusive',
   reason:'passive_audit_preflight_failed'};
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=process.argv.length===2?await passiveCUAHostAudit():
  {...base,state:'blocked',reason:'unsupported_arguments'};
 console.log(JSON.stringify(result));
 if(result.state!=='observed')process.exitCode=1;
}
