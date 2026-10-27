#!/usr/bin/env node
// 170: passive Mac CUA recovery safety evidence only.
// DOES NOT use computer.act, node invoke, screen, browser, input, app quit,
// Gateway/node restarts, update, lock release, or privileged Mac operations.
// Reports only coarse counts and booleans, never session keys or details.
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
const SUPERVISOR=join(RUNTIME,'stage2','ops-supervisor.mjs');
const AUDIT='IOANT_CUA_OWNER_RECOVERY_READINESS';
const BASE=Object.freeze({
 audit:AUDIT,schemaVersion:1,readOnly:true,
 browserAccess:false,chatContentRead:false,changedBrowser:false,
 invokedComputerAct:false,launchedGUI:false,movedPointer:false,
 performedKeyboardInput:false,screenshotTaken:false,
 inspectedBrowserOrWindows:false,restartedGateway:false,
 restartedNode:false,stoppedWatcher:false,changedPermissions:false,
 changedOpenClawVersion:false,attemptedOwnerRelease:false,
 activeOwnerIdentityKnown:false,activeComputerExecutionVerified:false,
 staleOwnerVerified:false,safeToDisconnectOrRestartNode:false
});
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const count=x=>Number.isInteger(x)&&x>=0&&x<=100000?x:null;
const STATUS=['nodes','status','--json'];
const SESSIONS=['sessions','--all-agents','--active','30','--limit','50','--json'];
const GATEWAY=['gateway','status','--json'];
export function summarizeNodeRecovery(raw){
 const chosen=chooseConnectedMacNode(raw);
 const d=raw?.result??raw;
 const node=d.nodes.find(n=>n&&(n.nodeId===chosen.id||n.id===chosen.id));
 return Object.freeze({
  selectedMacConnected:true,
  nativeComputerAdvertised:chosen.computerActAdvertised,
  nodeStatusIncludesExplicitComputerOwner:
   Object.hasOwn(node,'activeComputerExecution')||
   Object.hasOwn(node,'computerExecutionOwner'),
  // Status metadata may report user activity, not ownership of a
  // run-local computer.act execution. Never use this to clear the lock.
  computerOwnerVerified:false,
  nodeCanBeSafelyRestarted:false
 });
}
export function summarizeSessions(raw){
 const d=raw?.result??raw;
 if(!obj(d))return Object.freeze({available:false,
  recentSessionCount:null,snapshotLimited:true,
  provesNoActiveAgentWork:false});
 const list=Array.isArray(d.sessions)?d.sessions:null;
 const c=list?count(list.length):null;
 return Object.freeze({
  available:list!==null,
  recentSessionCount:c,
  snapshotLimited:d.hasMore===true||d.limitApplied!==null||
   d.limitApplied!==undefined,
  provesNoActiveAgentWork:false
 });
}
export function summarizeGateway(raw){
 const d=raw?.result??raw;
 const rpc=d?.rpc;
 return Object.freeze({
  available:obj(d),
  gatewayRpcConnected:rpc?.connected===true||rpc?.ok===true,
  gatewayOwnerRegistryVerified:false,
  computerOwnerReleased:false
 });
}
export function summarizeWatcher(raw){
 const d=raw?.result??raw;
 const state=d?.state;
 return Object.freeze({
  available:obj(d),
  watcherState:['running','stopped','unloaded','blocked','inconclusive'].includes(state)?
   state:'unknown',
  watcherActiveTaskVerified:false,
  watcherSafeToRestart:false
 });
}
async function readCli(args,timeout=18000){
 const {stdout}=await exec(CLI,args,{cwd:RUNTIME,shell:false,
  timeout,maxBuffer:1300000});
 return JSON.parse(stdout);
}
async function readWatcher(){
 const {stdout}=await exec(process.execPath,[SUPERVISOR,'status'],{
  cwd:RUNTIME,shell:false,timeout:12000,maxBuffer:200000});
 return JSON.parse(stdout);
}
export async function inspectOwnerRecovery({
 nodeStatus=()=>readCli(STATUS),
 sessions=()=>readCli(SESSIONS,25000),
 gateway=()=>readCli(GATEWAY),
 watcher=readWatcher,
 allowedRuntime=async()=>process.platform==='darwin'&&
  ROOT===RUNTIME&&await realpath(RUNTIME)===RUNTIME
}={}){
 if(!await allowedRuntime().catch(()=>false))
  return {...BASE,state:'blocked',reason:'private_macos_runtime_required'};
 let node={available:false},session={available:false},gw={available:false},
  watch={available:false};
 try{node=summarizeNodeRecovery(await nodeStatus())}
 catch{node={available:false,reason:'node_status_unavailable'}}
 try{session=summarizeSessions(await sessions())}
 catch{session={available:false,reason:'sessions_metadata_unavailable',
  provesNoActiveAgentWork:false}}
 try{gw=summarizeGateway(await gateway())}
 catch{gw={available:false,reason:'gateway_status_unavailable'}}
 try{watch=summarizeWatcher(await watcher())}
 catch{watch={available:false,reason:'watcher_status_unavailable'}}
 return {...BASE,state:'observed',node,session,gateway:gw,watcher:watch,
  note:'session_activity_and_node_presence_do_not_prove_computer_owner_released',
  recoveryGate:'requires_operator_approved_maintenance_and_live_work_check'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const r=process.argv.length===2?await inspectOwnerRecovery():
  {...BASE,state:'blocked',reason:'unsupported_arguments'};
 console.log(JSON.stringify(r));
 if(r.state!=='observed')process.exitCode=1;
}
