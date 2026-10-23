import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const root=resolve(import.meta.dirname,'..');
const url='https://chatgpt.com/c/6adb7dca-1214-83ec-b210-42efe8f2042e';
const mock=String.raw`#!/usr/bin/env node
import {appendFileSync} from 'node:fs';
const a=process.argv.slice(2);
appendFileSync(process.env.MOCK_CALLS,JSON.stringify(a)+'\n');
if(a.includes('tabs')) {
 console.log(JSON.stringify({tabs:[{url:process.env.MOCK_CHAT_URL,suggestedTargetId:'t1'}]}));
} else if(a.includes('evaluate')) {
 const d={url:process.env.MOCK_CHAT_URL,generating:false,composerPresent:true,composerEmpty:true,
   messages:[{codes:[JSON.stringify({protocol:'ioant-mac-ops-v1',id:'test-probe-must-not-run',action:'project-tests'})]}],
   users:[]};
 console.log(JSON.stringify({value:'IOANT_MAC_LOOP_RESULT::'+JSON.stringify(d)}));
} else {console.error('Unexpected mutating browser operation');process.exit(55)}
`;

test('--once only reads the exact ChatGPT conversation even if the latest assistant turn contains an executable task',async()=>{
 const base=await mkdtemp(join(tmpdir(),'ioant-readonly-probe-'));
 try{
   const home=join(base,'home');
   const vol=join(base,'LunaDrive');
   const cache=join(vol,'DeveloperCache','projects','test-probe');
   await mkdir(home,{recursive:true});
   await mkdir(cache,{recursive:true});
   const browser=join(base,'mock-browser.mjs');
   const calls=join(base,'calls.jsonl');
   await writeFile(browser,mock,{mode:0o700});
   await writeFile(calls,'');
   const run=spawnSync(process.execPath,['stage2/chatgpt-loop.mjs','--once','--chat-url',url],{
      cwd:root,encoding:'utf8',timeout:12000,
      env:{...process.env,HOME:home,IOANT_OPENCLAW_BIN:browser,MOCK_CHAT_URL:url,MOCK_CALLS:calls,PROJECT_DEV_CACHE:cache,IOANT_DEV_VOLUME:vol}
   });
   assert.equal(run.status,0,run.stderr);
   assert.match(run.stdout,/Read-only ChatGPT probe passed/);
   assert.match(run.stdout,/no task executed or message sent/);
   const actual=(await readFile(calls,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
   assert.deepEqual(actual.map(a=>a.at(-1)==='tabs'?'tabs':a.includes('evaluate')?'evaluate':'mutation'),['tabs','evaluate']);
 }finally{await rm(base,{recursive:true,force:true});}
});
