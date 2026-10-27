import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 buildLocalAgentPlan,proposeLocalDispatch,verifyLocalAgentBindings,ROLE_ROUTES,STAGES
} from '../stage2/local-agent-workflow.mjs';
import {applyWorkflowEvent,readyTasks} from '../stage2/workflow-engine.mjs';
const time='2026-10-27T00:00:00Z';
let seq=0;
function next(w,type,payload={}){
 return applyWorkflowEvent(w,{id:'live-event-'+(++seq),type,at:time,
  expectedRevision:w.revision,...payload});
}
test('fixed DAG uses seven distinct roles with requirements-first and parallel risk/architecture',()=>{
 assert.equal(ROLE_ROUTES.length,7);
 assert.equal(STAGES.length,7);
 const {ledger,summary}=buildLocalAgentPlan('alice-plan-pilot',{projectKey:'alice-ai'});
 assert.equal(summary.workerCount,7);
 assert.equal(summary.bindings,7);
 assert.deepEqual(readyTasks(ledger),['requirements']);
 const offer=proposeLocalDispatch(ledger,{projectKey:'alice-ai'});
 assert.equal(offer.executionAuthorized,false);
 assert.deepEqual(offer.proposals.map(p=>p.taskId),['requirements']);
 assert.equal(offer.proposals[0].workerId,'analysis-worker');
 assert.equal(verifyLocalAgentBindings(ledger,{projectKey:'alice-ai'}).rolesVerified,true);
});
test('a receipt alone cannot unblock next stage without independent acceptance',()=>{
 let {ledger}=buildLocalAgentPlan('ops-plan-pilot',{projectKey:'openclaw-workflow'});
 const first=proposeLocalDispatch(ledger,{projectKey:'openclaw-workflow'}).proposals[0];
 ledger=next(ledger,'task_claim',{taskId:first.taskId,workerId:first.workerId,
  leaseId:'lease-pilot-1001',leaseUntil:'2026-10-27T00:03:00Z'});
 ledger=next(ledger,'task_start',{taskId:first.taskId,workerId:first.workerId,leaseId:'lease-pilot-1001'});
 ledger=next(ledger,'task_receipt',{taskId:first.taskId,workerId:first.workerId,
  leaseId:'lease-pilot-1001',receiptId:'receipt-pilot-1001',result:'passed',
  evidenceSha256:'a'.repeat(64)});
 assert.deepEqual(readyTasks(ledger),[]);
 ledger=next(ledger,'task_accept',{taskId:first.taskId,receiptId:'receipt-pilot-1001',verifierId:'reviewer-audit'});
 assert.deepEqual(readyTasks(ledger),['risk-review','architecture']);
 const offers=proposeLocalDispatch(ledger,{projectKey:'openclaw-workflow'});
 assert.deepEqual(offers.proposals.map(p=>p.workerId),['systems-worker','architecture-worker']);
 assert.equal(offers.proposals.every(p=>p.state==='candidate'),true);
});
test('missing, conflicting or unbound roles never receive fallback assignments',()=>{
 const {ledger:base}=buildLocalAgentPlan('alice-route-safety',{projectKey:'alice-ai'});
 const noAgent=structuredClone(base);
 noAgent.bindings=noAgent.bindings.filter(x=>x.agentId!=='requirements-analyst');
 let offer=proposeLocalDispatch(noAgent,{projectKey:'alice-ai'});
 assert.deepEqual(offer.proposals,[{taskId:'requirements',state:'unassigned',workerId:null}]);
 const wrong=structuredClone(base);
 wrong.workers.push({id:'shadow-worker',capabilities:['requirements']});
 wrong.bindings.push({workerId:'shadow-worker',agentId:'requirements-analyst',active:true});
 offer=proposeLocalDispatch(wrong,{projectKey:'alice-ai'});
 assert.deepEqual(offer.proposals,[{taskId:'requirements',state:'ambiguous',workerId:null}]);
 assert.equal(verifyLocalAgentBindings(noAgent,{projectKey:'alice-ai'}).rolesVerified,false);
});
test('cross-project route and malformed names are blocked, without any host privileges',()=>{
 for(const projectKey of ['other','unknown',null,undefined]){
  assert.throws(()=>buildLocalAgentPlan('workflow-safe',{projectKey}),/unregistered_dispatch_project/);
 }
 for(const s of ['../world','bad!','xx']){
  assert.throws(()=>buildLocalAgentPlan(s,{projectKey:'alice-ai'}),/invalid_workflow_id/);
 }
 const source=readFileSync(new URL('../stage2/local-agent-workflow.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/child_process|execFile|spawn\(|osascript|browser |ssh |sudo |launchctl|gateway run|function\\s+eval/);
 const {ledger}=buildLocalAgentPlan('alice-plan-no-host',{projectKey:'alice-ai'});
 assert.equal(proposeLocalDispatch(ledger,{projectKey:'alice-ai'}).executionAuthorized,false);
});
