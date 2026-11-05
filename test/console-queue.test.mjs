import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {readScheduler,attachScheduler} from '../console/scheduler.mjs';
import {activityRow,loadActivity} from '../console/activity.mjs';
import {taskBucket,taskCounts,elapsedSeconds,projectName} from '../console/web/task-model.js';
const bindings={'alice-ai':{projectKey:'alice-ai',agentId:'alice-ai'},netscale:{projectKey:'netscale',agentId:'netscale'}};
const residency=async()=>({state:'observed',models:[],modelInferenceInvoked:false});
async function fixture(t){const parent=await realpath(await mkdtemp(join(tmpdir(),'console-queue-')));t.after(()=>rm(parent,{recursive:true,force:true}));return parent;}
async function put(parent,name,value){const path=join(parent,name),dir=path.slice(0,path.lastIndexOf('/'));await mkdir(dir,{recursive:true,mode:0o700});await writeFile(path,JSON.stringify(value),{mode:0o600});}
test('actual lane metadata orders waiting jobs, separates retained ownership, and never leaks secrets',async t=>{
 const parent=await fixture(t);
 await put(parent,'mcp-local-inference/slot-3.json',{project:'netscale',operationId:'waiting_0002',at:'2026-11-06T01:00:03Z',token:'private-token'});
 await put(parent,'mcp-local-inference/slot-1.json',{project:'alice-ai',operationId:'active_0001',at:'2026-11-06T01:00:01Z',token:'private-token'});
 await put(parent,'mcp-local-inference/active.json',{project:'alice-ai',operationId:'active_0001',token:'private-token'});
 await put(parent,'direct-project-execution-netscale/active.lock',{operationId:'script_0001',digest:'private-digest'});
 const s=await readScheduler(parent,bindings,{residency});assert.equal(s.native.capacity,4);assert.equal(s.native.maxRunning,1);assert.equal(s.repositories[0].operationId,'script_0001');
 assert.equal(/private-token|private-digest/.test(JSON.stringify(s)),false);
 const rows=attachScheduler([
  {kind:'computer',project:'alice-ai',operationId:'active_0001',state:'inconclusive'},
  {kind:'computer',project:'netscale',operationId:'waiting_0002',state:'accepted',phase:'queued'},
  {kind:'execution',project:'netscale',operationId:'script_0001',state:'running'}
 ],s);
 assert.equal(taskBucket(rows[0]),'attention');assert.equal(rows[0].inferenceLaneHeld,true);
 assert.equal(rows[1].queuePosition,1);assert.equal(taskBucket(rows[1]),'queued');
 assert.deepEqual(taskCounts(rows),{running:1,queued:1,attention:1,history:0});
});
test('missing or malformed lane data cannot manufacture free capacity or a live runner',async t=>{
 const parent=await fixture(t);let s=await readScheduler(parent,bindings,{residency});assert.equal(s.native.state,'observed');assert.equal(s.native.active,null);
 await put(parent,'mcp-local-inference/active.json',{project:'alice-ai',operationId:'lost_job_0001'});
 s=await readScheduler(parent,bindings,{residency});const rows=attachScheduler([],s);
 assert.equal(rows.length,1);assert.equal(taskBucket(rows[0]),'attention');assert.equal(rows[0].orphanedLease,true);
 await put(parent,'mcp-local-inference/slot-0.json',{project:'bad\nsecret',operationId:'bad',at:'not-a-date'});
 s=await readScheduler(parent,bindings,{residency});assert.equal(s.native.state,'unavailable');
});
test('receipt views expose task metadata and measured durations, not prompts, answers, or invented model usage',()=>{
 const computer=activityRow({operationId:'native_job_0001',startedAt:'2026-11-06T01:00:00Z',job:{input:{message:'PRIVATE PROMPT'}},phase:'queued',state:'started'},'computer','alice-ai');
 assert.equal(taskBucket(computer),'queued');assert.equal(computer.modelInferenceInvoked,null);assert.equal(JSON.stringify(computer).includes('PRIVATE PROMPT'),false);
 const row=activityRow({operationId:'script_job_0001',state:'passed',input:{action:'repository_task',task_file:'.openclaw/tasks/build_linux.json'},startedAt:'2026-11-06T01:00:00Z',finishedAt:'2026-11-06T01:00:03Z'},'execution','netscale');
 assert.equal(row.taskFile,'.openclaw/tasks/build_linux.json');assert.equal(row.modelInferenceInvoked,false);assert.equal(elapsedSeconds(row),3);
 assert.equal(elapsedSeconds({startedAt:'invalid'}),null);assert.equal(taskBucket({state:'blocked',reason:'project_execution_busy'}),'history');
 assert.equal(projectName({name:'ioant-netscale'}),'netscale');
 assert.equal(taskBucket({kind:'computer',asynchronous:false,state:'started'}),'attention');
 const released=attachScheduler([{kind:'computer',project:'alice-ai',operationId:'old_held_0001',state:'inconclusive',reportedInferenceLaneHeld:true}],{native:{state:'observed',reservations:[],active:null},repositories:[]});
 assert.equal(released[0].inferenceLaneHeld,false);
});
test('old queued receipt stays visible even after over 150 newer finished operations',async t=>{
 const parent=await fixture(t),b={'alice-ai':bindings['alice-ai']};
 await put(parent,'direct-computer-alice-ai/old_queued_0001.json',{operationId:'old_queued_0001',state:'started',phase:'queued',job:{},startedAt:'2020-01-01T00:00:00Z'});
 for(let i=0;i<155;i++)await put(parent,'direct-computer-alice-ai/done_task_'+String(i).padStart(4,'0')+'.json',{operationId:'done_task_'+String(i).padStart(4,'0'),state:'finished',finishedAt:'2026-11-06T01:00:00Z',result:{state:'returned'}});
 const s=await loadActivity({parent,bindings:b,grants:{projects:{}},configLoad:async()=>({}),inspect:async()=>null,policy:async()=>false,schedule:(p,b)=>readScheduler(p,b,{residency})});
 assert.equal(s.activities.length,151);assert.equal(s.activities[0].operationId,'old_queued_0001');assert.equal(s.activityScope.moreHistoryAvailable,true);
});
