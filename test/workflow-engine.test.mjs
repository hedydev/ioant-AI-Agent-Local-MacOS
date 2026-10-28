import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkflow,applyWorkflowEvent,readyTasks,workflowSummary,validateWorkflow} from '../stage2/workflow-engine.mjs';
let n=0;const now='2026-10-27T00:00:00Z';const digest='a'.repeat(64);
function event(doc,type,rest={}){
 return applyWorkflowEvent(doc,{id:'event-'+(++n),type,at:now,expectedRevision:doc.revision,...rest});
}
function fixture(){
 let x=createWorkflow('multiworker-test');
 x=event(x,'worker_register',{worker:{id:'mac-worker',capabilities:['safe-task']}});
 x=event(x,'agent_bind',{workerId:'mac-worker',agentId:'openclaw-dev'});
 x=event(x,'task_add',{task:{id:'parent-one',kind:'safe-task',agentId:'openclaw-dev',dependsOn:[]}});
 return x;
}
function start(x,taskId='parent-one'){
 x=event(x,'task_claim',{taskId,workerId:'mac-worker',leaseId:'lease-1234',leaseUntil:'2026-10-27T00:03:00Z'});
 return event(x,'task_start',{taskId,workerId:'mac-worker',leaseId:'lease-1234'});
}
test('dependency waits for confirmed receipt plus explicit acceptance',()=>{
 let x=fixture();
 x=event(x,'task_add',{task:{id:'child-one',kind:'safe-task',agentId:'openclaw-dev',dependsOn:['parent-one']}});
 assert.deepEqual(readyTasks(x),['parent-one']);
 assert.throws(()=>event(x,'task_claim',{taskId:'child-one',workerId:'mac-worker',leaseId:'lease-0002',leaseUntil:'2026-10-27T00:03:00Z'}),/task_not_ready/);
 x=start(x);
 x=event(x,'task_receipt',{taskId:'parent-one',workerId:'mac-worker',leaseId:'lease-1234',receiptId:'receipt-1234',result:'passed',evidenceSha256:digest});
 assert.deepEqual(readyTasks(x),[]);
 x=event(x,'task_accept',{taskId:'parent-one',receiptId:'receipt-1234',verifierId:'local-check'});
 assert.deepEqual(readyTasks(x),['child-one']);
 assert.equal(workflowSummary(x).receipts,1);
});
test('duplicate events fail and worker cannot double-claim',()=>{
 let x=fixture();
 const e={id:'event-unique',type:'task_claim',at:now,expectedRevision:x.revision,taskId:'parent-one',
  workerId:'mac-worker',leaseId:'lease-1234',leaseUntil:'2026-10-27T00:03:00Z'};
 x=applyWorkflowEvent(x,e);
 assert.throws(()=>applyWorkflowEvent(x,{...e,expectedRevision:x.revision}),/duplicate_event/);
 assert.throws(()=>event(x,'task_claim',{taskId:'parent-one',workerId:'mac-worker',leaseId:'lease-0002',leaseUntil:'2026-10-27T00:03:00Z'}),/task_not_ready/);
});
test('agent binding does not grant missing capabilities',()=>{
 let x=fixture();
 x=event(x,'worker_register',{worker:{id:'second-worker',capabilities:['other-capability']}});
 x=event(x,'agent_bind',{workerId:'second-worker',agentId:'openclaw-dev'});
 assert.throws(()=>event(x,'task_claim',{taskId:'parent-one',workerId:'second-worker',leaseId:'lease-0002',leaseUntil:'2026-10-27T00:03:00Z'}),/worker_not_capable/);
});
test('running cancellation requires stop evidence and preserves history',()=>{
 let x=start(fixture());
 x=event(x,'task_cancel_request',{taskId:'parent-one'});
 assert.throws(()=>event(x,'task_cancel_confirm',{taskId:'parent-one'}),/cancel_needs_stop_evidence/);
 x=event(x,'task_cancel_confirm',{taskId:'parent-one',stopVerified:true});
 assert.equal(x.tasks[0].status,'cancelled');
 assert.equal(x.events.filter(e=>e.type==='task_cancel_request').length,1);
});
test('split original task without orphaning dependent tasks',()=>{
 let x=fixture();
 x=event(x,'task_add',{task:{id:'downstream',kind:'safe-task',dependsOn:['parent-one']}});
 x=event(x,'task_split',{taskId:'parent-one',parts:[{id:'split-first',kind:'safe-task'},{id:'split-second',kind:'safe-task'}]});
 assert.deepEqual(readyTasks(x),['split-first','split-second']);
 assert.equal(x.tasks.find(t=>t.id==='downstream').dependsOn[0],'parent-one');
 assert.equal(x.tasks.find(t=>t.id==='parent-one').status,'superseded');
 validateWorkflow(x);
});
test('unsafe mutations and invalid dependency rejected',()=>{
 let x=fixture();
 assert.throws(()=>event(x,'task_add',{task:{id:'cyclic-task',kind:'safe-task',dependsOn:['cyclic-task']}}),/invalid_task_add/);
 x=start(x);
 assert.throws(()=>event(x,'task_void',{taskId:'parent-one',reason:'user revoked task'}),/cannot_void_active_task/);
 assert.throws(()=>event(x,'task_receipt',{taskId:'parent-one',workerId:'mac-worker',leaseId:'lease-1234',receiptId:'receipt-1234',result:'cancelled',evidenceSha256:digest}),/unverified_cancel/);
});

test('executing worker and bound model Agent cannot approve their own receipt',()=>{
 let x=start(fixture());
 x=event(x,'task_receipt',{taskId:'parent-one',
  workerId:'mac-worker',leaseId:'lease-1234',
  receiptId:'receipt-1234',result:'passed',evidenceSha256:digest});
 for(const verifierId of ['mac-worker','openclaw-dev']){
  assert.throws(()=>event(x,'task_accept',{
   taskId:'parent-one',receiptId:'receipt-1234',verifierId
  }),/verification_required/);
  assert.equal(x.tasks[0].status,'verification_pending');
  assert.deepEqual(readyTasks(x),[]);
 }
});
test('distinct reviewer identity remains only a reducer check, not owner authorization',()=>{
 let x=start(fixture());
 x=event(x,'task_receipt',{taskId:'parent-one',
  workerId:'mac-worker',leaseId:'lease-1234',
  receiptId:'receipt-1234',result:'passed',evidenceSha256:digest});
 x=event(x,'task_accept',{taskId:'parent-one',receiptId:'receipt-1234',
  verifierId:'independent-reviewer'});
 assert.equal(x.tasks[0].verifiedBy,'independent-reviewer');
 assert.equal(x.tasks[0].status,'done');
 // No claim that the reducer authenticates who generated that name; the
 // authorizing entry point must independently attest owner review.
});
