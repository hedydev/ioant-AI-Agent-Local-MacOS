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
 assert.deepEqual(r.matchedCategories,['admin_scope_missing','config_validation']);
 assert.equal(r.ambiguity,'multiple_categories_multiple_records');
});

test('one Gateway config.patch log record with two hints discloses ONLY two fixed labels',()=>{
 const privateLog={
  payload:{entries:[{
   level:'error',method:'config.patch',
   message:'config.patch invalid params: unknown field from missing operator.admin scope; Bearer SUPERSECRET_TOKEN_123',
   auth:{token:'MOST_PRIVATE'},filename:'/Users/private/.openclaw/openclaw.json'
  }]}
 };
 const r=classifyPatchLogs(privateLog);
 assert.equal(r.status,'observed');
 assert.equal(r.scannedLines,1);
 assert.equal(r.matchedPatchLines,1);
 assert.equal(r.category,'unclassified');
 assert.equal(r.ambiguity,'multiple_categories_same_record');
 assert.deepEqual(r.matchedCategories,['admin_scope_missing','invalid_rpc_params']);
 assert.equal(r.recentErrorEvidence,true);
 const output=JSON.stringify(r);
 for(const secret of ['SUPERSECRET_TOKEN_123','MOST_PRIVATE','/Users/private','unknown field','config.patch invalid params'])
   assert.equal(output.includes(secret),false,'raw Gateway payload must never escape');
});

test('no recognized hint is distinct from several hints and malformed diagnostic input',()=>{
 const missing=classifyPatchLogs({lines:['config.patch operation started']});
 assert.equal(missing.category,'unclassified');
 assert.equal(missing.ambiguity,'none');
 assert.deepEqual(missing.matchedCategories,[]);
 assert.equal(missing.recentErrorEvidence,false);
 const unknown=classifyPatchLogs({payload:{unknown:'PRIVATE'}}); 
 assert.equal(unknown.status,'unsupported_log_shape');
 assert.equal(unknown.matchedCategories,undefined);
});

test('read-only diagnostic identifies fixed Ollama schema path and issue type, without actual field values',()=>{
 const secret='Bearer NEVER_EXPOSE_IN_RESPONSE';
 const record={method:'config.patch',level:'error',
  message:'invalid params: invalid config: models.providers.ollama.models[0].contextTokens: Expected number, received string; '+secret,
  credentials:{apiKey:'DONT_LEAK'},filename:'/Users/hidden/private.json'};
 const result=classifyPatchLogs({entries:[record]});
 assert.deepEqual(result.matchedCategories,['invalid_rpc_params','config_validation']);
 assert.deepEqual(result.issueScopes,['ollama_models','ollama_provider']);
 assert.deepEqual(result.issueKinds,['invalid_type']);
 assert.equal(result.ambiguity,'multiple_categories_same_record');
 assert.doesNotMatch(JSON.stringify(result),/NEVER_EXPOSE|DONT_LEAK|hidden|contextTokens|models\\.providers\\.ollama|Bearer/);
});

test('read-only diagnostic distinguishes other-provider schema errors and guard outcomes',()=>{
 const data={lines:[
  'config.patch invalid params: invalid config: models.providers.anthropic.baseUrl Too small: expected string to have >=1 characters',
  'config.patch Config write rejected: missing-meta-vs-last-good',
  'no matching method; token=secret'
 ]};
 const r=classifyPatchLogs(data);
 assert.deepEqual(r.issueScopes,['other_model_provider']);
 assert.deepEqual(r.issueKinds,['value_too_small','write_guard']);
 assert.equal(r.matchedPatchLines,2);
 assert.doesNotMatch(JSON.stringify(r),/anthropic|baseUrl|secret|missing-meta/);
});

test('absence of safe evidence never leaks freeform unknown paths or claims a cause',()=>{
 const r=classifyPatchLogs({lines:[
  'config.patch invalid params: invalid config, uncategorized field my_private_provider_6: TOKEN_123'
 ]});
 assert.deepEqual(r.matchedCategories,['invalid_rpc_params','config_validation']);
 assert.deepEqual(r.issueScopes,[]);
 assert.deepEqual(r.issueKinds,[]);
 assert.equal(r.category,'unclassified');
 assert.doesNotMatch(JSON.stringify(r),/my_private_provider_6|TOKEN_123/);
});
