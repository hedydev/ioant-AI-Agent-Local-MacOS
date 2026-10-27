import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,readdir,readFile,rm,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {workflowBootstrap} from '../stage2/local-agent-workflow-cli.mjs';
import {inspectWorkflow} from '../stage2/workflow-store.mjs';
import {agentPolicy} from '../stage2/development-agent-route.mjs';
import {inspectRequirementsPilot,runRequirementsPilot} from '../stage2/local-agent-requirements-pilot.mjs';
const clock=()=>new Date('2026-10-27T01:00:00Z');
let seq=0;
function mockConfig(){
 const entries={main:{name:'Main'},'alice-ai':agentPolicy('alice-ai'),
  'openclaw-dev':agentPolicy('openclaw-dev'),
  'mac-computer':{name:'Mac Computer',model:'ollama/gemma4:26b-a4b',
   workspace:'/Volumes/LunaDrive/DeveloperCache/openclaw-agents/mac-computer'}};
 const cfg={agents:{ownership:'explicit',defaults:{systemAgent:{agentId:'main'}},
  entries},bindings:[]};
 return {valid:true,exists:true,sourceConfig:structuredClone(cfg),
  config:structuredClone(cfg),parsed:structuredClone(cfg),resolved:structuredClone(cfg)};
}
async function fixture(fn){
 const raw=await mkdtemp(join(tmpdir(),'ioant-requirements-pilot-'));
 const root=join(await realpath(raw),'chat-projects','workflows');
 const prev=process.env.IOANT_WORKFLOW_TEST_ROOT;
 process.env.IOANT_WORKFLOW_TEST_ROOT='1';
 try{
  await workflowBootstrap('alice-ai',{root});
  return await fn({root,store:{root}});
 }finally{
  if(prev===undefined)delete process.env.IOANT_WORKFLOW_TEST_ROOT;
  else process.env.IOANT_WORKFLOW_TEST_ROOT=prev;
  await rm(raw,{recursive:true,force:true});
 }
}
function opts(f,overrides={}){
 return {store:f.store,root:f.root,config:async()=>mockConfig(),
  workspace:async()=> 'present_private',clock,
  nonce:()=>String(++seq).padStart(24,'0'),
  invoke:async()=>({state:'answered',text:'需求：建立可验证的任务交接、证据与隔离权限。'}),...overrides};
}
test('fixed Alice role is previewable with no execution, state or browser write',async()=>{
 await fixture(async f=>{
  const r=await inspectRequirementsPilot({store:f.store});
  assert.equal(r.initialEligible,true);
  assert.deepEqual(r.ready,['requirements']);
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.revision,21);
  assert.equal((await readdir(f.root)).length,1);
 });
});
test('one real-model adapter mock claims, starts, journals evidence and waits for independent acceptance',async()=>{
 await fixture(async f=>{
  let invoked=0;
  const s=opts(f,{invoke:async({agentId,prompt,chatDigest})=>{
   invoked++;assert.equal(agentId,'alice-ai');
   assert.match(prompt,/Minecraft Bedrock/);
   assert.match(chatDigest,/^[a-f0-9]{24}$/);
   return {state:'answered',text:'验证生产环境不变更；角色间提交可验证测试回执。'};
  }});
  const r=await runRequirementsPilot(s);
  assert.equal(r.state,'verification_pending');
  assert.equal(r.revision,24);
  assert.equal(r.modelInvoked,true);
  assert.equal(r.hostToolAccess,false);
  assert.equal(r.automaticAcceptance,false);
  assert.equal(invoked,1);
  const after=await inspectWorkflow('alice-local-pilot',f.store);
  assert.equal(after.snapshot.tasks[0].status,'verification_pending');
  assert.equal(after.summary.receipts,1);
  assert.deepEqual(after.summary.ready,[]);
  const files=(await readdir(f.root)).filter(x=>x.startsWith('alice-requirements-'));
  assert.equal(files.length,1);
  const evidencePath=join(f.root,files[0]);
  const bytes=await readFile(evidencePath);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),r.evidenceSha256);
  assert.equal((await lstat(evidencePath)).mode&0o077,0);
  assert.equal(JSON.parse(bytes).untrustedModelText,true);
  const repeat=await runRequirementsPilot(s);
  assert.equal(repeat.state,'blocked');
  assert.equal(repeat.reason,'workflow_not_initial');
  assert.equal(invoked,1);
 });
});
test('policy preflight rejects changed advisor without claiming or invoking a model',async()=>{
 await fixture(async f=>{
  let invoked=false;
  const bad=mockConfig();
  bad.config.agents.entries['alice-ai'].tools.deny=[];
  const r=await runRequirementsPilot(opts(f,{
   config:async()=>bad,invoke:async()=>{invoked=true;return {state:'answered',text:'wrong'}}
  }));
  assert.equal(r.state,'blocked');
  assert.equal(r.reason,'advisor_policy_unverified');
  assert.equal(invoked,false);
  const state=await inspectRequirementsPilot({store:f.store});
  assert.equal(state.revision,21);
 });
});
test('ambiguous model result records failure and never retries on same task',async()=>{
 await fixture(async f=>{
  let count=0;
  const o=opts(f,{invoke:async()=>{count++;return {state:'inconclusive',note:'gateway_timeout'};}});
  const r=await runRequirementsPilot(o);
  assert.equal(r.state,'failed');
  assert.equal(r.note,'gateway_timeout');
  assert.equal((await inspectWorkflow('alice-local-pilot',f.store)).snapshot.tasks[0].status,'failed');
  await runRequirementsPilot(o);
  assert.equal(count,1);
 });
});
test('multiple claimants of the same initial revision cannot double invoke',async()=>{
 await fixture(async f=>{
  let called=0;
  const o=opts(f,{config:async()=>{
   await new Promise(resolve=>setTimeout(resolve,20));return mockConfig();
  },invoke:async()=>{
   called++;return {state:'answered',text:'only once'};
  }});
  const results=await Promise.all([runRequirementsPilot(o),runRequirementsPilot(o)]);
  assert.equal(results.filter(x=>x.state==='verification_pending').length,1);
  assert.equal(called,1);
  assert.equal((await inspectWorkflow('alice-local-pilot',f.store)).summary.receipts,1);
 });
});
test('test dependency injection blocked when explicit test authority absent',async()=>{
 const old=process.env.IOANT_WORKFLOW_TEST_ROOT;
 delete process.env.IOANT_WORKFLOW_TEST_ROOT;
 try{
  const r=await runRequirementsPilot({root:'/tmp/arbitrary'});
  assert.equal(r.state,'blocked');
  assert.equal(r.reason,'test_injection_forbidden');
 }finally{if(old!==undefined)process.env.IOANT_WORKFLOW_TEST_ROOT=old;}
});
