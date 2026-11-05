import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,realpath,chmod,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {ComputerTaskStore} from '../integrations/chatgpt-openclaw/computer-task-store.mjs';
import {runComputerTask,computerTaskResult,performComputerTask} from '../integrations/chatgpt-openclaw/computer-agent.mjs';
import {runComputerJob} from '../integrations/chatgpt-openclaw/computer-job.mjs';
import {InferenceLane} from '../integrations/chatgpt-openclaw/inference-lane.mjs';
import {projectBinding} from '../integrations/chatgpt-openclaw/project-binding.mjs';
import {modelResidency} from '../integrations/chatgpt-openclaw/model-residency.mjs';
import {writeFile} from 'node:fs/promises';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const binding=projectBinding(),input={operation_id:'async_computer_001',conversation_key:'async_chat_001',message:'Read cursor only'};
const config={agents:{defaults:{model:'ollama/local'},entries:{'openclaw-dev':{model:'ollama/gemma4:26b-a4b',workspace:binding.workspace,tools:{allow:['computer']}}}},models:{providers:{ollama:{baseUrl:'http://127.0.0.1:11435',api:'ollama'}}}};
async function fixture(t){const root=await realpath(await mkdtemp(join(tmpdir(),'computer-job-')));await chmod(root,0o700);t.after(()=>rm(root,{recursive:true,force:true}));return {root,store:new ComputerTaskStore(join(root,'jobs'),root),lane:new InferenceLane(root),load:async()=>config,workspace:async()=>'present_private'};}
test('admission does not wait for or invoke inference; fresh store can finish the same operation once',async t=>{
 const f=await fixture(t);let launches=0,calls=0;
 const options={...f,launch:async()=>{launches++;}};
 assert.equal((await runComputerTask(input,options)).state,'accepted');assert.equal(calls,0);
 assert.equal((await runComputerTask(input,options)).state,'accepted');assert.equal(launches,1);
 const restarted=new ComputerTaskStore(f.store.dir,f.root);
 const worker={...f,store:restarted,policy:async()=>true,residency:async()=>({state:'observed',models:[]}),perform:async()=>{calls++;return {terminal:true,result:{state:'returned',text:'done',modelInferenceInvoked:true}};}};
 await Promise.all([runComputerJob(binding,input.operation_id,worker),runComputerJob(binding,input.operation_id,worker)]);
 const r=await computerTaskResult({operation_id:input.operation_id},{store:restarted});assert.equal(r.state,'returned');assert.equal(r.cached,true);assert.equal(calls,1);assert.equal(r.receiptPersisted,true);assert.equal(r.inferenceLaneHeld,false);
 assert.equal((await f.lane.reserve('other','other_operation')).slot,0);
});
test('bounded lane serializes jobs across projects; uncertain completion cannot be taken over',async t=>{
 const f=await fixture(t),slots=[];for(let i=0;i<4;i++)slots.push(await f.lane.reserve('project'+i,'operation'+i));
 assert.equal(await f.lane.reserve('extra','extra_operation'),null);
 assert.equal(await f.lane.acquire(slots[0]),true);assert.equal(await f.lane.acquire(slots[1]),false);
 await f.lane.release(slots[0],{active:true});assert.equal(await f.lane.acquire(slots[1]),true);
 await assert.rejects(f.lane.release(slots[2],{active:true}),/owner_conflict/);
 const restart=new InferenceLane(f.root);assert.equal(await restart.acquire(slots[2]),false);
});
test('uncertain native completion persists the outcome and holds lane; no replay',async t=>{
 const f=await fixture(t);await runComputerTask(input,{...f,launch:async()=>{}});let calls=0;
 const worker={...f,policy:async()=>true,residency:async()=>({state:'observed',models:[]}),perform:async()=>{calls++;return {terminal:false,result:{state:'inconclusive',reason:'agent_cli_failed'}};}};
 await runComputerJob(binding,input.operation_id,worker);await runComputerJob(binding,input.operation_id,worker);
 const r=await computerTaskResult({operation_id:input.operation_id},{store:f.store});assert.equal(r.inferenceLaneHeld,true);assert.equal(calls,1);
 assert.equal((await runComputerTask(input,{...f,launch:async()=>{throw Error('must not relaunch');}})).cached,true);
});
test('lost CLI answer releases only with exact native terminal evidence, never from inactivity',async t=>{
 for(const settled of [true,false]){
  const f=await fixture(t);await runComputerTask(input,{...f,launch:async()=>{}});let checks=0;
  await runComputerJob(binding,input.operation_id,{...f,policy:async()=>true,residency:async()=>({state:'observed',models:[]}),perform:async()=>({terminal:false,result:{state:'inconclusive',reason:'agent_cli_failed',cli:{exitCode:1}}}),settlement:async key=>{checks++;return {key,sessionId:'exact-session',status:settled?'timeout':'running',hasActiveRun:!settled,activeRunIds:settled?[]:['active'],updatedAt:Date.now()};}});
  const r=await computerTaskResult({operation_id:input.operation_id},{store:f.store});assert.equal(checks,1);assert.equal(r.state,'inconclusive');assert.equal(r.inferenceLaneHeld,!settled);assert.equal((await f.lane.snapshot()).activeOrUnsettled,!settled);
  if(settled){assert.equal(r.nativeSettlement.status,'timeout');assert.equal(r.effectsVerified,false);}
 }
});
test('queue expiry and launch failure perform no model/tool work and release their own reservations',async t=>{
 const f=await fixture(t),blocking=await f.lane.reserve('other','blocking_job');await f.lane.acquire(blocking);
 await runComputerTask(input,{...f,launch:async()=>{}});let calls=0;
 await runComputerJob(binding,input.operation_id,{...f,now:()=>0,queueWaitMs:0,perform:async()=>{calls++;}});
 const r=await computerTaskResult({operation_id:input.operation_id},{store:f.store});assert.equal(r.reason,'local_inference_queue_timeout');assert.equal(calls,0);assert.equal(await f.lane.acquire(blocking),false);
 await f.lane.release(blocking,{active:true});
 const other={...input,operation_id:'async_launch_fail_001'};
 assert.equal((await runComputerTask(other,{...f,launch:async()=>{throw Error('failed');}})).reason,'computer_runner_not_started');
 assert.equal((await f.lane.reserve('next','next_operation')).slot,0);
});
test('legacy started/finished receipts remain readable and cannot be restarted as queued jobs',async t=>{
 const f=await fixture(t);await f.store.begin(input.operation_id,'a'.repeat(64));let calls=0;
 await runComputerJob(binding,input.operation_id,{...f,perform:async()=>{calls++;}});
 assert.equal((await computerTaskResult({operation_id:input.operation_id},{store:f.store})).state,'started');assert.equal(calls,0);
});
test('a separate Node process completes admitted work after the original admission returns',async t=>{
 const f=await fixture(t);assert.equal((await runComputerTask(input,{...f,launch:async()=>{}})).state,'accepted');
 const script=join(f.root,'fixture-worker.mjs');
 await writeFile(script,`import {runComputerJob} from ${JSON.stringify(new URL('../integrations/chatgpt-openclaw/computer-job.mjs',import.meta.url).href)};
import {ComputerTaskStore} from ${JSON.stringify(new URL('../integrations/chatgpt-openclaw/computer-task-store.mjs',import.meta.url).href)};
await runComputerJob(${JSON.stringify(binding)},${JSON.stringify(input.operation_id)},{store:new ComputerTaskStore(${JSON.stringify(f.store.dir)},${JSON.stringify(f.root)}),policy:async()=>true,residency:async()=>({state:'observed',models:[]}),perform:async()=>({terminal:true,result:{state:'returned',text:'fixture child done',modelInferenceInvoked:false}})});`,{mode:0o600});
 await promisify(execFile)(process.execPath,[script],{timeout:10000});
 const r=await computerTaskResult({operation_id:input.operation_id},{store:new ComputerTaskStore(f.store.dir,f.root)});
 assert.equal(r.state,'returned');assert.equal(r.text,'fixture child done');assert.equal(r.cached,true);
});
test('residency status is metadata-only, bounded, and never preloads a model',async()=>{
 let calls=0;const r=await modelResidency({fetchImpl:async(url,options)=>{calls++;assert.equal(url,'http://127.0.0.1:11435/api/ps');assert.equal(options.method,undefined);return new Response(JSON.stringify({models:[{name:'gemma4:26b-a4b',size:25000000000,context_length:32768,secret:'never return'}]}));}});
 assert.equal(r.models[0].residentBytes,25000000000);assert.equal(calls,1);assert.equal(JSON.stringify(r).includes('secret'),false);assert.equal(r.modelInferenceInvoked,false);
 assert.equal((await modelResidency({fetchImpl:async()=>{throw Error('private');}})).state,'unavailable');
});

