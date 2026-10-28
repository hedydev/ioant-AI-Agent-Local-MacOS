import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {classifyGuardObservation,evaluateGuardHandoff,
 classifyWorkerLogTail} from '../stage2/guard-worker-core.mjs';
import {incidentKey,safeServiceIdentity} from '../stage2/guard-worker.mjs';
import {renderGuardPlist} from '../stage2/guard-worker-service.mjs';
import {renderPlist} from '../stage2/ops-supervisor.mjs';
import {renderAliceCoordinatorPlist,aliceCoordinatorManifest}
 from '../stage2/alice-coordinator-service.mjs';
const base={identityVerified:true,serviceState:'running',
 privateState:'observed',pendingPhase:'none',recentLogCode:null,
 recentLogAgeSeconds:null};
const oldUrl='https://chatgpt.com/g/g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/c/12345678-aaaa-bbbb-cccc-0123456789ab';
const newUrl='https://chatgpt.com/g/g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/c/12345678-aaaa-bbbb-cccc-0123456789ac';
const alien='https://chatgpt.com/g/g-p-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/c/12345678-aaaa-bbbb-cccc-0123456789ad';
test('healthy running worker without pending receipt has no incident',()=>{
 const r=classifyGuardObservation(base);
 assert.deepEqual(r.incidentCodes,[]);
 assert.equal(r.mayRestartWorker,false);
 assert.equal(r.maySendChatMessage,false);
 assert.equal(r.mayRerouteChat,false);
});
test('verified stopped and registered-unloaded services are incidents',()=>{
 for(const serviceState of ['stopped','unloaded'])
  assert.ok(classifyGuardObservation({...base,serviceState})
   .incidentCodes.includes('watcher_stopped'));
});
test('unverified service identity is never treated as a safe message target',()=>{
 const r=classifyGuardObservation({...base,identityVerified:false});
 assert.deepEqual(r.incidentCodes,['service_unverifiable']);
});
test('inflight feedback becomes alert only after a bounded observation',()=>{
 const early=classifyGuardObservation({...base,pendingPhase:'press_intent',
  pendingAgeSeconds:10});
 const late=classifyGuardObservation({...base,pendingPhase:'press_intent',
  pendingAgeSeconds:181});
 assert.equal(early.feedbackPending,true);
 assert.deepEqual(early.incidentCodes,[]);
 assert.ok(late.incidentCodes.includes('feedback_unconfirmed'));
 assert.equal(late.mayReplayTask,false);
});
test('recent STOP is alert, historical log is not',()=>{
 assert.ok(classifyGuardObservation({...base,recentLogCode:'stop',
  recentLogAgeSeconds:20}).incidentCodes.includes('recent_watcher_stop'));
 assert.deepEqual(classifyGuardObservation({...base,recentLogCode:'stop',
  recentLogAgeSeconds:400}).incidentCodes,[]);
});
test('relay failure is bounded, no automatic browser fallback',()=>{
 const s=classifyGuardObservation({...base,recentLogCode:'relay',
  recentLogAgeSeconds:15});
 assert.ok(s.incidentCodes.includes('relay_unavailable'));
 assert.equal(s.maySendChatMessage,false);
});
test('diagnostic code classifier never returns raw log text',()=>{
 const secret='token=an_untrusted_secret';
 const r=classifyWorkerLogTail('[loop] STOP: '+secret);
 assert.equal(r,'stop');assert.ok(!r.includes(secret));
 assert.equal(classifyWorkerLogTail('[loop] Feedback send deferred: browser unavailable or delivery uncertain; task not repeated.'),'feedback_deferred');
});
test('handoff refuses invalid, same and cross-Project destinations',()=>{
 assert.equal(evaluateGuardHandoff({oldUrl,newUrl:'https://evil.example'}).reason,'invalid_chat_url');
 assert.equal(evaluateGuardHandoff({oldUrl,newUrl:oldUrl}).reason,'same_chat_handoff');
 assert.equal(evaluateGuardHandoff({oldUrl,newUrl:alien}).reason,'cross_project_handoff');
});
test('handoff blocks when old task feedback is unresolved',()=>{
 const r=evaluateGuardHandoff({oldUrl,newUrl,oldFeedbackClear:false,
  operatorApproved:true});
 assert.equal(r.state,'blocked');
 assert.equal(r.reason,'old_feedback_unresolved');
});
test('operator approval does not bypass handoff receipt and stop checks',()=>{
 const start={oldUrl,newUrl,oldFeedbackClear:true};
 assert.equal(evaluateGuardHandoff(start).reason,'operator_approval_required');
 const approved={...start,operatorApproved:true};
 assert.equal(evaluateGuardHandoff(approved).reason,'new_chat_membership_not_verified');
 const matched={...approved,newProjectMembershipVerified:true};
 assert.equal(evaluateGuardHandoff(matched).reason,'handoff_receipt_not_verified');
 const delivered={...matched,newChatReceiptVerified:true};
 assert.equal(evaluateGuardHandoff(delivered).reason,'old_watcher_not_stopped');
 const complete=evaluateGuardHandoff({...delivered,oldWatcherStopped:true});
 assert.equal(complete.reason,'operator_rebind_preflight_only');
 assert.equal(complete.changedBinding,false);
});
test('real installed main plist is only trusted with recognized exact identity',()=>{
 const source=renderPlist('/opt/homebrew/bin',{chatUrl:
  'https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/6ae18e93-e2a0-83ec-aac9-88105079f208'});
 const result=safeServiceIdentity('openclaw-workflow',source);
 assert.equal(result?.conversationId,'6ae18e93-e2a0-83ec-aac9-88105079f208');
 assert.equal(safeServiceIdentity('openclaw-workflow',source+'unsafe'),null);
 assert.equal(safeServiceIdentity('unknown',source),null);
});
test('Alice read-only coordinator uses its own pinned Project binding',()=>{
 const s=renderAliceCoordinatorPlist('/opt/homebrew/bin');
 const x=safeServiceIdentity('alice-ai',s);
 assert.equal(x.chatUrl,aliceCoordinatorManifest().chatUrl);
 assert.equal(safeServiceIdentity('alice-ai',s.replace('readonly.sh','writer.sh')),null);
});
test('incident keys are chat-scoped and daily deduplicated',()=>{
 const svc={projectKey:'openclaw-workflow',conversationId:'old'};
 const key=incidentKey(svc,'watcher_stopped','2026-10-28');
 assert.equal(key,incidentKey(svc,'watcher_stopped','2026-10-28'));
 assert.notEqual(key,incidentKey({...svc,conversationId:'new'},
  'watcher_stopped','2026-10-28'));
 assert.notEqual(key,incidentKey(svc,'watcher_stopped','2026-10-29'));
 assert.match(key,/^[0-9a-f]{24}$/);
});
test('Guard launchd service is periodic and independent of existing workers',()=>{
 const content=renderGuardPlist('/opt/homebrew/bin/node');
 assert.match(content,/com\.ioant\.openclaw\.guard-worker/);
 assert.match(content,/<key>StartInterval<\/key><integer>60<\/integer>/);
 assert.match(content,/guard-worker\.mjs/);
 assert.match(content,/<string>once<\/string>/);
 assert.match(content,/<key>KeepAlive<\/key><false\/>/);
 assert.doesNotMatch(content,/safe-watcher\.plist|alice-coordinator\.plist|--chat-url/);
});
test('Guard source stays passive and never uses browser, native CUA or process signals',()=>{
 const src=readFileSync(resolve(import.meta.dirname,'../stage2/guard-worker.mjs'),'utf8');
 assert.match(src,/await persistIncidents\(report\)/);
 assert.match(src,/installedPlistBinding/);
 assert.doesNotMatch(src,/computer\.act|browser --|SIGKILL|kickstart|bootout|bootstrap/);
 const service=readFileSync(resolve(import.meta.dirname,
  '../stage2/guard-worker-service.mjs'),'utf8');
 assert.match(service,/args\[0\]==='install'/);
 assert.match(service,/args\[0\]==='status'/);
 assert.doesNotMatch(service,/killall|reset --hard/);
});
