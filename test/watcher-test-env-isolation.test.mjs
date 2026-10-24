import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runAction} from '../stage2/runner.mjs';

// Emulate the launcher's live log path, while the test worker uses a
// different private PROJECT_DEV_CACHE. Old code passed the live log path
// into test children and hit diagnostic-log.mjs's justified confinement gate.
test('project-tests child does not inherit the live watcher diagnostics path',async()=>{
 const cwd=await mkdtemp(join(tmpdir(),'ioant-test-env-'));
 const original=process.env.IOANT_LOOP_LOG_FILE;
 try{
  const code="import test from 'node:test';import assert from 'node:assert/strict';"+
   "test('no live watcher diagnostic path',()=>assert.equal(process.env.IOANT_LOOP_LOG_FILE,undefined));";
  await writeFile(join(cwd,'smoke.test.mjs'),code);
  process.env.IOANT_LOOP_LOG_FILE='/Volumes/LunaDrive/DeveloperCache/projects/live/logs/chatgpt-loop/run-20261024T010101Z-5-12345678.jsonl';
  const result=await runAction('project-tests',cwd);
  assert.equal(result.status,'passed',result.output);
  const proof=JSON.parse(result.output);
  assert.equal(proof.tests,1);
  assert.equal(proof.pass,1);
  assert.equal(proof.fail,0);
  assert.deepEqual(proof.failingLocations,[]);
 }finally{
  if(original===undefined)delete process.env.IOANT_LOOP_LOG_FILE;
  else process.env.IOANT_LOOP_LOG_FILE=original;
  await rm(cwd,{recursive:true,force:true});
 }
});
