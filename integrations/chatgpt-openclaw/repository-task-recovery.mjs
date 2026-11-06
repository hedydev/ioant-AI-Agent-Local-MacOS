// Local maintainer review only. Never retries work or changes its original outcome.
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {privateExecutionPath} from './project-execution-store.mjs';
import {executionCommand} from './project-execution-command.mjs';
import {executionPolicy} from './project-execution-policy.mjs';
import {inspectExecutionRepository} from './execution-repository.mjs';
import {loadRepositoryTask,verifyTaskScript} from './repository-task.mjs';
import {operationId} from './computer-task-store.mjs';
import {ALICE_RESTART_TASK} from './alice-lifecycle-policy.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const absent=pid=>{try{process.kill(pid,0);return false;}catch(e){return e.code==='ESRCH';}};
const read=async p=>{await privateExecutionPath(p);const t=await readFile(p,'utf8');if(t.length>32768)throw Error('recovery_metadata_too_large');return JSON.parse(t);};
const publish=async(p,v)=>{const temp=p+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(v)+'\n',{mode:0o600,flag:'wx'});await rename(temp,p);};

export async function probeRepositoryTask(record,policy,{command=executionCommand}={}){
 if(!Number.isSafeInteger(record.runnerPid)||record.runnerPid<2||!absent(record.runnerPid))throw Error('original_runner_still_present');
 // No argv/environment collection. cwd evidence and conservative global compiler
 // detection also cover legacy receipts without a recorded command process group.
 const ps=await command('/bin/ps',['-axo','pid=,ppid=,pgid=,comm='],{timeout:10000,limit:1048576});
 const files=await command('/usr/sbin/lsof',['-a','-u',String(process.getuid()),'-d','cwd','-Fpn'],{timeout:15000,limit:1048576});
 if(!ps.ok||ps.truncated||!files.ok||files.truncated)throw Error('process_evidence_unavailable');
 const rows=ps.stdout.trim().split('\n').map(line=>line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/)).map(m=>{
  if(!m)throw Error('process_evidence_unverified');return {pid:Number(m[1]),ppid:Number(m[2]),pgid:Number(m[3]),name:basename(m[4])};
 });
 const excluded=new Set([process.pid]);let parent=process.pid;
 while(parent){const row=rows.find(r=>r.pid===parent);parent=row?.ppid;if(parent)excluded.add(parent);}
 let pid=null;const scoped=new Set();
 for(const line of files.stdout.split('\n')){
  if(/^p\d+$/.test(line))pid=Number(line.slice(1));
  if(line.startsWith('n')&&(line.slice(1)===policy.repo||line.slice(1).startsWith(policy.repo+'/'))&&pid&&!excluded.has(pid))scoped.add(pid);
 }
 const compilers=rows.filter(r=>!excluded.has(r.pid)&&/^(cargo(?:-.*)?|rustc|rust-lld|rust-objcopy|clang(?:\+\+)?|ld|codesign|hdiutil|xcodebuild)$/.test(r.name));
 const groups=record.steps.map(s=>s.processId).filter(p=>Number.isSafeInteger(p)&&p>1);
 const groupAbsent=groups.every(p=>absent(-p));
 return {runnerExited:true,scopedProcessIds:[...scoped].sort((a,b)=>a-b),compilerProcessIds:compilers.map(r=>r.pid).sort((a,b)=>a-b),
  recordedProcessGroupsAbsent:groupAbsent,legacyProcessEvidence:groups.length===0};
}

