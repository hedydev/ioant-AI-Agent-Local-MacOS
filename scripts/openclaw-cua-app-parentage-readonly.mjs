#!/usr/bin/env node
// 172: independent, passive process parentage attestation for app-owned
// embedded CUA driver. No computer.act, UI, browser, configuration,
// screenshot, launchctl, signals, node restart, or execution close.
// Never return PID/PPID, command lines, executable paths or node identity.
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
const AUDIT='IOANT_CUA_APP_CHILD_OWNERSHIP_READONLY';
const BASE={audit:AUDIT,schemaVersion:1,readOnly:true,
 browserAccess:false,chatContentRead:false,changedBrowser:false,
 inspectedWindowsOrScreen:false,invokedComputerAct:false,
 clickedOrTyped:false,restartedNode:false,restartedGateway:false,
 restartedDriver:false,quitOpenClawApp:false,signaledAnyProcess:false,
 clearedComputerOwner:false,changedPermissions:false,
 computerExecutionOwnerVerified:false,computerOwnerStaleVerified:false,
 safeToRestartOrDisconnect:false};
const pidValid=x=>typeof x==='string'&&/^[1-9]\d{0,8}$/.test(x);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function parseExactPids(output){
 if(typeof output!=='string'||output.length>5000)return null;
 const lines=output.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 if(lines.length>32||lines.some(x=>!pidValid(x)))return null;
 return [...new Set(lines)];
}
export function parentageEvidence({appIds,driverIds,parentByDriver}){
 if(!Array.isArray(appIds)||!Array.isArray(driverIds)||
   !(parentByDriver instanceof Map)||!appIds.length||!driverIds.length||
   appIds.length>32||driverIds.length>32||
   appIds.some(x=>!pidValid(x))||driverIds.some(x=>!pidValid(x)))
  return Object.freeze({state:'inconclusive',
   reason:'process_identity_or_parentage_unverified',
   appProcessObserved:Array.isArray(appIds)&&appIds.length>0,
   driverProcessObserved:Array.isArray(driverIds)&&driverIds.length>0,
   driverDirectAppChildVerified:false});
 const appSet=new Set(appIds);
 const parents=driverIds.map(pid=>parentByDriver.get(pid));
 if(parents.some(x=>!pidValid(x)))
  return Object.freeze({state:'inconclusive',
   reason:'process_parentage_incomplete',
   appProcessObserved:true,driverProcessObserved:true,
   driverDirectAppChildVerified:false});
 const childCount=parents.filter(x=>appSet.has(x)).length;
 return Object.freeze({state:'observed',
  appProcessObserved:true,driverProcessObserved:true,
  driverDirectAppChildVerified:childCount>0,
  allObservedDriversDirectAppChildren:childCount===driverIds.length,
  appOwnedProviderExecutionVerified:false,
  currentComputerOwnerIdentified:false,
  safeToResetDriver:false});
}
async function invoke(binary,args,timeout){
 const {stdout}=await exec(binary,args,{cwd:RUNTIME,timeout,
  maxBuffer:300000,shell:false});
 return stdout;
}
async function pidList(name){
 try{return parseExactPids(await invoke('/usr/bin/pgrep',['-x',name],6000))}
 catch{return null}
}
async function parentId(pid){
 if(!pidValid(pid))return null;
 try{
  const out=await invoke('/bin/ps',['-p',pid,'-o','ppid='],6000);
  const s=out.trim();
  return pidValid(s)?s:null;
 }catch{return null}
}
async function macNodeStatus(){
 const raw=await invoke(CLI,['nodes','status','--json'],16000);
 return JSON.parse(raw);
}
export async function inspectCUAAppParentage({
 nodeStatus=macNodeStatus,
 apps=()=>pidList('OpenClaw'),
 drivers=()=>pidList('cua-driver'),
 parent=parentId,
 allowedRuntime=async()=>process.platform==='darwin'&&
  ROOT===RUNTIME&&await realpath(RUNTIME)===RUNTIME
}={}){
 if(!await allowedRuntime().catch(()=>false))
  return {...BASE,state:'blocked',reason:'private_macos_runtime_required'};
 let nodeConnected=false,cuaNodeAdvertised=false;
 try{
  const n=chooseConnectedMacNode(await nodeStatus());
  nodeConnected=true;
  cuaNodeAdvertised=n.computerActAdvertised;
 }catch{}
 const appIds=await apps().catch(()=>null);
 const driverIds=await drivers().catch(()=>null);
 const parentByDriver=new Map();
 if(Array.isArray(appIds)&&Array.isArray(driverIds)&&
  appIds.length>0&&appIds.length<=32&&driverIds.length<=32&&
  appIds.every(pidValid)&&driverIds.every(pidValid)){
  for(const pid of driverIds)
   parentByDriver.set(pid,await parent(pid).catch(()=>null));
 }
 const evidence=parentageEvidence({appIds,driverIds,parentByDriver});
 return {...BASE,state:'observed',nodeConnected,cuaNodeAdvertised,
  parentage:evidence,
  selectedNodeHostAttributionVerified:false,
  hostRecoveryAuthorized:false,
  note:'driver_parentage_does_not_prove_computer_execution_owner_or_safe_reconnect'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const r=process.argv.length===2?await inspectCUAAppParentage():
  {...BASE,state:'blocked',reason:'unsupported_arguments'};
 console.log(JSON.stringify(r));
 if(r.state!=='observed')process.exitCode=1;
}
