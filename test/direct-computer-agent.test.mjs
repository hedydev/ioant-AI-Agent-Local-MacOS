import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,chmod,symlink,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ComputerTaskStore} from '../integrations/chatgpt-openclaw/computer-task-store.mjs';
import {computerAgentPolicy,runComputerTask,computerTaskResult}
 from '../integrations/chatgpt-openclaw/computer-agent.mjs';
import {projectBinding} from '../integrations/chatgpt-openclaw/project-binding.mjs';

const input={operation_id:'computer_probe_0001',conversation_key:'test_chat_123',
 message:'Read cursor position only. Do not move the pointer or take screenshots.'};
const workspace=async()=>'present_private';
const config={agents:{defaults:{model:'ollama/local'},entries:{'openclaw-dev':{
 model:'ollama/gemma4:26b-a4b',workspace:projectBinding().workspace,tools:{allow:['computer']}}}},
 models:{providers:{ollama:{baseUrl:'http://127.0.0.1:11435',api:'ollama'}}}};
const reply={state:'reply',data:{status:'ok',result:{payloads:[{text:'Cursor read completed.'}],
 meta:{agentMeta:{provider:'ollama',model:'gemma4:26b-a4b',
 terminalReceipt:{successfulToolNames:['computer']}}}}}};
async function fixture(t){
 const parent=await realpath(await mkdtemp(join(tmpdir(),'ioant-direct-computer-')));
 await chmod(parent,0o700);
 t.after(()=>rm(parent,{recursive:true,force:true}));
 return new ComputerTaskStore(join(parent,'tasks'),parent);
}

test('computer policy admits only the existing local computer-only Agent',()=>{
 assert.equal(computerAgentPolicy(config),true);
 for(const change of [c=>c.agents.entries['openclaw-dev'].tools.allow.push('exec'),
  c=>c.agents.entries['openclaw-dev'].tools.alsoAllow=['read'],
  c=>c.models.providers.ollama.baseUrl='https://other',
  c=>c.agents.defaults.model={primary:'ollama/local',fallbacks:['openai/cloud']}]){
  const c=structuredClone(config);change(c);assert.equal(computerAgentPolicy(c),false);
 }
});

test('same operation ID survives fresh stores and never repeats an action',async t=>{
 const store=await fixture(t);let calls=0;
 const opts={store,workspace,load:async()=>config,call:async(args,body)=>{
  calls++;assert.equal(args[args.indexOf('--agent')+1],'openclaw-dev');
  assert.equal(args.includes('--deliver'),false);
  assert.ok(body.endsWith(input.message));return reply;
 }};
 const first=await runComputerTask(input,opts);
 assert.equal(first.state,'returned');assert.equal(first.computerToolSucceeded,true);
 assert.equal(first.effectIndependentlyVerified,false);
 const again=await runComputerTask(input,{...opts,
  store:new ComputerTaskStore(store.dir,store.parent)});
 assert.equal(again.cached,true);assert.equal(calls,1);
 const read=await computerTaskResult({operation_id:input.operation_id},{store});
 assert.equal(read.cached,true);assert.equal(calls,1);
 const changed=await runComputerTask({...input,message:'Different action'},opts);
 assert.equal(changed.reason,'operation_id_conflict');assert.equal(calls,1);
});

test('reservation before a timeout prevents replay after a crash or uncertain receipt',async t=>{
 const store=await fixture(t);let calls=0;
 const opts={store,workspace,load:async()=>config,call:async()=>{calls++;throw Error('private error')}};
 const first=await runComputerTask(input,opts);
 assert.equal(first.state,'inconclusive');
 const second=await runComputerTask(input,opts);
 assert.equal(second.cached,true);assert.equal(calls,1);
 const digest='a'.repeat(64);
 await store.begin('unfinished_operation_0001',digest);
 const pending=await computerTaskResult({operation_id:'unfinished_operation_0001'},{store});
 assert.equal(pending.state,'started');assert.equal(pending.doNotRepeat,true);
});

test('concurrent admissions reserve one operation exactly once',async t=>{
 const store=await fixture(t);
 const claims=await Promise.allSettled(Array.from({length:4},()=>store.begin(input.operation_id,'b'.repeat(64))));
 assert.equal(claims.filter(x=>x.status==='fulfilled'&&x.value.created).length,1);
 assert.equal(claims.filter(x=>x.status==='rejected'||!x.value.created).length,3);
});

test('unsafe and malformed task records block reads and execution',async t=>{
 const store=await fixture(t);await store.admit();
 await writeFile(store.path(input.operation_id),'not-json',{mode:0o600});
 await assert.rejects(store.get(input.operation_id));
 let calls=0;
 const r=await runComputerTask(input,{store,workspace,load:async()=>config,call:async()=>{calls++;}});
 assert.equal(r.state,'blocked');assert.equal(calls,0);
 await symlink(store.path(input.operation_id),store.path('symlink_operation_001'));
 await assert.rejects(store.get('symlink_operation_001'));
});

test('caller cannot select an agent, file path or replay target',async()=>{
 let calls=0;
 for(const x of [{...input,agent:'main'},{...input,operation_id:'../../other'},
  {...input,message:'a'.repeat(4001)}]){
  const r=await runComputerTask(x,{load:async()=>{calls++;return config;}});
  assert.equal(r.state,'blocked');
 }
 assert.equal(calls,0);
});

test('identical operation IDs in independent projects cannot retrieve each other\'s receipts',async t=>{
 const opsStore=await fixture(t),aliceStore=await fixture(t);
 const c=structuredClone(config),alice=projectBinding('alice-ai');
 c.agents.entries['alice-ai']={...structuredClone(c.agents.entries['openclaw-dev']),
  workspace:alice.workspace};
 let calls=0;
 const opts={workspace,load:async()=>c,call:async()=>{calls++;return reply;}};
 await runComputerTask(input,{...opts,store:opsStore});
 const absent=await computerTaskResult({operation_id:input.operation_id},
  {binding:alice,store:aliceStore});
 assert.equal(absent.state,'not_found');
 const other=await runComputerTask(input,{...opts,binding:alice,store:aliceStore});
 assert.equal(other.project,'alice-ai');assert.equal(other.cached,undefined);
 assert.equal(calls,2);
});

test('an aborted final answer retains proven tool use without claiming task success',async t=>{
 const store=await fixture(t),aborted=structuredClone(reply);aborted.data.result.meta.aborted=true;
 aborted.data.result.meta.agentMeta.terminalReceipt.successfulToolNames=['exec','computer'];
 const r=await runComputerTask(input,{store,workspace,load:async()=>config,call:async()=>aborted});
 assert.equal(r.state,'inconclusive');assert.deepEqual(r.toolsUsed.successful,['exec','computer']);
 const cached=await computerTaskResult({operation_id:input.operation_id},{store});assert.equal(cached.cached,true);assert.deepEqual(cached.toolsUsed,r.toolsUsed);
});