export async function reconcileRepositoryTask(args,{binding,store,policyLoad=executionPolicy,probe=probeRepositoryTask,now=Date.now}={}){
 try{
  if(!args||Object.keys(args).some(k=>!['mode','operation_id','review_digest','acknowledge_effects_unverified'].includes(k))||
   !operationId.test(args.operation_id??'')||!['inspect','resolve'].includes(args.mode)||
   (args.mode==='resolve'? !/^[a-f0-9]{64}$/.test(args.review_digest??'')||args.acknowledge_effects_unverified!==true : args.review_digest!==undefined||args.acknowledge_effects_unverified!==undefined))throw Error('invalid_task_recovery_input');
  const r=await store.get(args.operation_id);
  if(!r||r.state!=='inconclusive'||r.reason!=='command_outcome_requires_review'||r.input.action!=='repository_task'||
   r.input.workspace_mode!=='current'||r.input.task_file===ALICE_RESTART_TASK||r.lifecycleApproval||r.lifecycle||
   !r.steps.length||r.steps.at(-1).capability!=='script'||r.steps.at(-1).timedOut!==true||
   r.steps.slice(0,-1).some(s=>s.state!=='passed'))throw Error('task_recovery_not_applicable');
  const receiptSha=hash(await store.readStored(r.operationId,r.operationId+'.json',65536));
  const dir=join(store.dir,'task-reconciliation');await mkdir(dir,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});await privateExecutionPath(dir,true);
  const auditPath=join(dir,r.operationId+'.json'),reviewPath=join(dir,r.operationId+'.review.json');
  let audit;try{audit=await read(auditPath);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(audit){
   if(audit.originalReceiptSha256!==receiptSha||audit.originalDigest!==r.digest||audit.decision!=='reviewed_local_task_ended_effects_unverified')throw Error('task_recovery_audit_mismatch');
   let owns=false;try{owns=await store.owns(r.operationId,r.digest);}catch(e){if(e.code!=='ENOENT')throw e;}
   if(!owns){if(audit.state!=='resolved'){audit={...audit,state:'resolved',lockReleased:true};await publish(auditPath,audit);}return {...audit,cached:true,doNotRepeat:true};}
   if(audit.state==='resolved')throw Error('task_recovery_lock_reappeared');
  }
  const snapshot=async()=>{
   if(!await store.owns(r.operationId,r.digest))throw Error('task_recovery_lock_changed');
   const p=await policyLoad(binding,{action:'repository_task'});if(!p)throw Error('task_recovery_policy_unavailable');
   const repo=await inspectExecutionRepository(p,{allowDirty:true,requireRegisteredBranch:false,requireIdle:true});
   if(repo.head!==r.actualCommit||repo.head!==r.input.expected_commit||repo.branch!==r.beforeBranch)throw Error('repository_changed_since_task');
   const plan=await loadRepositoryTask(p,repo.head,r.input.task_file);
   for(const item of plan.steps)await verifyTaskScript(p,plan,item);
   const evidence=await probe(r,p);
   if(evidence.runnerExited!==true||evidence.recordedProcessGroupsAbsent!==true||!Array.isArray(evidence.scopedProcessIds)||!Array.isArray(evidence.compilerProcessIds)||evidence.scopedProcessIds.length||evidence.compilerProcessIds.length)throw Error('task_processes_not_quiescent');
   return {repo:{head:repo.head,branch:repo.branch,dirty:repo.dirty},definitionSha256:plan.definitionSha256,evidence};
  };
  const evidence=await snapshot(),fingerprint=hash(JSON.stringify(evidence));
  if(args.mode==='inspect'){
   const review={operationId:r.operationId,originalReceiptSha256:receiptSha,originalDigest:r.digest,evidenceFingerprint:fingerprint,createdAt:now()};review.reviewDigest=hash(JSON.stringify(review));await publish(reviewPath,review);
   return {state:'review_ready',operationId:r.operationId,review_digest:review.reviewDigest,evidence,lockReleased:false,doNotRepeat:true,
    reviewRequired:'Local maintainer must review the pinned script, child operations and artifacts. Resolve acknowledges effects remain unverified; never infer build success or retry authority.'};
  }
  const review=await read(reviewPath);
  if(review.reviewDigest!==args.review_digest||review.originalReceiptSha256!==receiptSha||review.originalDigest!==r.digest||review.evidenceFingerprint!==fingerprint||now()-review.createdAt<0||now()-review.createdAt>60000)throw Error('task_review_changed_or_expired');
  const guard=join(dir,'review.lock'),nonce=randomUUID();await writeFile(guard,JSON.stringify({nonce}),{mode:0o600,flag:'wx'});
  try{
   if(hash(await store.readStored(r.operationId,r.operationId+'.json',65536))!==receiptSha||hash(JSON.stringify(await snapshot()))!==fingerprint)throw Error('task_recovery_state_changed');
   audit={schemaVersion:1,state:'reviewed_pending_release',operationId:r.operationId,originalReceiptSha256:receiptSha,originalDigest:r.digest,
    decision:'reviewed_local_task_ended_effects_unverified',evidence,reviewDigest:review.reviewDigest,reconciledAt:new Date(now()).toISOString(),originalReceiptPreserved:true,effectsVerified:false,taskRepeated:false,lockReleased:false};
   await publish(auditPath,audit);await store.release(r.operationId,r.digest);audit={...audit,state:'resolved',lockReleased:true};await publish(auditPath,audit);
   return {...audit,cached:false,doNotRepeat:true};
  }finally{if((await read(guard)).nonce===nonce)await unlink(guard);}
 }catch(e){return {state:'blocked',reason:/^[a-z_]+$/.test(e.message)?e.message:'task_recovery_unavailable',lockReleased:false,doNotRepeat:true};}
}

export async function repositoryTaskRecoveryReceipt(store,id){
 try{
  const a=await read(join(store.dir,'task-reconciliation',id+'.json')),r=await store.get(id);
  if(a.operationId!==id||a.originalDigest!==r?.digest||a.originalReceiptSha256!==hash(await store.readStored(id,id+'.json',65536))||a.decision!=='reviewed_local_task_ended_effects_unverified'||a.originalReceiptPreserved!==true||a.effectsVerified!==false||a.taskRepeated!==false||!['resolved','reviewed_pending_release'].includes(a.state))throw Error('task_recovery_audit_mismatch');
  return {state:a.state,decision:a.decision,lockReleased:a.state==='resolved'&&a.lockReleased===true,effectsVerified:false,originalReceiptPreserved:true,reconciledAt:a.reconciledAt};
 }catch(e){return e.code==='ENOENT'?null:{state:'unverified',reason:'task_recovery_audit_unverified',lockReleased:false};}
}