test('new desktop operations use separate bounded sessions while retaining project Agent, model and tools',async()=>{
 const keys=[];const call=async(args,body)=>{keys.push(args[args.indexOf('--session-key')+1]);assert.equal(args[args.indexOf('--agent')+1],binding.agentId);assert.equal(args[args.indexOf('--model')+1],'ollama/gemma4:26b-a4b');assert.match(body,/fresh execution session/);return {state:'reply',data:{status:'ok',result:{payloads:[{text:'fixture'}],meta:{agentMeta:{provider:'ollama',model:'gemma4:26b-a4b'}}}}};};
 await performComputerTask(input,{binding,call});await performComputerTask({...input,operation_id:'async_computer_002'},{binding,call});await performComputerTask(input,{binding,call});
 assert.notEqual(keys[0],keys[1]);assert.equal(keys[0],keys[2]);assert.ok(keys.every(k=>k.startsWith('agent:'+binding.agentId+':computer-')));
});
test('queue snapshot reads reservations without running a model, claiming slots or exposing owner tokens',async t=>{
 const f=await fixture(t);assert.equal((await f.lane.snapshot()).state,'idle');
 const slot=await f.lane.reserve('fixture','snapshot_operation');await f.lane.acquire(slot);const x=await f.lane.snapshot();
 assert.equal(x.admittedJobs,1);assert.equal(x.waitingReservations,0);assert.equal(x.activeOrUnsettled,true);assert.equal(JSON.stringify(x).includes(slot.token),false);
 await f.lane.release(slot,{active:true});assert.equal((await f.lane.snapshot()).state,'idle');
});
