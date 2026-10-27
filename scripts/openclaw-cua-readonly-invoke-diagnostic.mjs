#!/usr/bin/env node
// Strict two-read CUA node-invoke diagnostic. No browser, screenshot,
// window title, app inventory or raw native output is printed or stored.
// A single UUID is used for cursor read and list_windows; both are read-only.
// A denied request ends that branch, with no retry or GUI fallback.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {realpath} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chooseConnectedMacNode} from './openclaw-mac-visual.mjs';
const exec=promisify(execFile);
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(homedir(),'Library','Application Support','ioant-openclaw-ops','runtime');
const CLI=join(homedir(),'.openclaw','bin','openclaw');
const AUDIT='IOANT_CUA_READONLY_INVOKE_DIAGNOSIS';
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const validId=x=>typeof x==='string'&&x.length>0&&x.length<=255;
const uuidPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const allowed=new Set(['get_cursor_position','list_windows']);
export function makeSafeReadArgs(id,uuid,action){
 if(!validId(id)||!uuidPattern.test(uuid)||!allowed.has(action))
  throw Error('only_readonly_native_action_accepted');
 return ['nodes','invoke','--node',id,'--command','computer.act',
  '--params',JSON.stringify({action,executionId:uuid}),'--json'];
}
// Recognize only known public error tokens and fixed semantic categories.
const nativeCodePattern=/\b(?:COMPUTER|NODE|ACCESSIBILITY|SCREEN)_[A-Z_]{3,80}\b/g;
const categories=[
 ['pending_node_approval',/\b(?:pairing|node command|command surface|approved command|pending approval)\b.{0,80}\b(?:pending|denied|not approved|approval|not allowed|unauthorized)\b|\b(?:not approved|approval required)\b.{0,80}\b(?:node|command)\b/i],
 ['gateway_command_policy',/\b(?:command not allowed|command denied|not permitted by policy|blocked by policy|command is not allowed)\b/i],
 ['macos_permission',/\b(?:accessibility|required permission|screen recording|tcc|permission denied)\b/i],
 ['cua_driver_transport',/\b(?:driver.*(?:socket|connection|unavailable|timeout|failed)|socket.*(?:closed|refused|unavailable)|ECONNREFUSED|EPIPE|ENOENT.*cua)\b/i],
 ['native_action_unsupported',/\b(?:unsupported action|invalid action|unknown action|not implemented)\b/i],
 ['execution_session_conflict',/\b(?:execution.*(?:busy|conflict|expired|invalid)|stale.*(?:observation|generation)|active.*session)\b/i],
 ['invalid_native_params',/\b(?:invalid params|invalid parameters|schema validation|contract mismatch)\b/i],
 ['node_unreachable',/\b(?:node disconnected|node not found|node offline|gateway unreachable)\b/i],
 ['native_timeout',/\b(?:timed out|timeout|deadline exceeded)\b/i],
 ['unsupported_cli_command',/\b(?:unknown command|unknown option|unrecognized option|too many arguments)\b/i]
];
const severityMap=new Map([
 ['COMPUTER_DISABLED','macos_permission'],
 ['ACCESSIBILITY_REQUIRED','macos_permission'],
 ['COMPUTER_DRIVER_UNAVAILABLE','cua_driver_transport'],
 ['COMPUTER_DRIVER_PACKAGE_MISSING','cua_driver_transport'],
 ['COMPUTER_DRIVER_VERSION_MISMATCH','cua_driver_transport'],
 ['COMPUTER_CONTRACT_MISMATCH','invalid_native_params'],
 ['COMPUTER_UNSUPPORTED_ACTION','native_action_unsupported'],
 ['COMPUTER_STALE_OBSERVATION','execution_session_conflict'],
 ['NODE_BACKGROUND_UNAVAILABLE','node_unreachable'],
 ['NODE_NOT_FOUND','node_unreachable'],
 ['NODE_DISCONNECTED','node_unreachable']
]);
function safeObjTexts(obj,maxDepth=5){
 const arr=[],queue=[{x:obj,level:0}],seen=new Set();
 while(queue.length&&arr.length<25){
  const {x,level}=queue.shift();
  if(level>maxDepth||x==null)continue;
  if(typeof x==='string'){
   arr.push(x.slice(0,12000));continue;
  }
  if(!isObj(x)||seen.has(x))continue;
  seen.add(x);
  for(const k of ['error','message','code','details','cause','reason','type']){
   if(Object.hasOwn(x,k))queue.push({x:x[k],level:level+1});
  }
 }
 return arr;
}
export function classifyInvokeFailure(err){
 const textParts=[err?.stdout,err?.stderr,err?.message]
  .filter(x=>typeof x==='string').map(x=>x.slice(0,24000));
 let doc;
 try{
  if(typeof err?.stdout==='string'&&err.stdout.length<100000)
   doc=JSON.parse(err.stdout);
 }catch{}
 const text=[...textParts,...safeObjTexts(doc)].join('\n').slice(0,65000);
 const tokens=text.match(nativeCodePattern)??[];
 const code=tokens.find(x=>severityMap.has(x))??null;
 const category=code?severityMap.get(code):
  err?.killed===true||err?.signal==='SIGTERM'?'native_timeout':
  categories.find(([n,pattern])=>pattern.test(text))?.[0]??'unclassified';
 const exitCode=Number.isInteger(err?.code)&&err.code>=0&&err.code<=255?err.code:null;
 return Object.freeze({
  state:'failed',category,
  ...(code?{nativeCode:code}:{}),exitCode,
  stdoutPresent:typeof err?.stdout==='string'&&err.stdout.length>0,
  stderrPresent:typeof err?.stderr==='string'&&err.stderr.length>0,
  structuredErrorBody:isObj(doc)&&(
   isObj(doc.error)||typeof doc.error==='string'||doc.ok===false),
  // Content digest is only to correlate identical failures; never raw text.
  diagnosticDigest:createHash('sha256').update(text).digest('hex').slice(0,12)
 });
}
export function classifyInvokeResult(doc){
 if(!isObj(doc))return Object.freeze({state:'inconclusive',
  reason:'non_json_native_result'});
 // A structured provider rejection with a 0 CLI exit is still a refusal.
 const queue=[{x:doc,depth:0}];const seen=new Set();
 while(queue.length){
  const {x,depth}=queue.shift();
  if(depth>5||!isObj(x)||seen.has(x))continue;
  seen.add(x);
  if(x.ok===false||x.success===false)return Object.freeze({
    state:'refused',reason:'structured_native_refusal'});
  if(x.ok===true&&(isObj(x.details)||isObj(x.observation)||
    typeof x.effect==='string'))return Object.freeze({
    state:'observed',reason:'provider_effect_envelope'});
  for(const k of ['result','payload','data','output','response','content','structuredContent']){
   const value=x[k];
   if(isObj(value))queue.push({x:value,depth:depth+1});
   else if(typeof value==='string'&&value.length<250000&&value.trim().startsWith('{')){
    try{queue.push({x:JSON.parse(value),depth:depth+1})}catch{}
   }
  }
 }
 return Object.freeze({state:'inconclusive',reason:'transport_without_effect_proof'});
}
async function callCli(args,ms){
 const {stdout}=await exec(CLI,args,{cwd:RUNTIME,shell:false,
  timeout:ms,maxBuffer:1024*1024});
 return JSON.parse(stdout);
}
export async function inspectCUAInvokeReads({
 call=callCli,uuid=randomUUID,
 allowedRuntime=async()=>process.platform==='darwin'&&
 ROOT===RUNTIME&&await realpath(RUNTIME)===RUNTIME
}={}){
 const base={audit:AUDIT,schemaVersion:1,readOnly:true,
  changedBrowser:false,browserAccess:false,chatContentRead:false,
  screenshotTaken:false,appsOrWindowsReturned:false,
  invokedComputerInput:false,launchedGUI:false,movedPointer:false,
  changedFocus:false};
 try{
  if(!await allowedRuntime())return {...base,state:'blocked',
   reason:'private_macos_runtime_required'};
  const status=await call(['nodes','status','--json'],18000);
  const chosen=chooseConnectedMacNode(status);
  const body=status?.result??status;
  const node=body.nodes.find(x=>x&&(x.nodeId===chosen.id||x.id===chosen.id));
  const provider=node?.computerUse;
  if(!chosen.computerActAdvertised||provider?.contractVersion!==2||
    provider?.provider?.id!=='cua-computer'||
    typeof provider.provider.generation!=='string'||!provider.provider.generation||
    !Array.isArray(provider.actions)||!allowed.size||
    [...allowed].some(x=>!provider.actions.includes(x)))
   return {...base,state:'blocked',reason:'native_cua_reads_not_advertised'};
  const executionId=uuid();
  const results={};
  for(const action of ['get_cursor_position','list_windows']){
   try{results[action]=classifyInvokeResult(await call(
    makeSafeReadArgs(chosen.id,executionId,action),25000))}
   catch(err){results[action]=classifyInvokeFailure(err);}
   // Do not proceed to a second native call when a permission or policy
   // denial has already been identified. Inconclusive is not a permit.
   if(action==='get_cursor_position'&&
    ['macos_permission','pending_node_approval','gateway_command_policy'].includes(
     results[action].category))break;
  }
  const cursor=results.get_cursor_position;
  const windows=results.list_windows??{state:'skipped',
   reason:'prior_permission_or_policy_denial'};
  return {...base,state:'observed',
   sameExecutionIdUsed:true,
   cursorRead:cursor,
   windowListRead:windows,
   nativeInputAttempted:false,
   nativeWindowDetailsDiscarded:true};
 }catch{return {...base,state:'inconclusive',
  reason:'node_status_or_diagnostic_preflight_failed'};}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=process.argv.length===2?await inspectCUAInvokeReads():
  {audit:AUDIT,state:'blocked',reason:'unsupported_args',readOnly:true};
 console.log(JSON.stringify(result));
 if(result.state!=='observed')process.exitCode=1;
}
