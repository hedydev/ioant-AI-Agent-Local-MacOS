import test from 'node:test';
import assert from 'node:assert/strict';
import {runMainContinuationBenchmark} from '../stage2/tasks/main-continuation-benchmark.mjs';
const key='agent:main:off-base-123456789abc';
const before={key,inputTokens:10935,outputTokens:1};
const after={key,inputTokens:7960,outputTokens:1};
const mocks=({active=[],prior=[before],next=[after],status='ok',reply='6',runId='local-run'}={})=>{
 const calls=[];
 const rpc=async(method,params)=>{
  calls.push({method,params});
  if(method==='sessions.list'){
   return params.activeOnly?{sessions:active,hasMore:false}:
     {sessions:calls.filter(x=>x.method==='agent').length?next:prior};
  }
  if(method==='agent')return {status:'accepted',runId};
  if(method==='agent.wait')return {status};
  if(method==='chat.history')return {messages:[{role:'user',content:'SECRET_MESSAGE'},
    {role:'assistant',content:[{type:'text',text:reply}]}]};
  throw Error('unexpected method');
 };
 return {rpc,calls};
};
test('one follow-up, same baseline session, correct answer and reduced tokens',async()=>{
 const m=mocks();let t=10000;
 const r=await runMainContinuationBenchmark({rpc:m.rpc,now:()=>t+=1000,uid:()=> 'mock-uuid'});
 assert.equal(r.state,'passed');assert.equal(r.correct,true);
 assert.equal(r.baselineInputTokens,10935);assert.equal(r.afterInputTokens,7960);
 assert.deepEqual(m.calls.map(x=>x.method),['sessions.list','sessions.list','agent',
   'agent.wait','sessions.list','chat.history']);
 const agent=m.calls.find(x=>x.method==='agent').params;
 assert.equal(agent.sessionKey,key);assert.equal(agent.thinking,'off');
 assert.equal(agent.deliver,false);
 assert.doesNotMatch(JSON.stringify(r),/SECRET_MESSAGE|agent:main:|mock-uuid/);
});
test('busy means zero Agent or model calls',async()=>{
 const m=mocks({active:[{key:'active'}]});
 const r=await runMainContinuationBenchmark({rpc:m.rpc});
 assert.equal(r.state,'skipped_busy');assert.deepEqual(m.calls.map(x=>x.method),['sessions.list']);
});
test('no baseline session means no Agent invocation',async()=>{
 const m=mocks({prior:[]});
 const r=await runMainContinuationBenchmark({rpc:m.rpc});
 assert.equal(r.reason,'baseline_session_missing');
 assert.equal(m.calls.some(x=>x.method==='agent'),false);
});
test('unknown active session status fails closed',async()=>{
 const calls=[];const rpc=async m=>{calls.push(m);return {invalid:true}};
 const r=await runMainContinuationBenchmark({rpc});
 assert.equal(r.state,'blocked');assert.deepEqual(calls,['sessions.list']);
});
test('timeout does not automatically rerun or cancel live task',async()=>{
 const m=mocks({status:'timeout',reply:''});
 const r=await runMainContinuationBenchmark({rpc:m.rpc});
 assert.equal(r.state,'inconclusive');
 assert.equal(r.runStatus,'timeout');
 assert.equal(m.calls.filter(x=>x.method==='agent').length,1);
 assert.equal(m.calls.some(x=>x.method==='config.patch'),false);
});
test('missing run ID does not poll or retry',async()=>{
 const m=mocks({runId:null});
 const r=await runMainContinuationBenchmark({rpc:m.rpc});
 assert.equal(r.reason,'run_id_missing');
 assert.equal(m.calls.filter(x=>x.method==='agent.wait').length,0);
});
test('gateway error is redacted and not retried',async()=>{
 const calls=[];const rpc=async m=>{calls.push(m);throw Error('Bearer SECRET_API_KEY')};
 const r=await runMainContinuationBenchmark({rpc});
 assert.equal(r.state,'inconclusive');assert.equal(r.failureType,'Error');
 assert.doesNotMatch(JSON.stringify(r),/SECRET_API_KEY/);
 assert.deepEqual(calls,['sessions.list']);
});
