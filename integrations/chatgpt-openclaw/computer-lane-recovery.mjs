// Local maintenance only. Preserve original operation claims and effects;
// release exactly one reservation only after independent native settlement.
import {homedir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {writeFile,unlink} from 'node:fs/promises';
import {computerProjectStore,computerSessionKey} from './computer-agent.mjs';
import {InferenceLane} from './inference-lane.mjs';
import {executionCommand} from './project-execution-command.mjs';
import {privateRead,privateWrite,privateDirectory} from '../../console/private-files.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const ended=new Set(['done','failed','killed','timeout']);
export async function nativeSessionStatus(key){
 const r=await executionCommand(join(homedir(),'.openclaw/bin/openclaw'),['gateway','call','sessions.describe',
  '--expect-url','ws://127.0.0.1:18789','--params',JSON.stringify({key,includeDerivedTitles:false,includeLastMessage:false}),'--json','--timeout','10000'],{timeout:15000,limit:32768});
 if(!r.ok)throw Error('native_session_status_unavailable');
 const s=JSON.parse(r.stdout).session;
 if(!s||s.key!==key||typeof s.sessionId!=='string'||!ended.has(s.status)||s.hasActiveRun!==false||!Array.isArray(s.activeRunIds)||s.activeRunIds.length||!Number.isFinite(s.updatedAt))throw Error('native_session_not_settled');
 return {key:s.key,sessionId:s.sessionId,status:s.status,hasActiveRun:false,activeRunIds:[],updatedAt:s.updatedAt};
}
export function runnerExited(pid){
 if(!Number.isSafeInteger(pid)||pid<2)return false;
 try{process.kill(pid,0);return false;}catch(e){return e.code==='ESRCH';}
}
export async function recoverComputerLane({mode,operationId,reviewDigest},{binding,store=computerProjectStore(binding),lane=new InferenceLane(store.parent),probe=nativeSessionStatus,exited=runnerExited,now=Date.now}={}){
 if(!['inspect','resolve'].includes(mode)||!binding)throw Error('invalid_recovery_request');
 const r=await store.get(operationId);
 if(r?.state!=='finished'||r.result?.state!=='inconclusive'||!r.job?.slot||r.job.project!==binding.projectKey||r.job.agent!==binding.agentId||!exited(r.runnerPid))throw Error('computer_runner_not_settled');
 const input=r.job.input;
 const digest=hash(JSON.stringify([binding.projectKey,binding.agentId,input?.conversation_key,input?.message]));
 if(digest!==r.digest||input.operation_id!==operationId)throw Error('computer_job_identity_changed');
 const key=computerSessionKey(input,binding);
 const native=await probe(key);
 if(native.key!==key||!ended.has(native.status)||native.hasActiveRun!==false||native.activeRunIds?.length!==0||native.updatedAt<Date.parse(r.startedAt))throw Error('native_session_not_settled');
 const slot=r.job.slot,active=await lane.read('active.json'),reservation=await lane.read('slot-'+slot.slot+'.json');
 for(const value of [active,reservation])if(value.token!==slot.token||value.project!==binding.projectKey||value.operationId!==operationId)throw Error('inference_owner_changed');
 const original=await privateRead(store.path(operationId)),receiptSha=hash(original);
 const evidence={project:binding.projectKey,operationId,runnerPid:r.runnerPid,runnerExited:true,native,receiptSha};
 const fingerprint=hash(JSON.stringify([evidence,slot]));
 const dir=join(store.dir,'lane-recovery');await privateDirectory(dir,{create:true});
 if(mode==='inspect'){
  const digest=hash(JSON.stringify([fingerprint,now(),randomUUID()]));
  await privateWrite(join(dir,operationId+'.review.json'),{digest,fingerprint,expiresAt:now()+300000,evidence});
  return {state:'review_ready',reviewDigest:digest,evidence,originalReceiptPreserved:true,executionInvoked:false};
 }
 const review=JSON.parse(await privateRead(join(dir,operationId+'.review.json')));
 if(!reviewDigest||review.digest!==reviewDigest||review.fingerprint!==fingerprint||review.expiresAt<now())throw Error('recovery_review_expired_or_changed');
 const guard=join(dir,'resolve.lock');await writeFile(guard,JSON.stringify({operationId}),{flag:'wx',mode:0o600});
 try{
  if(hash(await privateRead(store.path(operationId)))!==receiptSha||!exited(r.runnerPid))throw Error('recovery_evidence_changed');
  const audit={state:'reviewed',evidence,reviewDigest,originalReceiptPreserved:true,executionInvoked:false,at:new Date(now()).toISOString()};
  await privateWrite(join(dir,operationId+'.audit.json'),audit);
  await lane.release(slot,{active:true});
  await privateWrite(join(dir,operationId+'.audit.json'),{...audit,state:'released',nativeCompletion:native.status,effectsVerified:false,doNotRepeat:true});
  return {state:'released',project:binding.projectKey,operationId,nativeCompletion:native.status,originalReceiptPreserved:hash(await privateRead(store.path(operationId)))===receiptSha,effectsVerified:false,executionInvoked:false,doNotRepeat:true};
 }finally{await unlink(guard);}
}
