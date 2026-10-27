#!/usr/bin/env node
// Read-only native Mac Computer Use app-inventory capability check.
// This does not enumerate browser tabs or inspect UI/page data.
// Native reply is classified but NEVER printed or persisted.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {realpath} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chooseConnectedMacNode} from './openclaw-mac-visual.mjs';
import {classifiedComputerReply} from './openclaw-native-computer-readonly-smoke.mjs';
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(homedir(),'Library','Application Support','ioant-openclaw-ops','runtime');
const CLI=join(homedir(),'.openclaw','bin','openclaw');
const exec=promisify(execFile);
const AUDIT='IOANT_MAC_NATIVE_APP_INVENTORY_SMOKE';
const EXACT_CODES=new Set([
 'COMPUTER_UNSUPPORTED_ACTION','COMPUTER_CONTRACT_MISMATCH',
 'COMPUTER_DRIVER_UNAVAILABLE','COMPUTER_DISABLED',
 'ACCESSIBILITY_REQUIRED','COMPUTER_STALE_OBSERVATION',
 'COMPUTER_DRIVER_PACKAGE_MISSING','COMPUTER_DRIVER_VERSION_MISMATCH',
 'COMPUTER_DRIVER_DIGEST_MISMATCH','NODE_BACKGROUND_UNAVAILABLE',
 'NODE_NOT_FOUND','NODE_DISCONNECTED'
]);
// The OpenClaw CLI returns a structured JSON failure on stdout when --json
// is used. Classify fixed native error codes, never echo raw CLI messages,
// usernames, app lists, argument strings or other private diagnostics.
export function classifyNativeFailure(error){
 const chunks=[];
 for(const raw of [error?.stdout,error?.stderr]){
  if(typeof raw==='string')chunks.push(raw.slice(0,12000));
 }
 let message=chunks.join('\n');
 if(typeof error?.stdout==='string'&&error.stdout.length<=12000){
  try{
   const doc=JSON.parse(error.stdout);
   const part=doc?.error?.message;
   if(typeof part==='string')message=part.slice(0,4000)+'\n'+message;
  }catch{}
 }
 const codeMatches=message.match(/\b(?:COMPUTER|NODE|ACCESSIBILITY)_[A-Z_]{3,72}\b/g)??[];
 const code=codeMatches.find(x=>EXACT_CODES.has(x))??null;
 const reason=code?.includes('UNSUPPORTED_ACTION')?'unsupported_action':
  code?.includes('CONTRACT_MISMATCH')?'contract_mismatch':
  code?.includes('DRIVER_')?'driver_unavailable':
  code==='COMPUTER_DISABLED'?'control_disabled':
  code==='ACCESSIBILITY_REQUIRED'?'accessibility_missing':
  code?.startsWith('NODE_')?'node_unavailable':
  /\b(?:unsupported action|not supported|unknown action|invalid action)\b/i.test(message)?
   'unsupported_action':
  /\b(?:permission denied|approval required|not authorized|forbidden)\b/i.test(message)?
   'permission_or_policy_denied':
  /\b(?:timed out|timeout|deadline exceeded)\b/i.test(message)?
   'timeout':
  /\b(?:invalid argument|invalid parameters|invalid params|schema validation)\b/i.test(message)?
   'invalid_parameters':'unclassified';
 const exitCode=Number.isInteger(error?.code)&&error.code>=0&&error.code<=255?
  error.code:null;
 return Object.freeze({errorClass:reason,...(code?{nativeCode:code}:{}),
  ...(exitCode!==null?{cliExitCode:exitCode}:{})});
}
export function makeInventoryArgs(nodeId,executionId){
 if(typeof nodeId!=='string'||nodeId.length===0||nodeId.length>255||
 !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(executionId))
  throw Error('invalid_identity');
 return ['nodes','invoke','--node',nodeId,'--command','computer.act',
  '--params',JSON.stringify({action:'list_apps',executionId}),'--json'];
}
async function call(args,timeout){
 const {stdout}=await exec(CLI,args,{cwd:RUNTIME,timeout,
  maxBuffer:1024*1024,shell:false});
 if(stdout.length>1024*1024)throw Error('oversized');
 return JSON.parse(stdout);
}
export async function inspectNativeAppInventory({request=call,uuid=randomUUID,
 runtimeAllowed=async()=>ROOT===RUNTIME&&await realpath(RUNTIME)===RUNTIME}={}){
 const base={audit:AUDIT,schemaVersion:1,readOnly:true,
  requestedAction:'list_apps',changedDesktop:false,changedBrowser:false,
  browserTabsQueried:false,rawAppNamesReturned:false,chatContentRead:false};
 try{
  if(!await runtimeAllowed())
   return {...base,state:'blocked',reason:'private_runtime_required'};
  let chosen;
  try{chosen=chooseConnectedMacNode(await request(['nodes','status','--json'],18000))}
  catch{return {...base,state:'inconclusive',reason:'paired_mac_status_unavailable'};}
  if(!chosen.computerActAdvertised||!chosen.snapshotAdvertised)
   return {...base,state:'blocked',reason:'computer_capability_not_advertised'};
  let args;
  try{args=makeInventoryArgs(chosen.id,uuid())}
  catch{return {...base,state:'blocked',reason:'invalid_readonly_request'};}
  let body;
  try{body=await request(args,25000)}
  catch(e){return {...base,state:'inconclusive',
   invokedComputerAct:true,reason:'native_call_rejected_or_unavailable',
   ...classifyNativeFailure(e)};}
  const result=classifiedComputerReply(body);
  return {...base,invokedComputerAct:true,...result};
 }catch{return {...base,state:'inconclusive',reason:'preflight_or_probe_failed'};}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let result;
 try{
  if(process.argv.length!==2)throw Error('badargs');
  result=await inspectNativeAppInventory();
 }catch{result={audit:AUDIT,state:'inconclusive',reason:'unhandled_preflight',
  readOnly:true,changedDesktop:false,changedBrowser:false};}
 console.log(JSON.stringify(result));
 if(result.state!=='observed')process.exitCode=1;
}
