// Read-only remote evidence and reviewed compare-and-release. Never starts a client.
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,rename,unlink,mkdir,link} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {operationId} from './computer-task-store.mjs';
import {privateExecutionPath} from './project-execution-store.mjs';
import {executionCommand} from './project-execution-command.mjs';
import {ALICE_RESTART_TASK,aliceLifecycleApproval,validateAliceLifecycleReceipt} from './alice-lifecycle-policy.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const fixed=(x,k)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join(',')===[...k].sort().join(',');
const reason=/^[a-z_]{1,80}$/;
export const reconciliationTool={name:'openclaw_project_reconcile',
 description:'Inspect an inconclusive approved Alice client restart even while project_execution_busy. mode=inspect reads exact Mint owner/process/settled lifecycle/log categories, no model or game action. If evidence proves the old operation ended with no Alice, or its exact replacement is now healthy, returns a short-lived review_digest. mode=resolve requires that digest, rechecks evidence and runner exit, preserves original receipt/logs/claims and writes an audit before compare-and-release of only that operation lock. Does not restart/start Alice, clear unrelated locks, retry jobs or override platform review. Existing or unknown work must never be replayed.',
 inputSchema:{type:'object',properties:{operation_id:{type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$'},mode:{type:'string',enum:['inspect','resolve']},review_digest:{type:'string',pattern:'^[a-f0-9]{64}$'}},required:['operation_id','mode'],additionalProperties:false},
 annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:true}};
export function classifyLifecycleEvidence(r,e){
 const pid=r.lifecycle?.newPid;
 if(!e||e.schemaVersion!==1||e.operationId!==r.operationId||e.remoteLifecycleIdle!==true||
  e.remoteClaimState!=='inconclusive'||e.remoteClaimReason!=='login_not_yet_verified'||
  !Number.isInteger(e.candidateCount)||e.candidateCount<0)return 'unresolved';
 if(e.ownerPid===null&&e.candidateCount===0&&e.oldPidPresent===false&&e.newPidPresent===false)return 'confirmed_offline';
 const start=e.ownerStartMs,begin=Date.parse(r.startedAt),end=Date.parse(r.finishedAt);
 if(e.ownerPid===pid&&e.candidateCount===1&&e.newPidPresent===true&&Number.isSafeInteger(start)&&
  start>=begin-5000&&start<=end+5000&&['ownerVerified','heartbeatFresh','connected','sessionEstablished','worldVerified','portVerified'].every(k=>e[k]===true))return 'confirmed_late_online';
 return 'unresolved';
}
export async function inspectAliceLifecycle(record,{command=executionCommand}={}){
 const input={operationId:record.operationId,oldPid:record.lifecycle.oldPid,newPid:record.lifecycle.newPid,
  startedAtMs:Date.parse(record.startedAt),finishedAtMs:Date.parse(record.finishedAt)};
 const script=fileURLToPath(new URL('../../scripts/alice-lifecycle-inspect.py',import.meta.url));
 const r=await command('/usr/bin/python3',[script,JSON.stringify(input)],{timeout:30000,limit:8192});
 if(!r.ok||r.truncated)throw Error('lifecycle_inspection_unavailable');
 let e;try{e=JSON.parse(r.stdout);}catch{throw Error('lifecycle_inspection_unavailable');}
 const fields=['schemaVersion','operationId','observedAt','remoteClaimState','remoteClaimReason','remoteLifecycleIdle','oldPidPresent','newPidPresent','candidateCount','ownerPid','ownerStartMs','ownerVerified','heartbeatFresh','connected','sessionEstablished','worldVerified','portVerified','log'];
 if(!fixed(e,fields)||!Number.isSafeInteger(e.observedAt)||Math.abs(Date.now()-e.observedAt)>10000||
  !reason.test(e.remoteClaimReason??'')||!fixed(e.log,['matchedPidLines','signals','exceptionTypes','exceptionCategories','errorWords','networkCodes','stackFrames'])||
  JSON.stringify(e).length>4096)throw Error('lifecycle_evidence_unverified');
 return e;
}
async function runnerExited(pid){
 if(!Number.isSafeInteger(pid)||pid<2)return false;
 try{process.kill(pid,0);return false;}catch(e){return e.code==='ESRCH';}
}
async function readPrivate(path){await privateExecutionPath(path);const text=await readFile(path,'utf8');if(text.length>16384)throw Error('recovery_record_too_large');return JSON.parse(text);}
async function publish(path,data){const temp=path+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(data)+'\n',{mode:0o600,flag:'wx'});await rename(temp,path);}
async function recoveryDirectory(store){
 const dir=join(store.dir,'reconciliation');await mkdir(dir,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});
 await privateExecutionPath(dir,true);return dir;
}
export async function migrateLegacyRecoveryAudit(store,id){
 if(!operationId.test(id))throw Error('invalid_operation_id');
 const dir=await recoveryDirectory(store),r=await store.get(id);
 for(const [oldName,newName] of [[id+'.recovery.json',id+'.json'],[id+'.recovery-review.json',id+'.review.json']]){
  const old=join(store.dir,oldName),dest=join(dir,newName);let data;
  try{data=await readPrivate(old);}catch(e){if(e.code==='ENOENT')continue;throw e;}
  if(data.operationId!==id||data.originalDigest!==r?.digest||data.originalReceiptSha256!==hash(await store.readStored(id,id+'.json',65536)))throw Error('legacy_recovery_audit_unverified');
  try{await link(old,dest);}catch(e){if(e.code!=='EEXIST')throw e;await privateExecutionPath(dest);if(hash(await readFile(old))!==hash(await readFile(dest)))throw e;}
  await unlink(old); // only this verified metadata link; never a receipt or active.lock
 }
 return dir;
}
export async function reconcileAliceLifecycle(args,{binding,store,probe=inspectAliceLifecycle,exited=runnerExited,
 approval=aliceLifecycleApproval,now=Date.now}={}){
 try{
  if(binding.projectKey!=='alice-ai'||binding.agentId!=='alice-ai')throw Error('lifecycle_recovery_wrong_project');
  if(!args||Object.keys(args).some(k=>!['operation_id','mode','review_digest'].includes(k))||!operationId.test(args.operation_id??'')||
   !['inspect','resolve'].includes(args.mode)||(args.mode==='resolve'?!/^[a-f0-9]{64}$/.test(args.review_digest??''):args.review_digest!==undefined))throw Error('invalid_lifecycle_recovery_input');
  const r=await store.get(args.operation_id);
  if(!r||r.state!=='inconclusive'||r.input.action!=='repository_task'||r.input.task_file!==ALICE_RESTART_TASK||r.reason!=='login_not_yet_verified')throw Error('lifecycle_recovery_not_applicable');
  validateAliceLifecycleReceipt(r.lifecycle,r.operationId);
  if(!Number.isSafeInteger(r.lifecycle.oldPid)||!Number.isSafeInteger(r.lifecycle.newPid))throw Error('lifecycle_pids_unverified');
  const raw=await store.readStored(r.operationId,r.operationId+'.json',65536),receiptSha=hash(raw);
  const dir=await migrateLegacyRecoveryAudit(store,r.operationId);
  const auditFile=join(dir,r.operationId+'.json'),reviewFile=join(dir,r.operationId+'.review.json');
  let audit;try{audit=await readPrivate(auditFile);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(audit){
   if(audit.operationId!==r.operationId||audit.originalReceiptSha256!==receiptSha||audit.originalDigest!==r.digest||!['confirmed_offline','confirmed_late_online'].includes(audit.decision))throw Error('recovery_audit_mismatch');
   // A previous resolver can crash after release. Never release a new task's lock.
   let owns=false;try{owns=await store.owns(r.operationId,r.digest);}catch(e){if(e.code!=='ENOENT')throw e;}
   if(!owns){if(audit.state!=='resolved'){audit={...audit,state:'resolved',lockReleased:true};await publish(auditFile,audit);}return {...audit,cached:true,doNotRepeat:true};}
   if(audit.state==='resolved')throw Error('recovery_lock_reappeared');
  }
  const grant=await approval(binding);
  if(r.lifecycleApproval?.approvalSha256!==grant.approvalSha256)throw Error('lifecycle_original_approval_changed');
  if(!await store.owns(r.operationId,r.digest))throw Error('lifecycle_lock_changed');
  if(!await exited(r.runnerPid))throw Error('original_runner_still_present');
  const e=await probe(r),decision=classifyLifecycleEvidence(r,e);
  const evidenceFingerprint=hash(JSON.stringify({...e,observedAt:0}));
  if(decision==='unresolved')return {state:'review_required',operationId:r.operationId,decision,evidence:e,lockReleased:false,doNotRepeat:true};
  if(args.mode==='inspect'){
   const review={operationId:r.operationId,originalReceiptSha256:receiptSha,originalDigest:r.digest,decision,evidenceFingerprint,createdAt:now()};
   review.reviewDigest=hash(JSON.stringify(review));await publish(reviewFile,review);
   return {state:'review_ready',operationId:r.operationId,decision,review_digest:review.reviewDigest,evidence:e,lockReleased:false,doNotRepeat:true};
  }
  const review=await readPrivate(reviewFile);
  if(review.reviewDigest!==args.review_digest||review.originalReceiptSha256!==receiptSha||review.originalDigest!==r.digest||
   review.decision!==decision||review.evidenceFingerprint!==evidenceFingerprint||now()-review.createdAt<0||now()-review.createdAt>60000)throw Error('lifecycle_review_changed_or_expired');
  const guard=join(dir,'lifecycle-reconcile.lock'),nonce=randomUUID();
  await writeFile(guard,JSON.stringify({pid:process.pid,nonce,operationId:r.operationId}),{mode:0o600,flag:'wx'});
  try{
   if(hash(await store.readStored(r.operationId,r.operationId+'.json',65536))!==receiptSha||!await store.owns(r.operationId,r.digest)||!await exited(r.runnerPid))throw Error('lifecycle_recovery_state_changed');
   audit={schemaVersion:1,state:'reviewed_pending_release',operationId:r.operationId,originalReceiptSha256:receiptSha,originalDigest:r.digest,
    decision,evidenceFingerprint,reviewDigest:review.reviewDigest,reconciledAt:new Date(now()).toISOString(),evidence:e,
    originalReceiptPreserved:true,clientActionInvoked:false,lockReleased:false};
   await publish(auditFile,audit); // audit before mutation; original receipt stays immutable
   await store.release(r.operationId,r.digest);
   audit={...audit,state:'resolved',lockReleased:true};await publish(auditFile,audit);
   return {...audit,cached:false,doNotRepeat:true};
  }finally{const own=await readPrivate(guard);if(own.nonce===nonce)await unlink(guard);}
 }catch(e){return {state:'blocked',reason:reason.test(e.message)?e.message:'lifecycle_recovery_unavailable',lockReleased:false,doNotRepeat:true};}
}
export async function lifecycleRecoveryReceipt(store,id){
 try{
  await privateExecutionPath(join(store.dir,'reconciliation'),true);
  const r=await readPrivate(join(store.dir,'reconciliation',id+'.json')),original=await store.get(id);
  if(r.operationId!==id||r.originalDigest!==original?.digest||r.originalReceiptSha256!==hash(await store.readStored(id,id+'.json',65536))||
   !['resolved','reviewed_pending_release'].includes(r.state)||!['confirmed_offline','confirmed_late_online'].includes(r.decision)||r.originalReceiptPreserved!==true||r.clientActionInvoked!==false)throw Error('recovery_audit_unverified');
  return {state:r.state,decision:r.decision,lockReleased:r.state==='resolved'&&r.lockReleased===true,reconciledAt:r.reconciledAt,originalReceiptPreserved:true};
 }catch(e){if(e.code==='ENOENT')return null;return {state:'unverified',reason:'recovery_audit_unverified',lockReleased:false};}
}
