import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {evaluateChatContinuity} from '../stage2/guard-chat-continuity.mjs';

const root=resolve(import.meta.dirname,'..');
const manifest=JSON.parse(readFileSync(resolve(root,
 'config/chat-projects.json'),'utf8'));
const mainUrl='https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/6ae18e93-e2a0-83ec-aac9-88105079f208';
const aliceUrl='https://chatgpt.com/g/g-p-6acaef839af081919426a885b3209f54-ai-mc-alice/c/6ade11a5-f0c0-83ec-add1-8a0cff00c938';
const baseline=(projectKey='openclaw-workflow')=>{
 const url=projectKey==='alice-ai'?aliceUrl:mainUrl;
 const conversationId=url.split('/').at(-1);
 return {projectKey,manifest,binding:{chatUrl:url,conversationId},
  service:{projectKey,conversationId,serviceState:'running',
   identityVerified:true,feedbackPending:false,incidentCodes:[]},
  settlement:{verified:true,taskFeedback:false,guardNotice:false,
   maintainerNotice:false,initialization:false}};
};
test('actual main Chat binding is preferred over historical registry entry',()=>{
 const r=evaluateChatContinuity(baseline());
 assert.equal(r.state,'candidate');
 assert.equal(r.reason,'registry_reconciliation_required');
 assert.equal(r.manifestDrift,true);
 assert.equal(r.currentConversationId,'6ae18e93-e2a0-83ec-aac9-88105079f208');
 assert.equal(r.registeredConversationId,
  manifest.projects.find(p=>p.key==='openclaw-workflow').chatUrl.split('/').at(-1));
 assert.equal(r.changedBinding,false);
});
test('Alice route agrees with exact installed isolated service identity',()=>{
 const r=evaluateChatContinuity(baseline('alice-ai'));
 assert.equal(r.state,'candidate');
 assert.equal(r.reason,'operator_approved_new_chat_required');
 assert.equal(r.manifestDrift,false);
 assert.equal(r.agentId,'alice-ai');
});
test('unverified source identity fails before any migration',()=>{
 for(const patch of [
  {binding:null},{service:{...baseline().service,identityVerified:false}},
  {service:{...baseline().service,conversationId:'other'}}]){
  const r=evaluateChatContinuity({...baseline(),...patch});
  assert.equal(r.state,'blocked');
  assert.equal(r.reason,'installed_chat_identity_unverified');
 }
});
test('cross-Project route divergence blocks even if conversation is verified',()=>{
 const bad=structuredClone(manifest);
 bad.projects[0].chatUrl=aliceUrl;
 const r=evaluateChatContinuity({...baseline(),manifest:bad});
 assert.equal(r.state,'blocked');
 assert.equal(r.reason,'installed_project_manifest_mismatch');
});
test('all unsettled sends and messages block handoff',()=>{
 for(const key of ['taskFeedback','guardNotice','maintainerNotice','initialization']){
  const original=baseline();
  const r=evaluateChatContinuity({...original,
   settlement:{...original.settlement,[key]:true}});
  assert.equal(r.state,'blocked');
  assert.equal(r.reason,'unresolved_chat_delivery');
  assert.equal(r.pending[key],true);
  assert.equal(r.changedBinding,false);
 }
});
test('Guard scan pending feedback blocks even when other state says clear',()=>{
 const original=baseline();
 const r=evaluateChatContinuity({...original,
  service:{...original.service,feedbackPending:true}});
 assert.equal(r.state,'blocked');
 assert.equal(r.reason,'unresolved_task_feedback');
});
test('stopped worker needs a different handoff text source and never restarts',()=>{
 const original=baseline();
 const r=evaluateChatContinuity({...original,
  service:{...original.service,serviceState:'stopped'}});
 assert.equal(r.state,'candidate');
 assert.equal(r.reason,'old_worker_not_running_handoff_text_unavailable');
 assert.equal(r.restartedWorker,false);
});
test('unverifiable worker state, state file or route blocks safely',()=>{
 const original=baseline();
 for(const patch of [
  {service:{...original.service,serviceState:'unknown'}},
  {settlement:{verified:false}},
  {manifest:{schemaVersion:1,projects:[]}}]){
  assert.equal(evaluateChatContinuity({...original,...patch}).state,'blocked');
 }
});
test('none of readiness results claims new-chat proof or permission transfer',()=>{
 const r=evaluateChatContinuity(baseline());
 assert.equal(r.sentHandoff,false);
 assert.equal(r.createdChat,false);
 assert.equal(r.transferredPermissions,false);
 assert.ok(r.missingEvidence.includes('new_chat_receipt'));
 assert.ok(r.missingEvidence.includes('old_watcher_shutdown'));
});
test('separate CLI reads installed plist and state, never performs migration',()=>{
 const src=readFileSync(resolve(root,'stage2/guard-worker.mjs'),'utf8');
 const p=src.indexOf('async function handoffReadiness(projectKey)');
 const q=src.indexOf('async function handoffCheck(projectKey,url)',p);
 assert.ok(p>0&&q>p);
 const method=src.slice(p,q);
 assert.match(method,/safeServiceIdentity\(projectKey,plist\)/);
 assert.match(method,/readHandoffSettlement\(binding.chatUrl\)/);
 assert.match(method,/evaluateChatContinuity/);
 assert.match(src,/args\[0\]==='handoff-readiness'/);
 assert.doesNotMatch(method,/browser|bootout|rebind|restart|launchctl|sendToChat/);
});
