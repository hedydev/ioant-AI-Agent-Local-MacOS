#!/usr/bin/env node
// 173: read-only ancestry of the exact running CUA driver processes.
// No screenshots, input, GUI management, shell parsing, service actions,
// user content, browser access, execution release, or app/node restarts.
// PIDs are consumed in memory only; the report contains bounded counts.
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
const AUDIT='IOANT_CUA_DRIVER_ANCESTRY_READONLY';
const MAX_DRIVERS=8,MAX_APPS=16,MAX_DEPTH=8;
const PID=/^[1-9]\d{0,8}$/;
const BASE=Object.freeze({
 audit:AUDIT,schemaVersion:1,readOnly:true,
 computerActInvoked:false,screenshotTaken:false,windowInventoryTaken:false,
 inspectedBrowser:false,changedBrowser:false,chatContentRead:false,
 mouseOrKeyboardUsed:false,changedFocus:false,
 stoppedOrSignaledProcess:false,restartedDriver:false,
 restartedOpenClawApp:false,restartedGateway:false,
 nodeDisconnectAttempted:false,executionReleaseAttempted:false,
 modifiedConfiguration:false,serviceChangeAttempted:false,
 selectedNodeHostAttributionVerified:false,
 computerExecutionOwnerIdentified:false,staleOwnerVerified:false,
 safeToRestartOrRelease:false
});
export function exactPidList(raw,max=MAX_DRIVERS){
 if(typeof raw!=='string'||raw.length>4096)return null;
 const lines=raw.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
 if(lines.length<1||lines.length>max||lines.some(v=>!PID.test(v)))
  return null;
 const ids=[...new Set(lines)];
 return ids.length<=max?ids:null;
}
export function classifyAncestryPath(driverId,appSet,parentAt,depthLimit=MAX_DEPTH){
 if(!PID.test(driverId)||!(appSet instanceof Set)||
  !Number.isInteger(depthLimit)||depthLimit<1||depthLimit>MAX_DEPTH)
  return 'unknown';
 const seen=new Set([driverId]);
 let cursor=driverId;
 for(let i=0;i<depthLimit;i++){
  const parent=parentAt.get(cursor);
  if(typeof parent!=='string'||!PID.test(parent))return 'unknown';
  if(seen.has(parent))return 'unknown';
  if(appSet.has(parent))return i===0?'direct':'indirect';
  if(parent==='1')return 'reached_init_without_app';
  seen.add(parent);
  cursor=parent;
 }
 return 'depth_limited';
}
export function summarizeDriverAncestry(appIds,driverIds,pathResults){
 if(!Array.isArray(appIds)||!Array.isArray(driverIds)||
  !appIds.length||!driverIds.length||appIds.length>MAX_APPS||
  driverIds.length>MAX_DRIVERS||
  appIds.some(v=>!PID.test(v))||driverIds.some(v=>!PID.test(v))||
  !Array.isArray(pathResults)||pathResults.length!==driverIds.length)
  return Object.freeze({state:'inconclusive',
   reason:'bounded_exact_process_observation_unavailable',
   processLineageProven:false,
   currentExecutionOwnerVerified:false});
 const counts={directAppChildCount:0,indirectAppDescendantCount:0,
  reachedInitWithoutAppCount:0,unknownAncestryCount:0,
  depthLimitedCount:0};
 for(const result of pathResults){
  if(result==='direct')counts.directAppChildCount++;
  else if(result==='indirect')counts.indirectAppDescendantCount++;
  else if(result==='reached_init_without_app')counts.reachedInitWithoutAppCount++;
  else if(result==='depth_limited')counts.depthLimitedCount++;
  else counts.unknownAncestryCount++;
 }
 return Object.freeze({
  state:'observed',appProcessCount:appIds.length,
  driverProcessCount:driverIds.length,...counts,
  allDriversDescendFromObservedOpenClawApp:
   counts.directAppChildCount+counts.indirectAppDescendantCount===driverIds.length,
  someDriversNotShownUnderApp:
   counts.reachedInitWithoutAppCount>0,
  currentExecutionOwnerVerified:false,
  appNodeIdentityVerified:false,
  orphanedDriverVerified:false,
  safeToTerminateProcess:false,
  observationPointInTimeOnly:true
 });
}
async function cli(args){
 const {stdout}=await exec(CLI,args,{cwd:RUNTIME,shell:false,
  timeout:15000,maxBuffer:1000000});
 return JSON.parse(stdout);
}
async function pgrep(name){
 try{
  const {stdout}=await exec('/usr/bin/pgrep',['-x',name],
   {cwd:RUNTIME,shell:false,timeout:5000,maxBuffer:4096});
  return stdout;
 }catch{return null}
}
async function parent(pid){
 if(typeof pid!=='string'||!PID.test(pid))return null;
 try{
  const {stdout}=await exec('/bin/ps',['-p',pid,'-o','ppid='],
   {cwd:RUNTIME,shell:false,timeout:4000,maxBuffer:128});
  const p=stdout.trim();
  return PID.test(p)?p:null;
 }catch{return null}
}
export async function inspectCUADriverAncestry({
 nodeStatus=()=>cli(['nodes','status','--json']),
 appPids=()=>pgrep('OpenClaw'),
 driverPids=()=>pgrep('cua-driver'),
 getParent=parent,
 allowedRuntime=async()=>process.platform==='darwin'&&
  ROOT===RUNTIME&&await realpath(RUNTIME)===RUNTIME
}={}){
 if(!await allowedRuntime().catch(()=>false))
  return {...BASE,state:'blocked',reason:'private_macos_runtime_required'};
 let nodeConnected=false,cuaProviderAdvertised=false;
 try{
  const raw=await nodeStatus(),chosen=chooseConnectedMacNode(raw);
  const body=raw?.result??raw;
  const n=body.nodes.find(v=>v?.connected===true&&
   (v.nodeId===chosen.id||v.id===chosen.id));
  nodeConnected=true;
  cuaProviderAdvertised=chosen.computerActAdvertised===true&&
   n?.computerUse?.contractVersion===2&&
   n.computerUse.provider?.id==='cua-computer';
 }catch{}
 const apps=exactPidList(await appPids().catch(()=>null),MAX_APPS);
 const drivers=exactPidList(await driverPids().catch(()=>null),MAX_DRIVERS);
 if(!apps||!drivers)
  return {...BASE,state:'inconclusive',
   reason:'exact_process_list_unavailable_or_too_large',
   nodeConnected,cuaProviderAdvertised,
   driverAncestry:{state:'inconclusive',
    reason:'bounded_exact_process_observation_unavailable'}};
 const parentAt=new Map();
 // Each process ancestor is visited at most once, up to an 8-hop depth.
 // A parent of PID 1 is a stable traversal boundary, not evidence
 // that a driver is abandoned or that an app may be restarted.
 const seenGlobal=new Set();
 for(const driver of drivers){
  let current=driver,seenLocal=new Set([driver]);
  for(let level=0;level<MAX_DEPTH;level++){
   if(parentAt.has(current)){
    const known=parentAt.get(current);
    if(typeof known!=='string'||known==='1'||apps.includes(known)||
     seenLocal.has(known))break;
    current=known;seenLocal.add(current);
    continue;
   }
   if(seenGlobal.size>=MAX_DRIVERS*MAX_DEPTH)break;
   seenGlobal.add(current);
   const p=await getParent(current).catch(()=>null);
   parentAt.set(current,typeof p==='string'&&PID.test(p)?p:null);
   if(typeof p!=='string'||!PID.test(p)||p==='1'||
    apps.includes(p)||seenLocal.has(p))break;
   current=p;seenLocal.add(current);
  }
 }
 const appSet=new Set(apps);
 const paths=drivers.map(d=>classifyAncestryPath(d,appSet,parentAt));
 const summary=summarizeDriverAncestry(apps,drivers,paths);
 return {...BASE,state:'observed',nodeConnected,cuaProviderAdvertised,
  driverAncestry:summary,
  note:'ancestor_chain_not_proof_of_selected_node_or_current_execution_owner'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const r=process.argv.length===2?await inspectCUADriverAncestry():
  {...BASE,state:'blocked',reason:'unsupported_arguments'};
 console.log(JSON.stringify(r));
 if(r.state!=='observed')process.exitCode=1;
}
