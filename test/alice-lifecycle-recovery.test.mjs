import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,chmod,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {ProjectExecutionStore} from '../integrations/chatgpt-openclaw/project-execution-store.mjs';
import {projectBinding} from '../integrations/chatgpt-openclaw/project-binding.mjs';
import {ALICE_RESTART_TASK} from '../integrations/chatgpt-openclaw/alice-lifecycle-policy.mjs';
import {reconcileAliceLifecycle,classifyLifecycleEvidence,lifecycleRecoveryReceipt} from '../integrations/chatgpt-openclaw/alice-lifecycle-recovery.mjs';
const id='alice_uncertain_restart_test01';
async function fixture(t){
 const parent=await realpath(await mkdtemp(join(tmpdir(),'alice-reconcile-')));await chmod(parent,0o700);t.after(()=>rm(parent,{recursive:true,force:true}));
 const binding=projectBinding('alice-ai'),store=new ProjectExecutionStore(binding,{parent});
 const claim=await store.begin({operation_id:id,conversation_key:'recovery_chat_test01',action:'repository_task',task_file:ALICE_RESTART_TASK,workspace_mode:'current',expected_commit:'b'.repeat(40)},'d'.repeat(64));
 const r={...claim.record,state:'inconclusive',reason:'login_not_yet_verified',runnerPid:9999999,
  startedAt:new Date(Date.now()-120000).toISOString(),finishedAt:new Date(Date.now()-60000).toISOString(),
  lifecycleApproval:{approvalSha256:'a'.repeat(64)},lifecycle:{schemaVersion:2,operationId:id,state:'inconclusive',failureReason:'login_not_yet_verified',oldPid:100,newPid:200,replacementCount:1,restartAttempted:true,processAlive:false,heartbeatFresh:false,connected:false,sessionEstablished:false,ownerVerified:true,worldVerified:true,portVerified:true,existingTask:false,bdsRestarted:false,worldChanged:false}};
 await store.save(r);
 const evidence={schemaVersion:1,operationId:id,observedAt:Date.now(),remoteClaimState:'inconclusive',remoteClaimReason:'login_not_yet_verified',remoteLifecycleIdle:true,oldPidPresent:false,newPidPresent:false,candidateCount:0,ownerPid:null,ownerStartMs:null,ownerVerified:false,heartbeatFresh:false,connected:false,sessionEstablished:false,worldVerified:false,portVerified:false,log:{matchedPidLines:12,signals:['transport_ended'],exceptionTypes:[],exceptionCategories:[],errorWords:[],networkCodes:[],stackFrames:[]}};
 const options={binding,store,probe:async()=>structuredClone(evidence),exited:async()=>true,approval:async()=>({approvalSha256:'a'.repeat(64)})};
 return {...options,options,evidence,record:r};
}
test('inspection bypasses busy only for read-only evidence and does not release',async t=>{
 const c=await fixture(t),before=await readFile(c.store.path(id),'utf8');
 const r=await reconcileAliceLifecycle({operation_id:id,mode:'inspect'},c.options);
 assert.equal(r.state,'review_ready');assert.equal(r.decision,'confirmed_offline');assert.equal(r.lockReleased,false);
 assert.equal(await c.store.owns(id,c.record.digest),true);assert.equal(await readFile(c.store.path(id),'utf8'),before);
});
test('reviewed resolve preserves old inconclusive receipt/log claim, releases only matching lock',async t=>{
 const c=await fixture(t),before=await readFile(c.store.path(id),'utf8');
 const review=await reconcileAliceLifecycle({operation_id:id,mode:'inspect'},c.options);
 const r=await reconcileAliceLifecycle({operation_id:id,mode:'resolve',review_digest:review.review_digest},c.options);
 assert.equal(r.state,'resolved');assert.equal(r.lockReleased,true);assert.equal(r.clientActionInvoked,false);
 assert.equal(await readFile(c.store.path(id),'utf8'),before);assert.equal((await c.store.get(id)).state,'inconclusive');
 await assert.rejects(c.store.owns(id,c.record.digest),/ENOENT/);
 assert.equal((await lifecycleRecoveryReceipt(c.store,id)).decision,'confirmed_offline');
 // A second resolve cannot touch a later job or invoke the remote probe again.
 await c.store.begin({...c.record.input,operation_id:'later_task_operation02'},'e'.repeat(64));
 const again=await reconcileAliceLifecycle({operation_id:id,mode:'resolve',review_digest:review.review_digest},{...c.options,probe:async()=>{throw Error('must_not_probe');},approval:async()=>{throw Error('new_grant_not_required_for_cached_audit');}});
 assert.equal(again.cached,true);assert.equal(await c.store.owns('later_task_operation02','e'.repeat(64)),true);
});
test('active runner, remote busy, new unknown owner and missing proof stay locked',async t=>{
 for(const variation of ['runner','remote','owner','pid','unfinished']){
  const c=await fixture(t);const options={...c.options};
  if(variation==='runner')options.exited=async()=>false;
  if(variation==='remote')c.evidence.remoteLifecycleIdle=false;
  if(variation==='owner')Object.assign(c.evidence,{ownerPid:999,candidateCount:1});
  if(variation==='pid')c.evidence.newPidPresent=true;
  if(variation==='unfinished')c.evidence.remoteClaimReason='claimed_outcome_requires_review';
  const r=await reconcileAliceLifecycle({operation_id:id,mode:'inspect'},options);
  assert.ok(['blocked','review_required'].includes(r.state));assert.equal(r.lockReleased,false);assert.equal(await c.store.owns(id,c.record.digest),true);
 }
});
test('changed evidence, expired review and wrong digest cannot release',async t=>{
 for(const variation of ['changed','expired','digest']){
  const c=await fixture(t);let now=Date.now();const options={...c.options,now:()=>now};
  const review=await reconcileAliceLifecycle({operation_id:id,mode:'inspect'},options);
  if(variation==='changed')c.evidence.log.networkCodes=['ECONNRESET'];
  if(variation==='expired')now+=60001;
  const r=await reconcileAliceLifecycle({operation_id:id,mode:'resolve',review_digest:variation==='digest'?'f'.repeat(64):review.review_digest},options);
  assert.equal(r.state,'blocked');assert.equal(await c.store.owns(id,c.record.digest),true);
 }
});
test('late online proof needs the exact born-in-request owner and real game session',async t=>{
 const c=await fixture(t);
 const online={...c.evidence,newPidPresent:true,ownerPid:200,candidateCount:1,ownerStartMs:Date.parse(c.record.startedAt)+1000,ownerVerified:true,heartbeatFresh:true,connected:true,sessionEstablished:true,worldVerified:true,portVerified:true};
 assert.equal(classifyLifecycleEvidence(c.record,online),'confirmed_late_online');
 for(const change of [{ownerPid:999},{ownerStartMs:Date.now()},{heartbeatFresh:false},{worldVerified:false},{candidateCount:2}])assert.equal(classifyLifecycleEvidence(c.record,{...online,...change}),'unresolved');
});
test('unrelated project or receipt and original approval change cannot reconcile',async t=>{
 const c=await fixture(t);
 assert.equal((await reconcileAliceLifecycle({operation_id:id,mode:'inspect'},{...c.options,binding:projectBinding('openclaw-workflow')})).state,'blocked');
 assert.equal((await reconcileAliceLifecycle({operation_id:id,mode:'inspect'},{...c.options,approval:async()=>({approvalSha256:'c'.repeat(64)})})).reason,'lifecycle_original_approval_changed');
 assert.equal(await c.store.owns(id,c.record.digest),true);
});
test('sanitized startup parser exposes fixed fetch/reset categories, never private log text',()=>{
 const code="import importlib.util,json; s=importlib.util.spec_from_file_location('inspect_life','scripts/alice-lifecycle-inspect.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(json.dumps(m.log_signals('[2026-11-03T04:02:17+08:00 PID=200] TypeError: fetch failed\\n  cause: ECONNRESET SECRET-CREDENTIAL-ABC\\n[2026-11-03T04:02:18+08:00 PID=999] spawn confirmed',200)))";
 const text=execFileSync('/usr/bin/python3',['-c',code],{cwd:process.cwd()}).toString(),r=JSON.parse(text);
 assert.deepEqual(r.exceptionCategories,['fetch_failed']);assert.deepEqual(r.networkCodes,['ECONNRESET']);
 assert.equal(r.signals.includes('spawn_confirmed'),false);assert.equal(text.includes('SECRET-CREDENTIAL'),false);
});
test('invalid reconciliation sidecar does not prevent reading the original receipt',async t=>{
 const c=await fixture(t);await writeFile(join(c.store.dir,id+'.recovery.json'),'{}',{mode:0o600});
 assert.equal((await lifecycleRecoveryReceipt(c.store,id)).state,'unverified');assert.equal((await c.store.get(id)).state,'inconclusive');
});
