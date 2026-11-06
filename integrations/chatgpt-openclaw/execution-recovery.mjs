// Receipt-bound local maintenance review. Business-specific evidence stays outside.
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {privateExecutionPath} from './project-execution-store.mjs';
import {operationId} from './computer-task-store.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const read=async p=>{await privateExecutionPath(p);const t=await readFile(p,'utf8');if(t.length>32768)throw Error('recovery_metadata_too_large');return JSON.parse(t);};
const publish=async(p,v)=>{const temp=p+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(v)+'\n',{mode:0o600,flag:'wx'});await rename(temp,p);};
export async function reviewExecutionRecovery(args,{store,applicable,snapshot,directory,decision,now=Date.now}={}){
 try{
  if(!args||Object.keys(args).some(k=>!['mode','operation_id','review_digest','acknowledge_effects_unverified'].includes(k))||
   !operationId.test(args.operation_id??'')||!['inspect','resolve'].includes(args.mode)||
   (args.mode==='resolve'?!/^[a-f0-9]{64}$/.test(args.review_digest??'')||args.acknowledge_effects_unverified!==true:args.review_digest!==undefined||args.acknowledge_effects_unverified!==undefined))throw Error('invalid_task_recovery_input');
  const r=await store.get(args.operation_id);if(!applicable(r))throw Error('task_recovery_not_applicable');
  const receiptSha=hash(await store.readStored(r.operationId,r.operationId+'.json',65536));
  const dir=join(store.dir,directory);await mkdir(dir,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});await privateExecutionPath(dir,true);
  const auditPath=join(dir,r.operationId+'.json'),reviewPath=join(dir,r.operationId+'.review.json');
  let audit;try{audit=await read(auditPath);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(audit){
   if(audit.operationId!==r.operationId||audit.originalReceiptSha256!==receiptSha||audit.originalDigest!==r.digest||audit.decision!==decision||
    !['resolved','reviewed_pending_release'].includes(audit.state)||audit.originalReceiptPreserved!==true||audit.effectsVerified!==false||audit.taskRepeated!==false)throw Error('task_recovery_audit_mismatch');
   let owns=false;try{owns=await store.owns(r.operationId,r.digest);}catch(e){if(e.code!=='ENOENT')throw e;}
   if(!owns){if(audit.state!=='resolved'){audit={...audit,state:'resolved',lockReleased:true};await publish(auditPath,audit);}return {...audit,cached:true,doNotRepeat:true};}
   if(audit.state==='resolved')throw Error('task_recovery_lock_reappeared');
  }
  const fresh=async()=>{if(!await store.owns(r.operationId,r.digest))throw Error('task_recovery_lock_changed');return snapshot(r);};
  const evidence=await fresh(),fingerprint=hash(JSON.stringify(evidence));
  if(args.mode==='inspect'){
   const review={operationId:r.operationId,originalReceiptSha256:receiptSha,originalDigest:r.digest,evidenceFingerprint:fingerprint,createdAt:now()};review.reviewDigest=hash(JSON.stringify(review));await publish(reviewPath,review);
   return {state:'review_ready',operationId:r.operationId,review_digest:review.reviewDigest,evidence,lockReleased:false,doNotRepeat:true,
    reviewRequired:'Maintainer must review original scope, child operations and artifacts. Resolve acknowledges effects remain unverified; it grants no retry or success.'};
  }
  const review=await read(reviewPath);
  if(review.reviewDigest!==args.review_digest||review.originalReceiptSha256!==receiptSha||review.originalDigest!==r.digest||review.evidenceFingerprint!==fingerprint||now()-review.createdAt<0||now()-review.createdAt>60000)throw Error('task_review_changed_or_expired');
  const guard=join(dir,'review.lock'),nonce=randomUUID();await writeFile(guard,JSON.stringify({nonce}),{mode:0o600,flag:'wx'});
  try{
   if(hash(await store.readStored(r.operationId,r.operationId+'.json',65536))!==receiptSha||hash(JSON.stringify(await fresh()))!==fingerprint)throw Error('task_recovery_state_changed');
   audit={schemaVersion:1,state:'reviewed_pending_release',operationId:r.operationId,originalReceiptSha256:receiptSha,originalDigest:r.digest,
    decision,evidence,reviewDigest:review.reviewDigest,reconciledAt:new Date(now()).toISOString(),originalReceiptPreserved:true,effectsVerified:false,taskRepeated:false,lockReleased:false};
   await publish(auditPath,audit);await store.release(r.operationId,r.digest);audit={...audit,state:'resolved',lockReleased:true};await publish(auditPath,audit);
   return {...audit,cached:false,doNotRepeat:true};
  }finally{if((await read(guard)).nonce===nonce)await unlink(guard);}
 }catch(e){return {state:'blocked',reason:/^[a-z_]+$/.test(e.message)?e.message:'task_recovery_unavailable',lockReleased:false,doNotRepeat:true};}
}
export async function readExecutionRecovery(store,id,{directory,decision}){
 try{
  const a=await read(join(store.dir,directory,id+'.json')),r=await store.get(id);
  if(a.operationId!==id||a.originalDigest!==r?.digest||a.originalReceiptSha256!==hash(await store.readStored(id,id+'.json',65536))||a.decision!==decision||a.originalReceiptPreserved!==true||a.effectsVerified!==false||a.taskRepeated!==false||!['resolved','reviewed_pending_release'].includes(a.state))throw Error('task_recovery_audit_mismatch');
  return {state:a.state,decision:a.decision,lockReleased:a.state==='resolved'&&a.lockReleased===true,effectsVerified:false,originalReceiptPreserved:true,reconciledAt:a.reconciledAt};
 }catch(e){return e.code==='ENOENT'?null:{state:'unverified',reason:'task_recovery_audit_unverified',lockReleased:false};}
}
