import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,mkdir,writeFile,readFile,lstat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initializeWorkflow,inspectWorkflow,transactWorkflow} from '../stage2/workflow-store.mjs';
const at='2026-10-27T00:00:00Z';
process.env.IOANT_WORKFLOW_TEST_ROOT='1';
let counter=0;
async function fixture(fn){
 const raw=await mkdtemp(join(tmpdir(),'ioant-workflow-fixture-'));
 const dir=await realpath(raw);
 try{
  const root=join(dir,'chat-projects','workflows');
  await initializeWorkflow('workflow-test',{root});
  return await fn(root,dir);
 }finally{await rm(dir,{recursive:true,force:true})}
}
function evt(rev,type,extra={}){
 return {id:'event-'+(++counter),expectedRevision:rev,type,at,...extra};
}
test('durable private ledger writes atomic revision and read-back',async()=>{
 await fixture(async root=>{
  const s=await inspectWorkflow('workflow-test',{root});
  assert.equal(s.summary.revision,0);
  const updated=await transactWorkflow('workflow-test',
   evt(0,'worker_register',{worker:{id:'worker-one',capabilities:['task-kind']}}),{root});
  assert.equal(updated.revision,1);
  const file=join(root,'workflow-test.json');
  assert.equal((await lstat(file)).mode&0o077,0);
  assert.equal((await inspectWorkflow('workflow-test',{root})).snapshot.workers[0].id,'worker-one');
  await assert.rejects(transactWorkflow('workflow-test',
   evt(0,'worker_register',{worker:{id:'worker-two',capabilities:['task-kind']}}),{root}),
   /invalid_event_or_stale_revision/);
  assert.equal((await inspectWorkflow('workflow-test',{root})).summary.revision,1);
 });
});
test('two workers using the same revision cannot both commit',async()=>{
 await fixture(async root=>{
  const [a,b]=await Promise.allSettled([
   transactWorkflow('workflow-test',evt(0,'worker_register',{worker:{id:'worker-one',capabilities:['safe-check']}}),{root}),
   transactWorkflow('workflow-test',evt(0,'worker_register',{worker:{id:'worker-two',capabilities:['safe-check']}}),{root})
  ]);
  assert.equal([a,b].filter(x=>x.status==='fulfilled').length,1);
  const state=(await inspectWorkflow('workflow-test',{root})).snapshot;
  assert.equal(state.revision,1);
  assert.equal(state.workers.length,1);
 });
});
test('unknown owner lock blocks all writes without removing lock',async()=>{
 await fixture(async root=>{
  const path=join(root,'workflow-test.lock');
  await mkdir(path,{mode:0o700});
  await writeFile(join(path,'owner.json'),JSON.stringify({pid:123,nonce:'untrusted'}),{mode:0o600});
  await assert.rejects(transactWorkflow('workflow-test',
   evt(0,'worker_register',{worker:{id:'worker-one',capabilities:[]}}),{root}),
   /workflow_lock_busy/);
  assert.equal((await readFile(join(path,'owner.json'),'utf8')).includes('untrusted'),true);
  assert.equal((await inspectWorkflow('workflow-test',{root})).summary.revision,0);
 });
});
test('unsafe symlink and world-writable store are rejected',async()=>{
 await fixture(async(root,base)=>{
  const path=join(root,'workflow-test.json');
  await import('node:fs/promises').then(fs=>fs.chmod(path,0o644));
  await assert.rejects(inspectWorkflow('workflow-test',{root}),/unsafe_workflow_file/);
  const fake=join(base,'public');
  await mkdir(fake,{mode:0o700});
  await import('node:fs/promises').then(fs=>fs.chmod(fake,0o777));
  // Even a caller-provided root requires a properly owned private directory.
  await assert.rejects(inspectWorkflow('workflow-test',{root:fake}),/unsafe_workflow_directory/);
 });
});
test('explicit paths are rejected outside test authority',async()=>{
 await fixture(async(root)=>{
  delete process.env.IOANT_WORKFLOW_TEST_ROOT;
  await assert.rejects(inspectWorkflow('workflow-test',{root}),/injected_root_not_authorized/);
  process.env.IOANT_WORKFLOW_TEST_ROOT='1';
 });
});
