#!/usr/bin/env node
// Read-only macOS CUA runtime readiness audit.
// This does NOT invoke computer.act, enumerate apps/windows, or access a
// browser. It observes one paired-node status and checks an exact process
// name for the app-owned CUA driver. No process IDs or command lines leak.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {realpath} from 'node:fs/promises';
import {chooseConnectedMacNode} from './openclaw-mac-visual.mjs';
const exec=promisify(execFile);
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(homedir(),'Library','Application Support','ioant-openclaw-ops','runtime');
const CLI=join(homedir(),'.openclaw','bin','openclaw');
const AUDIT='IOANT_MAC_CUA_DRIVER_READINESS';
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function summarizeCUANativeStatus(raw){
 const chosen=chooseConnectedMacNode(raw);
 const doc=raw?.result??raw;
 const node=doc?.nodes?.find(n=>n&&(n.nodeId===chosen.id||n.id===chosen.id)&&n.connected===true);
 const use=node?.computerUse;
 const valid=isObj(use)&&use.contractVersion===2&&isObj(use.provider)&&
  use.provider.id==='cua-computer'&&
  typeof use.provider.generation==='string'&&use.provider.generation.length>0&&
  Array.isArray(use.actions)&&Array.isArray(use.deliveryModes);
 return Object.freeze({
  nodeConnected:true,nodeComputerAdvertised:chosen.computerActAdvertised===true,
  nodeScreenAdvertised:chosen.snapshotAdvertised===true,
  cuaDescriptorValid:valid,
  providerCanonicalCua:valid,
  backgroundDeliveryAdvertised:valid&&use.deliveryModes.includes('background'),
  actionsAdvertised:{
   listWindows:valid&&use.actions.includes('list_windows'),
   getWindowState:valid&&use.actions.includes('get_window_state'),
   getCursorPosition:valid&&use.actions.includes('get_cursor_position'),
   setValue:valid&&use.actions.includes('set_value')
  },
  // Node metadata does NOT report the approved Gateway pairing surface,
  // macOS permissions or the CUA daemon's actual action health.
  pairedCommandApprovalProven:false,
  accessibilityGrantIndependentlyVerified:false,
  cuaDriverEndpointVerified:false,
  safeForBackgroundInput:false
 });
}
export function summarizeDriverProcess(result){
 if(result?.error){
  const error=result.error;
  if(error?.code===1)return Object.freeze({
   state:'not_observed',processObserved:false,
   // The app can lazily start its driver. Absence at this instant
   // does not establish a broken computer provider.
   driverUnavailableProven:false});
  return Object.freeze({state:'inconclusive',processObserved:false,
   driverUnavailableProven:false});
 }
 const rows=typeof result?.stdout==='string'?
  result.stdout.split('\n').filter(v=>/^[1-9]\d{0,8}$/.test(v)):[];
 return Object.freeze({
  state:rows.length>0?'observed':'inconclusive',
  processObserved:rows.length>0,
  driverUnavailableProven:false});
}
async function nodeStatus(){
 const {stdout}=await exec(CLI,['nodes','status','--json'],{
  cwd:RUNTIME,timeout:18000,maxBuffer:1024*1024,shell:false});
 return JSON.parse(stdout);
}
async function driverProcess(){
 try{
  const result=await exec('/usr/bin/pgrep',['-x','cua-driver'],{
   cwd:RUNTIME,timeout:6000,maxBuffer:2048,shell:false});
  return summarizeDriverProcess(result);
 }catch(error){return summarizeDriverProcess({error});}
}
export async function inspectMacCUARuntime({
 status=nodeStatus,driver=driverProcess,
 runtimeAllowed=async()=>process.platform==='darwin'&&
  ROOT===RUNTIME&&await realpath(RUNTIME)===RUNTIME
}={}){
 const base={audit:AUDIT,schemaVersion:1,state:'inconclusive',
  readOnly:true,guiLaunched:false,invokedComputerAct:false,
  appOrWindowInventoryCalled:false,screenCapture:false,
  changedBrowser:false,browserAccess:false,chatContentRead:false,
  performedPointerOrKeyboardInput:false};
 try{
  if(!await runtimeAllowed())return {...base,state:'blocked',
   reason:'private_macos_runtime_required'};
  const result=summarizeCUANativeStatus(await status());
  const process=await driver();
  const safeProc=['observed','not_observed','inconclusive'].includes(process?.state)?
   process.state:'inconclusive';
  return {...base,state:'observed',...result,
   driverProcessObservation:safeProc,
   driverProcessObserved:process?.processObserved===true,
   driverUnavailableProven:false};
 }catch{
  return {...base,state:'inconclusive',reason:'native_status_unavailable'};
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=process.argv.length===2?await inspectMacCUARuntime():
  {audit:AUDIT,state:'blocked',reason:'unsupported_arguments',readOnly:true};
 console.log(JSON.stringify(result));
 if(result.state!=='observed')process.exitCode=1;
}
