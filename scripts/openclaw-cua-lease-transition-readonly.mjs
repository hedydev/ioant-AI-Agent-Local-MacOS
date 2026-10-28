#!/usr/bin/env node
// Functional, one-shot CUA ownership *transition* probe. Every native action
// is get_cursor_position, except exact-ID close for IDs created here.
// A busy challenge under A, followed by admission under B after A closes,
// is stronger than an ACK or source-code grep. Still not proof of future
// host-idle state, another actor's lease, or authority to send a message.
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {realpath} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chooseConnectedMacNode} from './openclaw-mac-visual.mjs';
import {scopedReadRequest,scopedCloseRequest}
 from './openclaw-cua-owned-session-guard.mjs';

const exec=promisify(execFile);
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const RUNTIME=join(homedir(),'Library','Application Support','ioant-openclaw-ops','runtime');
const CLI=join(homedir(),'.openclaw','bin','openclaw');
const AUDIT='IOANT_CUA_OWN_LEASE_TRANSITION';
const statusArgs=['nodes','status','--json'];
const bool=x=>x===true;
export function concludeLeaseTransition(e={}){
 const first=bool(e.firstAdmitted),busy=bool(e.overlapBusy),
  close=bool(e.firstCloseAcknowledged),
  after=bool(e.afterCloseAdmitted),
  finalClose=bool(e.afterCloseAcknowledged),
  stable=bool(e.providerGenerationStable);
 const verified=first&&busy&&close&&after&&finalClose&&stable;
 return Object.freeze({
  state:verified?'own_lease_transition_observed':'inconclusive',
  firstAdmitted:first,overlapBusy:busy,
  firstCloseAcknowledged:close,afterCloseAdmitted:after,
  afterCloseAcknowledged:finalClose,providerGenerationStable:stable,
  ownLeaseTransitionObserved:verified,
  ownerReleaseVerified:false,hostCurrentlyIdleVerified:false,
  otherOwnersReleasedVerified:false,chatDeliveryAuthorized:false,
  desktopInput:false,screenCapture:false,changedBrowser:false
 });
}
export function classifyCUAResponse(x,err){
 const raw=err?.stdout??x;
 if(typeof raw==='string'&&raw.length>150000)
  return 'inconclusive';
 let payload=raw;
 if(typeof raw==='string'){
  try{payload=JSON.parse(raw)}catch{payload=null}
 }
 // Native errors might be a structured CLI result or a transport error.
 const code=payload?.error?.code??payload?.result?.error?.code;
 const line=typeof err?.stderr==='string'?err.stderr.slice(0,5000):'';
 const content=typeof err?.stdout==='string'?err.stdout.slice(0,5000):'';
 if(code==='COMPUTER_HOST_BUSY'||
  /\bCOMPUTER_HOST_BUSY\b/.test(content+'\n'+line))
  return 'busy';
 if(err)return 'inconclusive';
 return payload?.ok===true?'admitted':'inconclusive';
}
async function cli(args,timeout=18000){
 const {stdout}=await exec(CLI,args,{cwd:RUNTIME,timeout,
  maxBuffer:350000,shell:false});
 return JSON.parse(stdout);
}
async function invoke(args,timeout=18000){
 try{return classifyCUAResponse(await cli(args,timeout))}
 catch(e){return classifyCUAResponse(null,e)}
}
async function close(node,id){
 const status=await invoke(scopedCloseRequest(node,id),12000);
 return status==='admitted';
}
export async function inspectOwnLeaseTransition({
 run=invoke,status=cli,makeId=randomUUID,
 permitted=async()=>process.platform==='darwin'&&ROOT===RUNTIME&&
  await realpath(RUNTIME)===RUNTIME
}={}){
 const evidence={};let node=null,first=null,second=null;
 let firstMayOwn=false,secondMayOwn=false;
 if(!await permitted().catch(()=>false))return {
  audit:AUDIT,state:'blocked',reason:'private_runtime_required',
  readOnly:true,invokedComputerAct:false};
 try{
  const raw=await status(statusArgs,18000);
  const choice=chooseConnectedMacNode(raw),body=raw.result??raw;
  const n=body.nodes.find(x=>x.connected===true&&
   (x.nodeId===choice.id||x.id===choice.id));
  const d=n?.computerUse;
  if(d?.provider?.id!=='cua-computer'||d.contractVersion!==2||
   !d.actions?.includes('get_cursor_position')||
   !d.provider.generation||typeof d.provider.generation!=='string')
   return {audit:AUDIT,state:'blocked',reason:'native_cursor_read_not_advertised',
    readOnly:true,invokedComputerAct:false};
  node=choice.id;
  first=makeId();second=makeId();
  if(first===second)throw Error('duplicate_execution_id');
  // A: read-only admission. If another owner is already active, stop.
  const a=await run(scopedReadRequest(node,first,'get_cursor_position'),18000);
  if(a!=='admitted'){
   firstMayOwn=a!=='busy';
   return {audit:AUDIT,...concludeLeaseTransition(evidence),
    reason:a==='busy'?'preexisting_owner_busy':'first_read_inconclusive',
    readOnly:true};
  }
  firstMayOwn=true;evidence.firstAdmitted=true;
  // B: same read-only action under a separate identity before closing A.
  const b=await run(scopedReadRequest(node,second,'get_cursor_position'),18000);
  evidence.overlapBusy=b==='busy';
  secondMayOwn=b!=='busy';
  if(b!=='busy')return {audit:AUDIT,...concludeLeaseTransition(evidence),
   reason:b==='admitted'?'parallel_owner_admission':'overlap_unclassified',
   readOnly:true};
  // Release only the ID created by this invocation.
  evidence.firstCloseAcknowledged=await close(node,first);
  firstMayOwn=!evidence.firstCloseAcknowledged;
  if(!evidence.firstCloseAcknowledged)return {
   audit:AUDIT,...concludeLeaseTransition(evidence),
   reason:'first_close_unacknowledged',readOnly:true};
  // Retry B only after an exact BUSY admission rejection of B.
  const b2=await run(scopedReadRequest(node,second,'get_cursor_position'),18000);
  evidence.afterCloseAdmitted=b2==='admitted';
  secondMayOwn=b2!=='busy';
  if(!evidence.afterCloseAdmitted)return {
   audit:AUDIT,...concludeLeaseTransition(evidence),
   reason:'reacquire_failed',readOnly:true};
  evidence.afterCloseAcknowledged=await close(node,second);
  secondMayOwn=!evidence.afterCloseAcknowledged;
  const after=await status(statusArgs,18000);
  const body2=after.result??after;
  const selected=body2.nodes.find(x=>x.connected===true&&
   (x.nodeId===node||x.id===node));
  evidence.providerGenerationStable=selected?.computerUse?.provider?.generation===
   d.provider.generation;
  return {audit:AUDIT,...concludeLeaseTransition(evidence),
   readOnly:true,invokedComputerAct:true,
   computerActions:['get_cursor_position','__close_execution']};
 }catch{
  return {audit:AUDIT,...concludeLeaseTransition(evidence),
   reason:'probe_error',readOnly:true};
 }finally{
  // On unknown errors, close only our own potentially admitted ID.
  // An ACK is not owner-release proof. Never close an external owner.
  if(node&&second&&secondMayOwn)await close(node,second).catch(()=>false);
  if(node&&first&&firstMayOwn)await close(node,first).catch(()=>false);
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=process.argv.length===2?await inspectOwnLeaseTransition():
  {audit:AUDIT,state:'blocked',reason:'unsupported_arguments',
   readOnly:true,invokedComputerAct:false};
 console.log(JSON.stringify(report));
 if(report.state!=='own_lease_transition_observed')process.exitCode=1;
}
