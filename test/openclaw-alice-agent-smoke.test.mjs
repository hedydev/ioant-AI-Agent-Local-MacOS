import test from 'node:test';
import assert from 'node:assert/strict';
import {verifySafeConfig,makeChallenge,interpretReply,viaGateway,smokeAlice}
 from '../stage2/openclaw-alice-agent-smoke.mjs';
import {fixedPatch} from '../stage2/openclaw-alice-create.mjs';
import {actionFromJson} from '../stage2/protocol.mjs';
import {actionPlan} from '../stage2/runner.mjs';
const ID='alice-ai';
const alice=fixedPatch().agents.entries[ID];
const c={
 agents:{ownership:'explicit',defaults:{systemAgent:{agentId:'main'}},
  entries:{main:{name:'old-main',model:'NOT_SHOWN'},[ID]:alice}},
 bindings:[{agentId:'main',match:{channel:'SECRET_CHANNEL'}}]
};
const cfg={valid:true,exists:true,sourceConfig:c,config:c,parsed:c,resolved:c};
const nonce='a1b2c3d4e5f6';
const challenge=makeChallenge(nonce);
const answer={status:'ok',runId:'PRIVATE',result:{payloads:[{text:challenge.target}]}};
const preflight=async()=>cfg;
test('agent smoke is a fixed no-args automatic action, not arbitrary command execution',()=>{
 const task={protocol:'ioant-mac-ops-v1',id:'alice-smoke-0001',action:'openclaw-alice-agent-smoke'};
 const parsed=actionFromJson(JSON.stringify(task));
 assert.equal(parsed.authorized,true);
 assert.deepEqual(actionPlan(task.action,'/root').args,['stage2/openclaw-alice-agent-smoke.mjs']);
 assert.throws(()=>actionFromJson(JSON.stringify({...task,agent:'main'})),/Malformed/);
});
test('safe fully registered Alice is required in four roots',()=>{
 assert.equal(verifySafeConfig(cfg),true);
 for(const root of ['sourceConfig','config','parsed','resolved']){
  assert.equal(verifySafeConfig({...cfg,[root]:{...c,agents:{...c.agents,entries:{main:c.agents.entries.main}}}}),false);
 }
});
test('deny-all, explicit main ownership, private model and bindings cannot drift',()=>{
 const b=structuredClone(c);
 b.agents.entries[ID].tools.deny=[];
 assert.equal(verifySafeConfig({...cfg,sourceConfig:b}),false);
 const b2=structuredClone(c);b2.agents.defaults.systemAgent.agentId=ID;
 assert.equal(verifySafeConfig({...cfg,config:b2}),false);
 const b3=structuredClone(c);b3.bindings.push({agentId:ID});
 assert.equal(verifySafeConfig({...cfg,config:b3}),false);
 const b4=structuredClone(c);b4.agents.entries[ID].model='other/model';
 assert.equal(verifySafeConfig({...cfg,sourceConfig:b4}),false);
});
test('nonce challenge is fixed and cannot be attacker-provided arbitrary shell args',()=>{
 assert.equal(challenge.target,'ALICE_READY_A1B2C3D4E5F6');
 assert.ok(challenge.prompt.includes(challenge.target));
 assert.throws(()=>makeChallenge('main;rm'),/unsafe_nonce/);
});
test('result must contain one matched complete reply; never count model errors as success',()=>{
 assert.equal(interpretReply(answer,challenge.target).status,'matched');
 assert.equal(interpretReply({...answer,status:'timeout'},challenge.target).status,'not_completed');
 assert.equal(interpretReply({...answer,result:{payloads:[]}},challenge.target).status,'no_single_reply');
 assert.equal(interpretReply({...answer,result:{payloads:[{text:'wrong'}]}},challenge.target).status,'mismatched');
 assert.equal(interpretReply({...answer,result:{payloads:[{text:'ALICE_READY_'+nonce.toUpperCase()+'?' }]}},challenge.target).status,'mismatched');
});
test('one Gateway-backed CLI dispatch, exact Alice session, no channel delivery or model override',async()=>{
 const calls=[];
 const result=await smokeAlice({rpc:async(method,params)=>{calls.push([method,params]);return cfg},
  workspace:async()=> 'present_private',nonceSource:()=>nonce,now:()=>123,
  execute:async ({args})=>{calls.push({args});return {status:'reply',data:answer}}});
 assert.deepEqual(calls[0],['config.get',{}]);
 assert.deepEqual(calls[1].args,['agent','--agent',ID,
  '--session-key','agent:alice-ai:smoke-'+nonce,'--message',challenge.prompt,
  '--timeout','120','--json']);
 assert.equal(result.state,'passed');assert.equal(result.response,'matched');
 assert.equal(result.configuredModel,'ollama/gemma4:26b-a4b');
 assert.equal(result.configWrite,false);assert.equal(result.channelDelivery,false);
 assert.doesNotMatch(JSON.stringify(result),/SECRET|PRIVATE|runId/);
});
test('preflight failures never call CLI, never create new session',async()=>{
 for(const opt of [{rpc:async()=>({valid:false})},{workspace:async()=> 'unavailable'}]){
  let invoked=0;
  const out=await smokeAlice({rpc:opt.rpc??preflight,
   workspace:opt.workspace??(async()=> 'present_private'),
   execute:async()=>{invoked++;return {status:'reply',data:answer}}});
  assert.equal(out.state,'blocked');assert.equal(invoked,0);
 }
});
test('timeout and mismatched reply remain inconclusive and are not dispatched twice',async()=>{
 for(const item of [{status:'cli_failure'},{status:'reply',
  data:{status:'ok',result:{payloads:[{text:'PRIVATE_WRONG'}]}}}]){
  let n=0;
  const out=await smokeAlice({rpc:preflight,workspace:async()=> 'present_private',
   nonceSource:()=>nonce,
   execute:async()=>{n++;return item}});
  assert.equal(n,1);
  assert.equal(out.state,'inconclusive');
  assert.doesNotMatch(JSON.stringify(out),/PRIVATE_WRONG/);
 }
});
test('native CLI runner never inherits Gateway credentials and never logs raw stdout',async()=>{
 let argsSeen,optsSeen;
 const result=await viaGateway({cli:'/fixed/openclaw',
  args:['agent','--agent','alice-ai','--message','challenge','--json'],
  execImpl:async (bin,args,opts)=>{argsSeen=[bin,args];optsSeen=opts;
   return {stdout:JSON.stringify(answer),stderr:'SECRET_TOKEN'};}});
 assert.equal(result.status,'reply');
 assert.deepEqual(argsSeen[0],'/fixed/openclaw');
 assert.equal(optsSeen.env.OPENCLAW_GATEWAY_TOKEN,undefined);
 assert.equal(optsSeen.env.OPENCLAW_GATEWAY_PASSWORD,undefined);
 assert.equal(optsSeen.env.OPENCLAW_GATEWAY_URL,undefined);
});
