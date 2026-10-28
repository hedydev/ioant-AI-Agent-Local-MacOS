import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildLocalAgentPlan} from '../stage2/local-agent-workflow.mjs';
import {applyWorkflowEvent} from '../stage2/workflow-engine.mjs';
import {checkRequirementsEvidence,inspectRequirementsEvidenceStatus} from
 '../stage2/alice-requirements-evidence-status.mjs';

const lease='lease-'+'c'.repeat(24),rid='receipt-'+lease;
const at='2026-10-27T00:01:00Z';
const digest=b=>createHash('sha256').update(b).digest('hex');
function fixture(){
 const doc={schemaVersion:1,projectKey:'alice-ai',workflowId:'alice-local-pilot',
  taskId:'requirements',leaseId:lease,agentId:'alice-ai',result:'passed',
  reply:'模型回答中的私人测试数据 TOKEN-SENSITIVE-EXAMPLE',untrustedModelText:true};
 const bytes=Buffer.from(JSON.stringify(doc)+'\n','utf8');
 let w=buildLocalAgentPlan('alice-local-pilot',{projectKey:'alice-ai'}).ledger;
 const apply=(type,extra)=>{w=applyWorkflowEvent(w,{type,
  id:'evidence-event-'+type,expectedRevision:w.revision,
  at,taskId:'requirements',...extra})};
 apply('task_claim',{workerId:'analysis-worker',leaseId:lease,leaseUntil:'2026-10-27T00:11:00Z'});
 apply('task_start',{workerId:'analysis-worker',leaseId:lease});
 apply('task_receipt',{workerId:'analysis-worker',leaseId:lease,
  receiptId:rid,evidenceSha256:digest(bytes),result:'passed'});
 return {w,bytes};
}
test('private evidence metadata is verified without ever releasing model text',()=>{
 const {w,bytes}=fixture(),result=checkRequirementsEvidence(w,bytes);
 assert.deepEqual(result,{
  audit:'IOANT_ALICE_REQUIREMENTS_EVIDENCE_INTEGRITY',schemaVersion:1,
  state:'verified',projectKey:'alice-ai',workflowId:'alice-local-pilot',
  taskId:'requirements',evidenceContentsReleased:false,modelInvoked:false,
  chatWritten:false,taskAccepted:false,executionAuthorized:false,
  revision:24,taskStatus:'verification_pending',receiptCount:1,
  evidenceHashVerified:true,privateEvidenceValidated:true,
  ownerReviewStillRequired:true,readyTaskCount:0});
 assert.doesNotMatch(JSON.stringify(result),/TOKEN-SENSITIVE|模型回答|lease-|receipt-/);
});
test('evidence hash mismatch, substituted content and malformed JSON fail closed',()=>{
 const {w,bytes}=fixture();
 assert.throws(()=>checkRequirementsEvidence(w,Buffer.from('{"changed":true}')),
  /evidence_digest_mismatch/);
 const bad=structuredClone(w);
 bad.receipts[0].evidenceSha256=digest(Buffer.from('{'));
 assert.throws(()=>checkRequirementsEvidence(bad,Buffer.from('{')),
  /evidence_digest_mismatch|evidence_json_unverified/);
 const invalid=Buffer.from('{}');
 const wrong=structuredClone(w);wrong.receipts[0].evidenceSha256=digest(invalid);
 assert.throws(()=>checkRequirementsEvidence(wrong,invalid),/evidence_schema_unverified/);
 assert.equal(bytes.length<4096,true);
});
test('task status cannot be bypassed by a matching hash',()=>{
 const {w,bytes}=fixture();
 const accepted=structuredClone(w);accepted.tasks[0].status='done';
 assert.throws(()=>checkRequirementsEvidence(accepted,bytes),/workflow_status_unverified/);
 const other=structuredClone(w);other.tasks[1].status='leased';
 assert.throws(()=>checkRequirementsEvidence(other,bytes),/workflow_status_unverified/);
 const changed=structuredClone(w);changed.revision=25;
 assert.throws(()=>checkRequirementsEvidence(changed,bytes),/workflow_revision_or_roles_unverified/);
 const changedRole=structuredClone(w);changedRole.bindings[0].active=false;
 assert.throws(()=>checkRequirementsEvidence(changedRole,bytes),/workflow_revision_or_roles_unverified/);
});
test('receipt must match required task, worker and single attempt',()=>{
 const {w,bytes}=fixture();
 for(const mutate of [
  v=>v.receipts[0].workerId='review-worker',
  v=>v.receipts[0].attempt=2,
  v=>v.receipts[0].result='failed',
  v=>v.tasks[0].receiptId='receipt-other'
 ]){
  const bad=structuredClone(w);mutate(bad);
  assert.throws(()=>checkRequirementsEvidence(bad,bytes),/receipt_unverified/);
 }
});
test('explicit test mode refuses to inspect live user evidence',async()=>{
 const before=process.env.IOANT_WORKFLOW_TEST_ROOT;
 try{
  process.env.IOANT_WORKFLOW_TEST_ROOT='1';
  const result=await inspectRequirementsEvidenceStatus();
  assert.equal(result.state,'blocked');
  assert.equal(result.evidenceContentsReleased,false);
  assert.equal(result.reason,'live_inspection_disabled_in_test_mode');
 }finally{
  if(before===undefined)delete process.env.IOANT_WORKFLOW_TEST_ROOT;
  else process.env.IOANT_WORKFLOW_TEST_ROOT=before;
 }
});
