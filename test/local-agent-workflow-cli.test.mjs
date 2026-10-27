import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {workflowPreview,workflowBootstrap,workflowStatus} from '../stage2/local-agent-workflow-cli.mjs';
const CLI=resolve(import.meta.dirname,'../stage2/local-agent-workflow-cli.mjs');
test('read-only preview reports exact fixed logical plan, never execution authority',()=>{
 for(const project of ['alice-ai','openclaw-workflow']){
  const result=workflowPreview(project);
  assert.equal(result.state,'preview');
  assert.equal(result.executionAuthorized,false);
  assert.equal(result.logicalRolesOnly,true);
  assert.equal(result.summary.ready.length,1);
  assert.equal(result.summary.workerCount,7);
  assert.equal(result.dispatch.proposals[0].workerId,'analysis-worker');
 }
});
test('private store bootstraps one preset only and prevents duplicate initialization',async()=>{
 const base=await mkdtemp(join(tmpdir(),'ioant-agent-workflow-cli-'));
 const root=join(await realpath(base),'chat-projects','workflows');
 const previous=process.env.IOANT_WORKFLOW_TEST_ROOT;
 process.env.IOANT_WORKFLOW_TEST_ROOT='1';
 try{
  const opts={root};
  const created=await workflowBootstrap('alice-ai',opts);
  assert.equal(created.state,'created');
  assert.equal(created.summary.revision,21);
  assert.equal(created.summary.workerCount,7);
  assert.deepEqual(created.summary.ready,['requirements']);
  const observed=await workflowStatus('alice-ai',opts);
  assert.equal(observed.state,'observed');
  assert.deepEqual(observed.dispatch.proposals[0],{
   taskId:'requirements',state:'candidate',workerId:'analysis-worker',
   agentId:'requirements-analyst',kind:'requirements',revision:21});
  await assert.rejects(workflowBootstrap('alice-ai',opts),/EEXIST|file already exists/);
 }finally{
  if(previous===undefined)delete process.env.IOANT_WORKFLOW_TEST_ROOT;
  else process.env.IOANT_WORKFLOW_TEST_ROOT=previous;
  await rm(base,{recursive:true,force:true});
 }
});
test('CLI does not accept task payload, arbitrary project names, shell text or paths',()=>{
 for(const args of [
  ['bootstrap','other'],['bootstrap','alice-ai','rm -rf /'],
  ['preview','../../tmp'],['preview'],['status','alice-ai','--root=/tmp']]){
  const r=spawnSync(process.execPath,[CLI,...args],{encoding:'utf8',timeout:4000});
  assert.equal(r.status,1);
  const v=JSON.parse(r.stdout);
  assert.equal(v.state,'blocked');
 }
 const r=spawnSync(process.execPath,[CLI,'preview','alice-ai'],{encoding:'utf8',timeout:4000});
 assert.equal(r.status,0);
 assert.equal(JSON.parse(r.stdout).executionAuthorized,false);
});
