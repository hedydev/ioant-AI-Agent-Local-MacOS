import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseSafeOpenClawVersion,classifyPassiveLogTail,
 passiveCUAHostAudit}
 from '../scripts/openclaw-cua-host-ownership-passive.mjs';
import {classifyInvokeFailure}
 from '../scripts/openclaw-cua-readonly-invoke-diagnostic.mjs';
const source=readFileSync(resolve(import.meta.dirname,
 '../scripts/openclaw-cua-host-ownership-passive.mjs'),'utf8');

test('exact COMPUTER_HOST_BUSY emitted only as presence and bounded count',()=>{
 const msg='PRIVATE_INFO title=MySecretApp token: ABCD1234';
 const raw=[
  '{"message":"INVALID_REQUEST: COMPUTER_HOST_BUSY: another provider execution owns this computer /Users/private"}',
  '{"message":"PRIVATE_INFO title=MySecretApp token: ABCD1234"}',
  '{"message":"COMPUTER_HOST_BUSY: another provider execution owns this computer"}'
 ].join('\n');
 const r=classifyPassiveLogTail(raw);
 assert.equal(r.state,'observed');
 assert.equal(r.inspectedLines,3);
 assert.equal(r.exactComputerHostBusyCodeObserved,true);
 assert.equal(r.exactHostBusyCodeOccurrences,2);
 assert.equal(r.hostBusyOwnershipPhraseObserved,true);
 assert.equal(r.currentOwnerVerified,false);
 assert.equal(r.staleOwnerVerified,false);
 assert.equal(r.safeToReleaseOwner,false);
 for(const secret of [msg,'/Users/private','MySecretApp','ABCD1234'])
  assert.equal(JSON.stringify(r).includes(secret),false);
});
test('empty log tail never proves stale owner or permission problems',()=>{
 const r=classifyPassiveLogTail('');
 assert.equal(r.state,'observed');
 assert.equal(r.inspectedLines,0);
 assert.equal(r.exactComputerHostBusyCodeObserved,false);
 assert.equal(r.currentOwnerVerified,false);
 assert.equal(r.staleOwnerVerified,false);
});
test('oversized or non-text log tail returns safe inconclusive category',()=>{
 for(const v of [null,5,'x'.repeat(300001)]){
  const r=classifyPassiveLogTail(v);
  assert.equal(r.state,'inconclusive');
  assert.equal(r.reason,'log_tail_unavailable_or_oversized');
 }
});
test('close execution mention is not proof of a released owner',()=>{
 const r=classifyPassiveLogTail('{"message":"__close_execution" }');
 assert.equal(r.closeExecutionMentioned,true);
 assert.equal(r.currentOwnerVerified,false);
 assert.equal(r.safeToReleaseOwner,false);
});
test('openclaw version parser accepts only unique standard version tokens',()=>{
 assert.equal(parseSafeOpenClawVersion('OpenClaw 2026.10.7\n'),'2026.10.7');
 assert.equal(parseSafeOpenClawVersion('2026.10.7 and 2026.9.4'),null);
 assert.equal(parseSafeOpenClawVersion('sensitive details'),null);
 assert.equal(parseSafeOpenClawVersion({secret:'cannot-emit'}),null);
});
test('passive audit reads version and logs and never invokes native action',async()=>{
 const invocations=[];
 const r=await passiveCUAHostAudit({
  allowedRuntime:async()=>true,
  run:async args=>{
   invocations.push(args);
   if(args[0]==='--version')return 'OpenClaw 2026.10.7';
   if(args[0]==='logs')return '{"message":"COMPUTER_HOST_BUSY"}';
   throw Error('unexpected action');
  }
 });
 assert.equal(invocations.length,2);
 assert.deepEqual(invocations[0],['--version']);
 assert.deepEqual(invocations[1],
  ['logs','--json','--limit','1000','--max-bytes','250000']);
 assert.equal(r.state,'observed');
 assert.equal(r.installedOpenClawVersion,'2026.10.7');
 assert.equal(r.logTail.exactComputerHostBusyCodeObserved,true);
 assert.equal(r.invokedComputerAct,false);
 assert.equal(r.ownerReleaseAttempted,false);
 assert.equal(r.gatewayServiceRestarted,false);
 assert.equal(r.changedDesktop,false);
});
test('Gateway logs unavailable stays inconclusive without raw CLI errors',async()=>{
 const r=await passiveCUAHostAudit({
  allowedRuntime:async()=>true,
  run:async args=>{
   if(args[0]==='--version')return '2026.10.7';
   throw Error('token secret and private window')
  }
 });
 assert.equal(r.state,'inconclusive');
 assert.equal(r.reason,'gateway_log_tail_unavailable');
 assert.equal(JSON.stringify(r).includes('private window'),false);
});
test('private runtime rejected before even reading CLI version',async()=>{
 let calls=0;
 const r=await passiveCUAHostAudit({
  allowedRuntime:async()=>false,
  run:async()=>{calls++;throw Error('must not run')}
 });
 assert.equal(r.state,'blocked');
 assert.equal(calls,0);
});
test('previously unclassified host-busy code becomes explicit without leaking error',()=>{
 const r=classifyInvokeFailure({code:1,stdout:JSON.stringify({ok:false,
  error:{type:'cli_error',message:
  'INVALID_REQUEST: COMPUTER_HOST_BUSY: another provider execution owns this computer /Users/private'}
 })});
 assert.equal(r.category,'computer_execution_occupied');
 assert.equal(r.nativeCode,'COMPUTER_HOST_BUSY');
 assert.equal(JSON.stringify(r).includes('/Users/private'),false);
});
test('passive audit contains no direct CUA node invoke, kill, release or GUI fallback',()=>{
 assert.doesNotMatch(source,/nodes','invoke|__close_execution','executionId|screen\.snapshot|osascript|CGEventPost|--browser-profile|exec\('kill|exec\('launchctl/);
 assert.match(source,/ownerReleaseAttempted:false/);
 assert.match(source,/nodeDisconnectAttempted:false/);
 assert.match(source,/rawGatewayLogsEmitted:false/);
});
