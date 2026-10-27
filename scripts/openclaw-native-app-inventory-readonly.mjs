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
export async function inspectNativeAppInventory({request=call,uuid=randomUUID}={}){
 const base={audit:AUDIT,schemaVersion:1,readOnly:true,
  requestedAction:'list_apps',changedDesktop:false,changedBrowser:false,
  browserTabsQueried:false,rawAppNamesReturned:false,chatContentRead:false};
 try{
  if(ROOT!==RUNTIME||await realpath(RUNTIME)!==RUNTIME)
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
  catch{return {...base,state:'inconclusive',reason:'native_call_rejected_or_unavailable'};}
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
