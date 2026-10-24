import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPatchLogs,diagnosePatchFailure} from '../stage2/openclaw-patch-failure-diagnostic.mjs';
import {actionFromJson} from '../stage2/protocol.mjs';
import {actionPlan,runAction} from '../stage2/runner.mjs';

test('fixed read-only diagnostic requires no additional operator approval and allows no caller args',async()=>{
 const params={protocol:'ioant-mac-ops-v1',id:'patch-failure-diag-0001',action:'openclaw-patch-failure-diagnostic'};
 const t=actionFromJson(JSON.stringify(params));
 assert.equal(t.authorized,true);
 const plan=actionPlan(t.action,'/fixed/repo');
 assert.equal(plan.bin,process.execPath);
 assert.deepEqual(plan.args,['stage2/openclaw-patch-failure-diagnostic.mjs']);
 assert.throws(()=>actionFromJson(JSON.stringify({...params,command:'openclaw gateway call config.patch'})),/Malformed/);
 assert.equal((await runAction('patch-config-arbitrary','/fixed/repo')).status,'approval_required');
});

test('Gateway log clues become fixed non-sensitive classes with no log text escaping',()=>{
 for(const [message,expected] of [
  ['config.patch failed: missing operator.admin scope admin token=secret-test','admin_scope_missing'],
  ['config.patch invalid params: unknown field isNotValid secret=hey','invalid_rpc_params'],
  ['config.patch invalid config: model schema rejected password=hey','config_validation'],
  ['config.patch stale baseHash mismatch, gateway token=secret','revision_conflict'],
  ['config.patch rate limit exceeded retryAfterMs 35000','rate_limited'],
  ['config.patch socket closed during restart after save','gateway_transport'],
  ['config.patch only an unrelated info line','unclassified']
 ]){
  const result=classifyPatchLogs({lines:['normal process output',{level:'error',message}]});
  assert.equal(result.status,'observed');
  assert.equal(result.matchedPatchLines,1);
  assert.equal(result.category,expected);
  assert.equal(result.scannedLines,2);
  assert.doesNotMatch(JSON.stringify(result),/secret|password=hey|token=secret|isNotValid/);
 }
});

test('wrapped and malformed log replies fail closed',()=>{
 assert.equal(classifyPatchLogs({payload:{lines:['config.patch permission denied']}}).category,'admin_scope_missing');
 assert.equal(classifyPatchLogs({metadata:{lineCount:50}}).status,'unsupported_log_shape');
 assert.equal(classifyPatchLogs({lines:new Array(500).fill('config.patch')}).status,'unsupported_log_shape');
 assert.equal(classifyPatchLogs({lines:[{message:'config.patch token=secret input should not leave the Mac'}]}).category,'unclassified');
});

test('read-only RPC failure is a status without raw stderr; no config.patch RPC is made',async()=>{
 const seen=[];
 const result=await diagnosePatchFailure({rpc:async(method,params)=>{
   seen.push([method,params]);
   throw Error('forbidden token=sensitive');
 }});
 assert.deepEqual(seen,[['logs.tail',{limit:200,maxBytes:131072}]]);
 assert.equal(result.status,'logs_unavailable');
 assert.equal(JSON.stringify(result).includes('sensitive'),false);
});

test('multiple correlated but ambiguous classes do not speculate',()=>{
 const r=classifyPatchLogs({lines:[
   'config.patch invalid config',
   'config.patch missing operator.admin scope',
   'unrelated text containing password=something'
 ]});
 assert.equal(r.category,'unclassified');
 assert.equal(r.recentErrorEvidence,true);
 assert.equal(r.matchedPatchLines,2);
});
