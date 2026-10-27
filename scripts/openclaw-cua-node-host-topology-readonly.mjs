#!/usr/bin/env node
// 171: identify which macOS Node lifecycle is actually installed before
// any recovery. Strictly passive: no computer.act, UI, browser, kill,
// launchctl, CLI restart, owner close, or config mutation.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chooseConnectedMacNode} from './openclaw-mac-visual.mjs';
const exec=promisify(execFile);
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(homedir(),'Library','Application Support','ioant-openclaw-ops','runtime');
const CLI=join(homedir(),'.openclaw','bin','openclaw');
const AUDIT='IOANT_CUA_NODE_HOST_TOPOLOGY_READONLY';
const BASE={
 audit:AUDIT,schemaVersion:1,readOnly:true,
 browserAccess:false,changedBrowser:false,chatContentRead:false,
 invokedComputerAct:false,desktopOrWindowInspected:false,
 screenshotTaken:false,mouseOrKeyboardUsed:false,
 restartedNode:false,restartedGateway:false,quitApplication:false,
 changedServices:false,ownerReleased:false,
 currentComputerOwnerVerified:false,computerLeaseIsStale:false,
 safeToRestartNode:false,hostKindIndependentlyVerified:false
};
const STATUS=['nodes','status','--json'];
const HEADLESS=['node','status','--json'];
const APP=['-x','OpenClaw'];
const DRIVER=['-x','cua-driver'];
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const stateValues=new Set(['running','stopped','unloaded','loaded','installed',
 'not_installed','inactive','active','unknown','failed','not-running']);
export function summarizeNodeHost(raw){
 const selected=chooseConnectedMacNode(raw);
 const d=raw?.result??raw;
 const n=d.nodes.find(x=>x?.connected===true&&
  (x.nodeId===selected.id||x.id===selected.id));
 const descriptor=n?.computerUse;
 return Object.freeze({
  connectedMacNode:true,
  computerActAdvertised:selected.computerActAdvertised,
  cuaProviderV2Advertised:descriptor?.contractVersion===2&&
   descriptor?.provider?.id==='cua-computer',
  nodeHostProcessIdentityReported:false,
  executionOwnerReported:false
 });
}
export function summarizeHeadlessNodeStatus(raw){
 const d=raw?.result??raw;
 const s=obj(d?.service)?d.service:obj(d)?d:null;
 const known=s===null?null:typeof s.installed==='boolean'?s.installed:
  typeof s.registered==='boolean'?s.registered:null;
 const status=typeof s?.state==='string'&&stateValues.has(s.state)?
  s.state:typeof s?.status==='string'&&stateValues.has(s.status)?
   s.status:'unknown';
 return Object.freeze({
  cliStatusReturned:obj(d),
  managedServiceInstalled:known,
  headlessServiceState:status,
  // A service running on the same Mac does NOT prove the selected CUA
  // node belongs to that service; the Mac app may own a separate Node.
  selectedMacNodeIsThisServiceVerified:false
 });
}
export function summarizeExactProcess(result){
 if(result?.error){
  if(result.error.code===1)return Object.freeze({
   observed:false,querySucceeded:true,absenceProven:false});
  return Object.freeze({observed:false,querySucceeded:false,
   absenceProven:false});
 }
 const rows=typeof result?.stdout==='string'?
  result.stdout.split(/\r?\n/).filter(x=>/^[1-9]\d{0,8}$/.test(x)):[];
 return Object.freeze({
  observed:rows.length>0,querySucceeded:true,absenceProven:false
 });
}
const processCheck=async name=>{
 try{
  const stdout=(await exec('/usr/bin/pgrep',name,{cwd:RUNTIME,
   timeout:6000,maxBuffer:2000,shell:false})).stdout;
  return {stdout};
 }catch(error){return {error:{code:error?.code}}}
};
async function readNodeStatus(args){
 const {stdout}=await exec(CLI,args,{cwd:RUNTIME,
  timeout:18000,maxBuffer:1024*1024,shell:false});
 return JSON.parse(stdout);
}
export async function inspectMacNodeHostTopology({
 selected=()=>readNodeStatus(STATUS),
 headless=()=>readNodeStatus(HEADLESS),
 app=()=>processCheck(APP),
 driver=()=>processCheck(DRIVER),
 allowedRuntime=async()=>process.platform==='darwin'&&
  ROOT===RUNTIME&&await realpath(RUNTIME)===RUNTIME
}={}){
 if(!await allowedRuntime().catch(()=>false))
  return {...BASE,state:'blocked',reason:'private_macos_runtime_required'};
 let node={available:false},service={cliStatusReturned:false},
  macApp={observed:false,querySucceeded:false},
  cuaDriver={observed:false,querySucceeded:false};
 try{node=summarizeNodeHost(await selected())}
 catch{node={available:false,reason:'mac_node_status_unavailable'}}
 try{service=summarizeHeadlessNodeStatus(await headless())}
 catch{service={cliStatusReturned:false,managedServiceInstalled:null,
  headlessServiceState:'unknown'}}
 try{macApp=summarizeExactProcess(await app())}catch{}
 try{cuaDriver=summarizeExactProcess(await driver())}catch{}
 return {...BASE,state:'observed',node,service,macApp,cuaDriver,
  appOwnedHostPossible:macApp.observed&&node.connectedMacNode===true,
  headlessHostPossible:service.managedServiceInstalled===true,
  note:'process_and_service_observations_cannot_attribute_exact_node_or_owner',
  recoveryRequiresSeparateOperatorApproval:true};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const r=process.argv.length===2?await inspectMacNodeHostTopology():
  {...BASE,state:'blocked',reason:'unsupported_arguments'};
 console.log(JSON.stringify(r));
 if(r.state!=='observed')process.exitCode=1;
}
