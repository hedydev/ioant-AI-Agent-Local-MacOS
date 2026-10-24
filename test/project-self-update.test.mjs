import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {actionFromJson,isSafeAction} from '../stage2/protocol.mjs';
import {runAction} from '../stage2/runner.mjs';
import {validateTreeListing,summarizeTests,privateTestEnv} from '../stage2/project-self-update.mjs';

const ROOT=resolve(import.meta.dirname,'..');
const worker=readFileSync(resolve(ROOT,'stage2/chatgpt-loop.mjs'),'utf8');
const shell=readFileSync(resolve(ROOT,'scripts/chatgpt-loop.sh'),'utf8');
const script=readFileSync(resolve(ROOT,'stage2/project-self-update.mjs'),'utf8');
const runner=readFileSync(resolve(ROOT,'stage2/runner.mjs'),'utf8');
const task={protocol:'ioant-mac-ops-v1',id:'self-update-20261024-001',action:'project-update-verify'};

test('self-update task is known but never default-authorized; arbitrary git refs forbidden',async()=>{
 const recognized=actionFromJson(JSON.stringify(task));
 assert.equal(recognized.known,true);
 assert.equal(recognized.authorized,false);
 assert.equal(isSafeAction(task.action),false);
 for(const mutation of [{repo:'other/repo'},{branch:'dev'},{sha:'a'.repeat(40)},{cmd:'rm -rf /'}]){
  assert.throws(()=>actionFromJson(JSON.stringify({...task,...mutation})));
 }
 const rejected=await runAction('project-update-verify',ROOT,{enableSelfUpdate:false});
 assert.equal(rejected.status,'approval_required');
 assert.match(rejected.reason,/--enable-self-update/);
});

test('fixed allowlist and self-update watcher opt-in are separate from Mint and Alice',()=>{
 assert.match(worker,/out\.enableSelfUpdate=true/);
 assert.match(worker,/task\.action==='project-update-verify' && opts\.enableSelfUpdate/);
 assert.match(worker,/enableSelfUpdate:opts\.enableSelfUpdate/);
 assert.match(runner,/if\(options\.enableSelfUpdate!==true\)/);
 assert.match(runner,/project-self-update\.mjs/);
 assert.match(shell,/--enable-self-update/);
 assert.match(shell,/worker_rc != 75/);
 assert.match(shell,/reloads > 3/);
 assert.doesNotMatch(script,/\breset\b|\bstash\b|\bclean -fd\b|force.push/);
});

test('feedback is confirmed and task state persisted BEFORE explicit reload exit 75',()=>{
 const lastState=worker.indexOf('state.lastTaskId=task.id;state.feedbackPending=null');
 const persist=worker.indexOf('await atomicState(stateFile,state);',lastState);
 const reload=worker.indexOf('process.exitCode=75;',persist);
 assert.ok(lastState>=0&&persist>lastState&&reload>persist);
 // The new fifth argument persists press_intent before Enter.
 assert.match(worker,/await sendToChat\(nowTarget,opts\.url,feedback,receipt,\{/);
 assert.match(worker,/beforePress:async\(\)=>\{/);
 assert.match(worker,/state\.feedbackPending\.phase='press_intent';\s*await atomicState\(stateFile,state\)/);
 assert.match(worker,/await beforePress\(\);\s*await browser\('press'/);
 assert.match(worker,/result\.reloadRequired===true/);
 assert.match(worker,/process\.exitCode=75;\s*break;/);
});

test('shell syntax remains valid, no detached supervisor or gateway reinstallation',()=>{
 const check=spawnSync('bash',['-n',resolve(ROOT,'scripts/chatgpt-loop.sh')],{
  encoding:'utf8',timeout:10000});
 assert.equal(check.status,0,check.stderr);
 assert.doesNotMatch(shell,/\bnohup\b|\blaunchctl load\b|\bgateway install\b/);
});

test('Git candidate tree validation rejects symlink, submodule, traversal and oversized blobs',()=>{
 const sha='a'.repeat(40);
 assert.deepEqual(validateTreeListing('100644 blob '+sha+' 10\tstage2/test.mjs\0'),
  {files:1,bytes:10});
 assert.deepEqual(validateTreeListing('100644 blob '+sha+'       10\tstage2/test.mjs\0'),
  {files:1,bytes:10});
 assert.throws(()=>validateTreeListing('120000 blob '+sha+' 8\tstage2/evil\0'));
 assert.throws(()=>validateTreeListing('160000 commit '+sha+' -\tdependency\0'));
 assert.throws(()=>validateTreeListing('100644 blob '+sha+' 10\t../escape\0'));
 assert.throws(()=>validateTreeListing('100644 blob '+sha+' 70000000\tlarge.bin\0'));
});

test('test gate verifies full passing Node summary, not merely subprocess success',()=>{
 const result='ℹ tests 136\nℹ pass 136\nℹ fail 0\nℹ duration_ms 32000';
 assert.deepEqual(summarizeTests(result),{total:136,passed:136,failed:0});
 assert.throws(()=>summarizeTests('ℹ tests 136\nℹ pass 135\nℹ fail 1'));
 assert.throws(()=>summarizeTests('just exited zero'));
});

test('self-update code enforces exact origin/main + two-phase test gate',()=>{
 assert.match(script,/const ORIGINS=new Set/);
 assert.match(script,/hedydev\/ioant-AI-Agent-Local-MacOS/);
 assert.match(script,/git\('fetch','--no-tags','origin','main'\)/);
 assert.match(script,/git\('merge-base','--is-ancestor',original,sha\)/);
 assert.match(script,/git\('pull','--ff-only','origin','main'\)/);
 assert.match(script,/status','--porcelain=v1','--untracked-files=all'/);
 assert.match(script,/archiveCandidate\(sha,temp\)/);
 assert.match(script,/if\(!test\.ok\)throw Object\.assign\(Error\('candidate_tests_failed'\)/);
 assert.match(script,/if\(applied!==sha\)throw Error\('unexpected_post_pull_head'\)/);
 assert.match(script,/await rm\(temp,\{recursive:true,force:true\}\)/);
 assert.doesNotMatch(script,/shell:true|npm install|curl|wget/);
});

test('candidate tests never inherit a live watcher log outside their mock PROJECT_DEV_CACHE',()=>{
 const candidate=privateTestEnv({
  PROJECT_DEV_CACHE:'/Volumes/LunaDrive/DeveloperCache/projects/test-fixture',
  IOANT_LOOP_LOG_FILE:'/Volumes/LunaDrive/DeveloperCache/projects/live/logs/chatgpt-loop/run-20261024T010101Z-5-12345678.jsonl',
  IOANT_CHATGPT_BROWSER_PROFILE:'chrome',
  OPENCLAW_GATEWAY_TOKEN:'simulated-secret',
  NODE_TEST_CONTEXT:'child-v8'
 });
 assert.equal(candidate.IOANT_LOOP_LOG_FILE,undefined);
 assert.equal(candidate.OPENCLAW_GATEWAY_TOKEN,undefined);
 assert.equal(candidate.NODE_TEST_CONTEXT,undefined);
 assert.equal(candidate.PROJECT_DEV_CACHE,'/Volumes/LunaDrive/DeveloperCache/projects/test-fixture');
});
