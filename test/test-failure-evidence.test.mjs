import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {summarizeTestEvidence,validTestEvidence} from '../stage2/test-failure-evidence.mjs';

test('spec reporter produces bounded failed test source locations rather than assertion values',()=>{
 const sample=[
  '✖ prepared feedback recovers from snapshot timeout without task reexecution (17000ms)',
  'test at test/chatgpt-feedback-recovery.test.mjs:63:1',
  '  actual: password=do-not-transmit',
  '✖ worktree candidate errors',
  'test at test/project-self-update.test.mjs:42:1',
  'ℹ tests 148','ℹ pass 146','ℹ fail 2'
 ].join('\n');
 const evidence=summarizeTestEvidence(sample);
 assert.deepEqual({tests:evidence.tests,pass:evidence.pass,fail:evidence.fail},
  {tests:148,pass:146,fail:2});
 assert.deepEqual(evidence.failingLocations,[
  {file:'test/chatgpt-feedback-recovery.test.mjs',line:63,column:1},
  {file:'test/project-self-update.test.mjs',line:42,column:1}
 ]);
 assert.equal(validTestEvidence(evidence),true);
 assert.doesNotMatch(JSON.stringify(evidence),/password|do-not-transmit|actual:/);
});

test('unsupported paths, traversal and untrusted text never enter test evidence',()=>{
 const result=summarizeTestEvidence([
  'test at /Users/ted/secret/creds:1:1',
  'test at test/../secret.mjs:1:1',
  'test at test/allowed.mjs:13:7',
  'Assertion error token=private-secret'
 ].join('\n'));
 assert.deepEqual(result.failingLocations,[{file:'test/allowed.mjs',line:13,column:7}]);
 assert.equal(validTestEvidence(result),true);
 assert.doesNotMatch(JSON.stringify(result),/private-secret|Users\/ted/);
});

test('TAP counters, missing summaries and duplicate locations stay bounded',()=>{
 const input='# tests 1\n# pass 0\n# fail 1\n'+
  'test at test/foo.test.mjs:21:1\n'.repeat(12);
 const result=summarizeTestEvidence(input);
 assert.equal(result.tests,1);
 assert.equal(result.pass,0);
 assert.equal(result.fail,1);
 assert.equal(result.failingLocations.length,1);
 const noSummary=summarizeTestEvidence('execution stopped before summary');
 assert.equal(noSummary.tests,null);
 assert.equal(noSummary.fail,null);
 assert.equal(validTestEvidence(noSummary),true);
});

test('reject forged audit objects and failure locations',()=>{
 const ok=summarizeTestEvidence('test at test/sample.test.mjs:1:1');
 assert.equal(validTestEvidence({...ok,audit:'wrong'}),false);
 assert.equal(validTestEvidence({...ok,failingLocations:[{file:'../../.env',line:2,column:2}]}),false);
 assert.equal(validTestEvidence({...ok,failingLocations:Array(11).fill({file:'test/a.mjs',line:1,column:1})}),false);
});

test('runner and updater preserve strict test gates and only forward sanitized diagnostics',()=>{
 const runner=readFileSync(resolve(import.meta.dirname,'..','stage2/runner.mjs'),'utf8');
 const updater=readFileSync(resolve(import.meta.dirname,'..','stage2/project-self-update.mjs'),'utf8');
 assert.match(runner,/isProjectTests\?JSON\.stringify\(summarizeTestEvidence\(output\)\):output/);
 assert.match(runner,/validTestEvidence\(audit\.testEvidence\)/);
 assert.match(updater,/if\(!test\.ok\)throw Object\.assign\(Error\('candidate_tests_failed'\)/);
 assert.match(updater,/if\(applied!==sha\)throw Error\('unexpected_post_pull_head'\)/);
 assert.match(updater,/status','--porcelain=v1','--untracked-files=all'/);
});

test('watcher-scoped diagnostic path is scrubbed by BOTH local and candidate test runners',()=>{
 const runner=readFileSync(resolve(import.meta.dirname,'..','stage2/runner.mjs'),'utf8');
 const updater=readFileSync(resolve(import.meta.dirname,'..','stage2/project-self-update.mjs'),'utf8');
 assert.match(runner,/if\(isProjectTests\)\{[\s\S]*?delete env\.IOANT_LOOP_LOG_FILE;/);
 assert.match(updater,/function privateTestEnv\(parent=process\.env\)\{[\s\S]*?delete env\.IOANT_LOOP_LOG_FILE;/);
 assert.match(runner,/delete env\.NODE_TEST_CONTEXT/);
 assert.match(updater,/delete env\.NODE_TEST_CONTEXT/);
});
