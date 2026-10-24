import test from 'node:test';
import assert from 'node:assert/strict';
import {agentPolicy} from '../stage2/development-agent-route.mjs';
import {preflightDev} from '../stage2/openclaw-dev-preflight.mjs';
import {actionFromJson} from '../stage2/protocol.mjs';
import {actionPlan} from '../stage2/runner.mjs';

const root=()=>({agents:{ownership:'explicit',
 defaults:{systemAgent:{agentId:'main'}},
 entries:{main:{name:'main'},'alice-ai':agentPolicy('alice-ai')}},
 bindings:[{agentId:'main',match:{channel:'private'}}]});
const rpcResponse=()=>{
 const x=root();
 return {valid:true,exists:true,hash:'W/"good-revision-123456"',
  sourceConfig:structuredClone(x),config:structuredClone(x),
  parsed:structuredClone(x),resolved:structuredClone(x)};
};
const opts={preflight:async()=>({config:'regular_private',ollama:'reachable',
 provider:'target',agents:'present',installed:['gemma4:26b-a4b','gpt-oss:20b']}),
 rpc:async()=>rpcResponse(),workspace:async()=> 'missing_target_safe_parent',
 aliceWorkspace:async()=> 'present_private'};
test('read-only Mac preflight is a safe structured auto action',()=>{
 const task=actionFromJson(JSON.stringify({protocol:'ioant-mac-ops-v1',
  id:'dev-preflight-20261025-1',action:'openclaw-dev-preflight'}));
 assert.equal(task.authorized,true);assert.equal(task.known,true);
 assert.deepEqual(actionPlan(task.action,'/tmp').args,['stage2/openclaw-dev-preflight.mjs']);
 assert.throws(()=>actionFromJson(JSON.stringify({...task,cmd:'sh'})),/Malformed/);
});
test('two-Agent config and untouched workspace become ready with no Gateway changes',async()=>{
 let queries=0;
 const d=await preflightDev({...opts,rpc:async(...args)=>{queries++;
  assert.deepEqual(args,['config.get',{}]);return rpcResponse();}});
 assert.deepEqual(d,{audit:'IOANT_OPENCLAW_DEV_PREFLIGHT',schemaVersion:1,
  readOnly:true,agent:'openclaw-dev',configWrite:false,state:'ready',
  mainPreserved:true,alicePreserved:true,writeApproved:false});
 assert.equal(queries,1);
});
test('target existing or unsafe Alice roster must refuse preflight, no write',async()=>{
 for(const extra of [{workspace:async()=> 'target_exists'},
  {aliceWorkspace:async()=> 'unavailable'},
  {rpc:async()=>{const x=rpcResponse();x.config.agents.entries.other={};return x;}}]){
  const d=await preflightDev({...opts,...extra});
  assert.equal(d.state,'blocked');assert.equal(d.configWrite,false);
  assert.doesNotMatch(JSON.stringify(d),/private/);
 }
});
test('unavailable Mac live snapshot is inconclusive, never ready',async()=>{
 const d=await preflightDev({...opts,rpc:async()=>{throw Error('Bearer secret')}});
 assert.equal(d.state,'inconclusive');assert.equal(d.reason,'preflight_unavailable');
 assert.doesNotMatch(JSON.stringify(d),/Bearer|secret/);
});
