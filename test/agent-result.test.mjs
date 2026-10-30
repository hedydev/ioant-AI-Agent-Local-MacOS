import test from 'node:test';import assert from 'node:assert/strict';
import {interpretAgentResult} from '../integrations/chatgpt-openclaw/agent-result.mjs';
const ctx={operationId:'test_operation_123',binding:{projectKey:'project',agentId:'agent'},durationMs:121620};
const reply=()=>({state:'reply',data:{status:'ok',result:{payloads:[{text:'Actual result'}],meta:{agentMeta:{provider:'ollama',model:'gemma4:26b-a4b',terminalReceipt:{successfulToolNames:['exec']}}}}}});
test('timeout retains explicit successful tool evidence without claiming command or task outcome',()=>{
 const r=reply();Object.assign(r.data.result.meta,{aborted:true,timedOut:true,timedOutByRunBudget:true,timedOutDuringToolExecution:false});
 const x=interpretAgentResult(r,ctx);assert.equal(x.reason,'agent_run_timeout');assert.equal(x.executionOutcome,'unverified');assert.deepEqual(x.toolsUsed.successful,['exec']);assert.equal(x.run.timedOutDuringToolExecution,false);assert.equal(x.durationMs,121620);assert.equal(x.text,undefined);assert.equal(x.doNotRepeat,true);
});
test('transport, capture, model, payload and final-answer failures stay distinct and never leak raw data',()=>{
 for(const [note,reason] of [['gateway_timeout','agent_cli_timeout'],['cli_launch_failed','agent_cli_launch_failed'],['invalid_json','agent_result_invalid_json'],['gateway_cli_failed','agent_cli_failed']]){
  const x=interpretAgentResult({state:'inconclusive',note,error:'private'},ctx);assert.equal(x.reason,reason);assert.equal(JSON.stringify(x).includes('private'),false);
 }
 assert.equal(interpretAgentResult({state:'inconclusive',note:'gateway_cli_failed',diagnostics:{captureLimitExceeded:true,exitCode:0,private:'hidden'}},ctx).reason,'agent_result_capture_limit');
 const r=reply();r.data.result.meta.agentMeta.provider='external';assert.equal(interpretAgentResult(r,ctx).reason,'agent_model_policy_unverified');
 const malformed=reply();malformed.data.result.payloads=[];assert.equal(interpretAgentResult(malformed,ctx).reason,'agent_payload_unavailable');
 const empty=reply();empty.data.result.payloads=[{text:' '}];assert.equal(interpretAgentResult(empty,ctx).reason,'agent_answer_empty');
});
test('elapsed duration alone does not invent a timeout, and a final answer is not effect verification',()=>{
 const x=interpretAgentResult(reply(),ctx);assert.equal(x.state,'returned');assert.equal(x.run.timedOut,undefined);assert.equal(x.effectIndependentlyVerified,false);assert.equal(x.executionOutcome,'unverified');
});

test('nonzero CLI JSON preserves native timeout evidence and cannot become a successful final answer',()=>{
 const r=reply();r.state='inconclusive';r.note='gateway_cli_failed';r.diagnostics={exitCode:1};
 r.data.result.meta.aborted=true;r.data.result.meta.timedOut=true;
 const x=interpretAgentResult(r,ctx);assert.equal(x.reason,'agent_run_timeout');assert.deepEqual(x.toolsUsed.successful,['exec']);assert.equal(x.cli.exitCode,1);assert.equal(x.text,undefined);
 r.data.result.meta.aborted=false;r.data.result.meta.timedOut=false;assert.equal(interpretAgentResult(r,ctx).reason,'agent_cli_failed');
});
