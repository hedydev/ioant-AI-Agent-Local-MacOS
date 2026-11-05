import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {ComputerTaskStore} from '../integrations/chatgpt-openclaw/computer-task-store.mjs';
import {InferenceLane} from '../integrations/chatgpt-openclaw/inference-lane.mjs';
import {recoverComputerLane} from '../integrations/chatgpt-openclaw/computer-lane-recovery.mjs';
async function fixture(t){
 const parent=await realpath(await mkdtemp(join(tmpdir(),'lane-review-')));t.after(()=>rm(parent,{recursive:true,force:true}));
 const binding={projectKey:'example',agentId:'example'},store=new ComputerTaskStore(join(parent,'direct-computer-example'),parent),lane=new InferenceLane(parent),operationId='recovery_test_0001';
 const input={operation_id:operationId,conversation_key:'review_conversation',message:'private task must not leak'};
 const digest=createHash('sha256').update(JSON.stringify([binding.projectKey,binding.agentId,input.conversation_key,input.message])).digest('hex');
 const slot=await lane.reserve(binding.projectKey,operationId);await lane.acquire(slot);await store.begin(operationId,digest,{project:binding.projectKey,agent:binding.agentId,input,slot});await store.progress(operationId,digest,'agent_running',{runnerPid:999999});await store.finish(operationId,digest,{state:'inconclusive',inferenceLaneHeld:true});
 const probe=async key=>({key,sessionId:'original-native-session',status:'timeout',hasActiveRun:false,activeRunIds:[],updatedAt:Date.now()});
 // Stable native settlement fingerprint across inspect / resolve.
 const nativeAt=Date.now(),options={binding,store,lane,probe:async key=>({...await probe(key),updatedAt:nativeAt}),exited:()=>true};return {options,operationId,store,lane};
}
test('reviewed native settlement releases only the exact lane and preserves original receipts',async t=>{
 const f=await fixture(t),before=await readFile(f.store.path(f.operationId),'utf8');
 const waiting=await f.lane.reserve('other','other_queue_0001');
 const review=await recoverComputerLane({mode:'inspect',operationId:f.operationId},f.options);assert.equal(review.state,'review_ready');assert.equal(JSON.stringify(review).includes('private task'),false);
 assert.equal((await f.lane.snapshot()).activeOrUnsettled,true);
 const r=await recoverComputerLane({mode:'resolve',operationId:f.operationId,reviewDigest:review.reviewDigest},f.options);
 assert.equal(r.state,'released');assert.equal(r.effectsVerified,false);assert.equal(r.executionInvoked,false);assert.equal(await readFile(f.store.path(f.operationId),'utf8'),before);assert.equal((await f.lane.snapshot()).admittedJobs,1);assert.equal((await f.lane.read('slot-'+waiting.slot+'.json')).operationId,'other_queue_0001');
 const audit=JSON.parse(await readFile(join(f.store.dir,'lane-recovery',f.operationId+'.audit.json'),'utf8'));assert.equal(audit.state,'released');assert.equal(audit.nativeCompletion,'timeout');
});
test('live runners and active or missing native evidence never release a lease',async t=>{
 const f=await fixture(t);
 await assert.rejects(recoverComputerLane({mode:'inspect',operationId:f.operationId},{...f.options,exited:()=>false}),/not_settled/);
 await assert.rejects(recoverComputerLane({mode:'inspect',operationId:f.operationId},{...f.options,probe:async key=>({key,status:'running',hasActiveRun:true,activeRunIds:['active']})}),/not_settled/);
 await assert.rejects(recoverComputerLane({mode:'inspect',operationId:f.operationId},{...f.options,probe:async()=>{throw Error('native_unavailable');}}),/native_unavailable/);
 assert.equal((await f.lane.snapshot()).activeOrUnsettled,true);
});
test('wrong review, changed native evidence and expiry block resolution without taking over',async t=>{
 const f=await fixture(t),request={mode:'inspect',operationId:f.operationId};const review=await recoverComputerLane(request,f.options);
 await assert.rejects(recoverComputerLane({mode:'resolve',operationId:f.operationId,reviewDigest:'wrong'},f.options),/review_expired_or_changed/);
 await assert.rejects(recoverComputerLane({mode:'resolve',operationId:f.operationId,reviewDigest:review.reviewDigest},{...f.options,now:()=>Date.now()+360000}),/review_expired_or_changed/);
 await assert.rejects(recoverComputerLane({mode:'resolve',operationId:f.operationId,reviewDigest:review.reviewDigest},{...f.options,probe:async key=>({...await f.options.probe(key),sessionId:'replacement'})}),/review_expired_or_changed/);
 assert.equal((await f.lane.snapshot()).activeOrUnsettled,true);
});
