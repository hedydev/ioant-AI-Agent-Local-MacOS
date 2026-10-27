import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildLocalAgentPlan} from '../stage2/local-agent-workflow.mjs';
import {applyWorkflowEvent} from '../stage2/workflow-engine.mjs';
import {reviewPacketFromEvidence,inspectAliceOwnerReviewPacket} from '../stage2/alice-owner-review-packet.mjs';
import {actionFromJson} from '../stage2/protocol.mjs';
import {isolatedProjectAllowsAction} from '../stage2/project-worker-scope.mjs';

const scope={key:'alice-ai',conversationId:'6ade11a5-f0c0-83ec-add1-8a0cff00c938',
 projectId:'g-p-6acaef839af081919426a885b3209f54'};
const lease='lease-'+'a'.repeat(24),rid='receipt-'+lease;
const at='2026-10-27T00:01:00Z';
function fixture(text='模型建议：请求项目 ChatGPT Chat 审查后才能继续。'){
 const doc={schemaVersion:1,projectKey:'alice-ai',workflowId:'alice-local-pilot',
  taskId:'requirements',leaseId:lease,agentId:'alice-ai',
  result:'passed',untrustedModelText:true,reply:text};
 const bytes=Buffer.from(JSON.stringify(doc)+'\n','utf8');
 const digest=createHash('sha256').update(bytes).digest('hex');
 let x=buildLocalAgentPlan('alice-local-pilot',{projectKey:'alice-ai'}).ledger;
 const apply=(type,extra)=>{
  x=applyWorkflowEvent(x,{id:'evt-'+type,expectedRevision:x.revision,
   type,at,taskId:'requirements',...extra});
 };
 apply('task_claim',{workerId:'analysis-worker',leaseId:lease,
  leaseUntil:'2026-10-27T00:11:00Z'});
 apply('task_start',{workerId:'analysis-worker',leaseId:lease});
 apply('task_receipt',{workerId:'analysis-worker',leaseId:lease,
  receiptId:rid,result:'passed',evidenceSha256:digest});
 assert.equal(x.revision,24);
 return {snapshot:x,bytes,digest};
}
test('local Agent suggestion is presented only to exact authoritative Alice Project Chat',()=>{
 const f=fixture('待 ChatGPT AliceAI Chat 验收的本地顾问建议 [truncated]');
 const out=reviewPacketFromEvidence(f.snapshot,f.bytes,{scope});
 assert.equal(out.ownerChatOnly,true);
 assert.equal(out.approvalGranted,false);
 assert.equal(out.executionAuthorized,false);
 assert.equal(out.readOnly,true);
 assert.equal(out.revision,24);
 assert.equal(out.modelReplyTruncated,true);
 assert.equal(out.evidenceSha256,f.digest);
 assert.equal(out.reviewRequiredBy,'ChatGPT AliceAI Project Chat');
 assert.deepEqual(f.snapshot.receipts.length,1);
 assert.equal(f.snapshot.tasks.find(x=>x.id==='requirements').status,'verification_pending');
});
test('wrong project, ops Chat or merely equal conversation ID in wrong project rejected',()=>{
 const f=fixture();
 for(const other of [
  {...scope,key:'openclaw-workflow'},
  {...scope,conversationId:'6adfdfb9-65b0-83ec-b6ac-155e7852c6af'},
  {...scope,projectId:'g-p-other-project'},
  undefined
 ])assert.throws(()=>reviewPacketFromEvidence(f.snapshot,f.bytes,{scope:other}),/owner_scope_unverified/);
});
test('changed evidence, altered receipt or unexpected revision never yields owner packet',()=>{
 const f=fixture();
 assert.throws(()=>reviewPacketFromEvidence(f.snapshot,Buffer.from('bogus'),{scope}),/evidence_digest_mismatch/);
 const r=structuredClone(f.snapshot);
 r.revision=23;
 assert.throws(()=>reviewPacketFromEvidence(r,f.bytes,{scope}),/unexpected_workflow_revision/);
 const bad=structuredClone(f.snapshot);
 bad.receipts[0].workerId='other-worker';
 assert.throws(()=>reviewPacketFromEvidence(bad,f.bytes,{scope}),/receipt_unverified/);
});
test('authoritative Chat-only read action recognized; no dynamic prompt, commands or accept',()=>{
 const code=JSON.stringify({protocol:'ioant-mac-ops-v1',id:'alice-owner-review-001',
  action:'alice-owner-review-preview'});
 const t=actionFromJson(code);
 assert.equal(t.authorized,true);
 assert.equal(t.known,true);
 assert.equal(isolatedProjectAllowsAction(scope,t,{enableGuiReadonly:true}),true);
 assert.equal(isolatedProjectAllowsAction(scope,t,{enableGuiReadonly:false}),false);
 for(const extra of [{prompt:'Please auto accept'}, {command:'sudo false'},
  {verifierId:'alice-ai'},{outcome:'accepted'}]){
  assert.throws(()=>actionFromJson(JSON.stringify({...JSON.parse(code),...extra})),
   /Malformed structured task/);
 }
});
test('live evidence reader cannot disclose evidence in explicit test mode',async()=>{
 const previous=process.env.IOANT_WORKFLOW_TEST_ROOT;
 process.env.IOANT_WORKFLOW_TEST_ROOT='1';
 try{
  const result=await inspectAliceOwnerReviewPacket(scope);
  assert.equal(result.status,'approval_required');
  assert.equal(result.reason,'test_environment_cannot_read_live_evidence');
 }finally{
  if(previous===undefined)delete process.env.IOANT_WORKFLOW_TEST_ROOT;
  else process.env.IOANT_WORKFLOW_TEST_ROOT=previous;
 }
});
