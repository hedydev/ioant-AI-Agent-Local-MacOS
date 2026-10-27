#!/usr/bin/env node
// One-shot non-mutating native OpenClaw Computer Use smoke.
// Calls only get_cursor_position on the already paired macOS Node.
// NEVER touches browser tabs/DOM, screenshots, apps, windows, keyboard,
// mouse position, focus, ChatGPT, Gateway settings or other nodes.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {realpath} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chooseConnectedMacNode} from './openclaw-mac-visual.mjs';
import {scopedCloseRequest,knownPreAdmissionNativeFailure} from './openclaw-cua-owned-session-guard.mjs';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(homedir(),'Library','Application Support','ioant-openclaw-ops','runtime');
const BIN=join(homedir(),'.openclaw','bin','openclaw');
const AUDIT='IOANT_MAC_NATIVE_COMPUTER_READONLY_SMOKE';
const exec=promisify(execFile);
const REJECTED=new Set(['connected_macos_node_missing','ambiguous_connected_mac_nodes',
  'mac_node_identifier_missing','invalid_node_list']);
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function classifiedComputerReply(doc){
 if(!isObj(doc))return {state:'inconclusive',reason:'invalid_reply'};
 // Never count a transport-only ack as confirmation that the native action ran.
 // Allow common wrapper structures, requiring a nested computer.act envelope.
 const queue=[doc];
 let seen=0;
 while(queue.length&&seen++<12){
  const x=queue.shift();
  if(!isObj(x))continue;
  if(typeof x.ok==='boolean'&&(
   isObj(x.details)||isObj(x.observation)||typeof x.effect==='string'
  ))return {state:x.ok?'observed':'refused',
   reason:x.ok?'native_read_completed':'native_provider_refused'};
  for(const k of ['result','payload','data','response','output','content']){
   const v=x[k];
   if(isObj(v))queue.push(v);
   if(typeof v==='string'&&v.length<16384&&v.trim().startsWith('{')){
    try{const y=JSON.parse(v);if(isObj(y))queue.push(y)}catch{}
   }
  }
 }
 return {state:'inconclusive',reason:'no_native_effect_envelope'};
}
export function makeCursorReadArgs(nodeId,executionId){
 if(typeof nodeId!=='string'||nodeId.length<1||nodeId.length>255||
   !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(executionId))
  throw Error('invalid_node_or_execution_id');
 return ['nodes','invoke','--node',nodeId,'--command','computer.act',
   '--params',JSON.stringify({action:'get_cursor_position',executionId}),
   '--json'];
}
async function cli(args,timeout){
 const {stdout}=await exec(BIN,args,{cwd:RUNTIME,timeout,maxBuffer:1024*1024,shell:false});
 if(stdout.length>1024*1024)throw Error('unexpected_cli_reply');
 return JSON.parse(stdout);
}
export async function inspectNativeComputerRead({call=cli,uuid=randomUUID}={}){
 const base={audit:AUDIT,schemaVersion:1,readOnly:true,mutatedDesktop:false,
   invokedComputerAct:false,requestedAction:'get_cursor_position',
   browserAccess:false,chatContentRead:false};
 try{
  if(ROOT!==RUNTIME||await realpath(RUNTIME)!==RUNTIME)
   return {...base,state:'blocked',reason:'private_runtime_required'};
  let target;
  try{target=chooseConnectedMacNode(await call(['nodes','status','--json'],18000))}
  catch(e){return {...base,state:'blocked',
   reason:REJECTED.has(e.message)?e.message:'node_status_unavailable'};}
  if(!target.snapshotAdvertised||!target.computerActAdvertised)
   return {...base,state:'blocked',reason:'native_computer_not_advertised'};
  let args,executionId;
  try{
   executionId=uuid();
   args=makeCursorReadArgs(target.id,executionId);
  }catch{return {...base,state:'blocked',reason:'invalid_native_request'};}
  let output,preAdmissionDenied=false;
  let closure={attempted:false,acknowledged:false,ownerReleaseVerified:false};
  try{
   const result=await call(args,25000);
   output={...base,invokedComputerAct:true,...classifiedComputerReply(result)};
  }catch(error){
   preAdmissionDenied=knownPreAdmissionNativeFailure(error);
   output={...base,state:'inconclusive',invokedComputerAct:true,
    reason:'native_call_unavailable_or_rejected'};
  }finally{
   if(!preAdmissionDenied){
    closure.attempted=true;
    try{
     const r=await call(scopedCloseRequest(target.id,executionId),15000);
     closure.acknowledged=r?.ok===true||r?.result?.ok===true;
    }catch{}
   }
  }
  return {...output,ownExecutionClosure:closure,existingOwnerReleased:false};
 }catch{return {...base,state:'inconclusive',reason:'local_probe_failure'};}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let result;
 try{
  if(process.argv.length!==2)throw Error('arguments');
  result=await inspectNativeComputerRead();
 }catch{result={audit:AUDIT,state:'inconclusive',reason:'preflight_failure',
  readOnly:true,mutatedDesktop:false,browserAccess:false,chatContentRead:false};}
 console.log(JSON.stringify(result));
 if(result.state!=='observed')process.exitCode=1;
}
