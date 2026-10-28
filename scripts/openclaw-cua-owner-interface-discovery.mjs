#!/usr/bin/env node
// Passive inventory of the locally installed OpenClaw computer-owner API.
// Never call computer.act, open a window, write to a file, clear an owner,
// restart services, or output source code, names, paths, tokens or raw logs.
import {realpathSync,existsSync,readdirSync,statSync,readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,dirname,extname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {passiveCUAHostAudit} from './openclaw-cua-host-ownership-passive.mjs';

const AUDIT='IOANT_CUA_OWNER_INTERFACE_DISCOVERY';
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const EXPECTED=join(homedir(),'Library','Application Support','ioant-openclaw-ops','runtime');
const MAX_FILES=2500,MAX_FILE_BYTES=2_000_000,MAX_DEPTH=5;
const PATTERNS=Object.freeze({
 closeExecution:/__close_execution/,
 hostBusy:/COMPUTER_HOST_BUSY/,
 activeOwner:/activeComputerExecution|computerExecutionOwner/,
 ownerQuery:/get_execution_status|getExecutionStatus|queryExecutionOwner|computerOwnerStatus/,
 ownerRegistry:/executionOwner|ownerRegistry|activeExecutionOwner/
});
export function sourcePatternSignals(source){
 const result={};
 for(const [name,pattern] of Object.entries(PATTERNS))
  result[name]=typeof source==='string'&&pattern.test(source);
 return Object.freeze(result);
}
// Per-file co-location hints only. Never expose source or path information.
// A token near a status/owner keyword is not a callable API contract.
export function sourceOwnerCohesion(source){
 const f=sourcePatternSignals(source);
 const str=typeof source==='string'?source:'';
 const owner=f.ownerRegistry;
 return Object.freeze({
  registryWithClose:owner&&f.closeExecution,
  registryWithBusy:owner&&f.hostBusy,
  closeWithBusy:f.closeExecution&&f.hostBusy,
  registryWithStatusWords:owner&&
   /(?:inspect|status|query|read|get)(?:.{0,32})(?:execution|owner|lease)/i.test(str),
  registryWithMutationWords:owner&&
   /(?:release|clear|delete|revoke|terminate)(?:.{0,32})(?:execution|owner|lease)/i.test(str),
  closeWithOwnerState:f.closeExecution&&
   /(?:owner|lease|executionId|execution_id)/i.test(str),
  candidateStatusAction:/(?:__get_execution_status|__query_execution_owner|getExecutionOwnerStatus|queryComputerExecutionStatus)/.test(str)
 });
}
const cohortKeys=['registryWithClose','registryWithBusy','closeWithBusy',
 'registryWithStatusWords','registryWithMutationWords','closeWithOwnerState',
 'candidateStatusAction'];
function installRoots(){
 const home=homedir();
 const candidates=[];
 try{
  candidates.push(dirname(realpathSync(join(home,'.openclaw','bin','openclaw'))));
 }catch{}
 for(const p of [
  '/Applications/OpenClaw.app/Contents/Resources',
  join(home,'Applications','OpenClaw.app','Contents','Resources'),
  '/opt/homebrew/lib/node_modules/openclaw',
  '/usr/local/lib/node_modules/openclaw'
 ])if(existsSync(p))candidates.push(p);
 return [...new Set(candidates)];
}
export function summarizeOwnerInterfaceScan({filesInspected,rootsFound,hitCounts,
 cohortCounts={},truncated=false}){
 const counts={};
 for(const key of Object.keys(PATTERNS)){
  const n=hitCounts?.[key];
  counts[key]=Number.isSafeInteger(n)&&n>=0?Math.min(n,MAX_FILES):0;
 }
 return Object.freeze({
  rootsFound,filesInspected,scanTruncated:truncated,
  patternHitFiles:counts,
  ownerSourceCoLocation:Object.freeze(Object.fromEntries(cohortKeys.map(k=>
   [k,Number.isSafeInteger(cohortCounts?.[k])&&cohortCounts[k]>=0?
    Math.min(cohortCounts[k],MAX_FILES):0]))),
  // Text patterns are not a callable, independently authenticated API.
  interfaceVerified:false,ownerReleaseVerified:false
 });
}
function scanInstalledSources(roots){
 const queue=roots.map(dir=>({dir,depth:0}));
 const visited=new Set(),counts=Object.fromEntries(
  Object.keys(PATTERNS).map(x=>[x,0]));
 const cohort=Object.fromEntries(cohortKeys.map(k=>[k,0]));
 const excluded=new Set(['.git','docs','test','tests','cache']);
 let inspected=0;
 while(queue.length&&inspected<MAX_FILES){
  const {dir,depth}=queue.shift();
  if(visited.has(dir)||depth>MAX_DEPTH)continue;
  visited.add(dir);
  let entries;
  try{entries=readdirSync(dir,{withFileTypes:true})}catch{continue}
  for(const ent of entries){
   if(inspected>=MAX_FILES)break;
   if(ent.isSymbolicLink())continue;
   const p=join(dir,ent.name);
   if(ent.isDirectory()){
    if(depth<MAX_DEPTH&&!excluded.has(ent.name))
     queue.push({dir:p,depth:depth+1});
    continue;
   }
   if(!ent.isFile()||!['.js','.mjs','.cjs','.ts'].includes(extname(ent.name)))
    continue;
   let size;
   try{size=statSync(p).size}catch{continue}
   if(size>MAX_FILE_BYTES||size<0)continue;
   inspected++;
   let body;
   try{body=readFileSync(p,'utf8')}catch{continue}
   const signals=sourcePatternSignals(body);
   for(const key of Object.keys(counts))if(signals[key])counts[key]++;
   const second=sourceOwnerCohesion(body);
   for(const key of cohortKeys)if(second[key])cohort[key]++;
  }
 }
 return summarizeOwnerInterfaceScan({filesInspected:inspected,
  rootsFound:roots.length,hitCounts:counts,cohortCounts:cohort,
  truncated:inspected===MAX_FILES||queue.length>0});
}
export async function inspectOwnerInterface({
 roots=installRoots,passive=passiveCUAHostAudit,scan=scanInstalledSources
}={}){
 if(process.platform!=='darwin'||ROOT!==EXPECTED){
  return {audit:AUDIT,state:'blocked',reason:'private_macos_runtime_required',
   readOnly:true,invokedComputerAct:false};
 }
 let ownerLogs={state:'inconclusive'};
 try{ownerLogs=await passive()}catch{}
 let local=null;
 try{local=scan(roots())}catch{}
 const tail=ownerLogs?.logTail??{};
 return Object.freeze({
  audit:AUDIT,state:local?'observed':'inconclusive',readOnly:true,
  passive:{state:ownerLogs?.state??'inconclusive',
   hostBusySeen:tail.exactComputerHostBusyCodeObserved??null,
   ownershipPhraseSeen:tail.hostBusyOwnershipPhraseObserved??null,
   executionMismatchSeen:tail.executionMismatchCodeObserved??null,
   closeMentioned:tail.closeExecutionMentioned??null,
   currentOwnerVerified:false},
  installedSource:local??summarizeOwnerInterfaceScan({
   rootsFound:0,filesInspected:0,hitCounts:{}}),
  ownerReleaseVerified:false,changedGateway:false,invokedComputerAct:false,
  changedDesktop:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=process.argv.length===2?await inspectOwnerInterface():
  {audit:AUDIT,state:'blocked',reason:'unsupported_arguments',
   readOnly:true,invokedComputerAct:false};
 console.log(JSON.stringify(report));
 if(report.state!=='observed')process.exitCode=1;
}
