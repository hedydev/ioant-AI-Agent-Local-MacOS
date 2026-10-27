#!/usr/bin/env node
// Non-mutating OpenClaw upgrade-readiness survey after confirmed
// COMPUTER_HOST_BUSY. Runs official read-only CLI status commands only.
// This is not permission to upgrade, restart, or retire any execution.
// Never prints raw CLI stdout, config, node identity, sessions, app names,
// tokens, Gateway endpoint, URLs, logs or native window contents.
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
const AUDIT='IOANT_CUA_UPGRADE_READINESS_PASSIVE';
const VERSION=['--version'];
const UPDATE=['update','status','--json'];
const GATEWAY=['gateway','status','--json'];
const STATUS=['status','--json','--timeout','15000'];
const BASE={audit:AUDIT,schemaVersion:1,readOnly:true,
 invokedComputerAct:false,inspectedWindowOrBrowser:false,
 launchedGUI:false,changedPermissions:false,changedBrowser:false,
 serviceRestartAttempted:false,updateAttempted:false,
 stateMigrationAttempted:false,computerExecutionReleaseAttempted:false,
 ownerIdentityVerified:false,activeComputerExecutionVerified:false,
 staleComputerExecutionVerified:false,safeToClearComputerOwner:false,
 safeToUpdateWithoutMaintenance:false};
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const ver=x=>typeof x==='string'&&/^20\d{2}\.\d{1,2}\.\d{1,3}$/.test(x)?x:null;
const oneVersion=raw=>{
 if(typeof raw!=='string'||raw.length>300)return null;
 const matches=raw.match(/\b20\d{2}\.\d{1,2}\.\d{1,3}\b/g)??[];
 return matches.length===1?matches[0]:null;
};
const tri=x=>x===true?'yes':x===false?'no':'unknown';
const enumString=(x,valid)=>typeof x==='string'&&valid.has(x)?x:null;
const UPDATE_CHANNELS=new Set(['stable','extended-stable','beta','dev','custom']);
const UPDATE_MODES=new Set(['npm','pnpm','bun','git','source','nix','unknown']);
const STATES=new Set(['running','stopped','loaded','unloaded','healthy',
 'unhealthy','failed','starting','stopping']);
export function sanitizeUpgradeStatus(d){
 const root=obj(d)?d:null;
 const v=root?.result??root;
 const update=obj(v)?v:null;
 const installed=ver(update?.currentVersion)??ver(update?.installedVersion)??ver(update?.version)??null;
 const available=ver(update?.availability?.latestVersion)??
  ver(update?.availability?.version)??null;
 const activeRunKnown=obj(update)&&Object.hasOwn(update,'activeRun');
 const run=activeRunKnown?update.activeRun:undefined;
 return Object.freeze({
  available:update!==null,
  installedVersionReported:installed,
  candidateVersionReported:available,
  updateChannel:enumString(update?.channel,UPDATE_CHANNELS),
  installMethod:enumString(update?.installMethod,UPDATE_MODES)??
   enumString(update?.install?.kind,UPDATE_MODES),
  activeUpdateRun:activeRunKnown?
   (run===null?'no':obj(run)?'yes':'unknown'):'unknown',
  updateHistoryInspected:obj(update?.lastRun),
  hasInspectionErrors:Array.isArray(update?.inspectionErrors)?
   update.inspectionErrors.length>0:'unknown'
 });
}
export function sanitizeGatewayStatus(d){
 const root=obj(d)?d:null;
 const v=root?.result??root;
 const rpc=obj(v?.rpc)?v.rpc:null;
 const service=obj(v?.service)?v.service:null;
 const gateway=obj(v?.gateway)?v.gateway:null;
 const runtime=ver(gateway?.version)??ver(v?.version)??
  ver(service?.version)??null;
 return Object.freeze({
  available:obj(v),
  gatewayRuntimeVersionReported:runtime,
  rpcConnectivity:tri(rpc?.connected??rpc?.ok),
  serviceStatus:enumString(service?.state,STATES)??
   enumString(service?.status,STATES),
  serviceAndRuntimeVersionMatch:'unknown',
  computerOwnerReported:false,
  activeComputerExecutionVerified:false
 });
}
export function sanitizeSystemStatus(d){
 const root=obj(d)?d:null;
 const v=root?.result??root;
 const version=ver(v?.gateway?.version)??ver(v?.gateway?.runtimeVersion)??null;
 // This is a status summary, not an execution ownership registry.
 return Object.freeze({
  available:obj(v),
  gatewayVersionReported:version,
  taskSummaryPresent:obj(v?.tasks)||obj(v?.taskSummary),
  taskOwnerOrExecutionIdRead:false,
  canCertifyNoActiveWork:false
 });
}
async function runCLI(args,ms){
 const {stdout}=await exec(CLI,args,{cwd:RUNTIME,shell:false,
  timeout:ms,maxBuffer:900000});
 if(stdout.length>900000)throw Error('output_ceiling');
 if(args.length===1)return stdout;
 return JSON.parse(stdout);
}
const failure=()=>Object.freeze({available:false,reason:'status_not_available'});
export async function passiveUpgradeReadiness({
 run=runCLI,
 allowedRuntime=async()=>process.platform==='darwin'&&
  ROOT===RUNTIME&&await realpath(RUNTIME)===RUNTIME
}={}){
 if(!await allowedRuntime().catch(()=>false))
  return {...BASE,state:'blocked',reason:'private_macos_runtime_required'};
 let localVersion=null;
 try{localVersion=oneVersion(await run(VERSION,8000))}catch{}
 let update=failure(),gateway=failure(),system=failure();
 try{update=sanitizeUpgradeStatus(await run(UPDATE,35000))}catch{}
 try{gateway=sanitizeGatewayStatus(await run(GATEWAY,18000))}catch{}
 try{system=sanitizeSystemStatus(await run(STATUS,22000))}catch{}
 const gatewayRuntimeVersion=gateway.gatewayRuntimeVersionReported??
  system.gatewayVersionReported??null;
 return {...BASE,state:'observed',
  localCliVersion:localVersion,
  gatewayRuntimeVersion,
  localAndGatewayVersionMatch:localVersion&&gatewayRuntimeVersion?
   localVersion===gatewayRuntimeVersion:'unknown',
  update,
  gateway,
  system,
  hostBusyCodeNotRecheckedInThisRun:true,
  upgradeCompatibilityVerified:false,
  maintenanceWindowVerified:false,
  rollbackBackupVerified:false,
  upgradeRequiresSeparateApproval:true
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=process.argv.length===2?await passiveUpgradeReadiness():
  {...BASE,state:'blocked',reason:'unsupported_args'};
 console.log(JSON.stringify(result));
 if(result.state!=='observed')process.exitCode=1;
}
