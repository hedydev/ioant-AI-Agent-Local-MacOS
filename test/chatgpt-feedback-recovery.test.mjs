import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {chatKey} from '../stage2/protocol.mjs';
import {recoverLegacyCanary} from '../stage2/recover-canary-feedback.mjs';

const ROOT=resolve(import.meta.dirname,'..');
const CHAT='https://chatgpt.com/c/6adb7dca-1214-83ec-b210-42efe8f2042e';
const ID='self-update-20261024-canary-001';
const STATUS='[IOANT-MAC-OPS RESULT '+ID+']\nAction: project-update-verify\nStatus: passed\nSession: abc01234\nOutput (bounded/redacted):\n{"state":"updated"}';
const ACK='SNAPSHOT FAILED BEFORE TYPE';

const MOCK="#!/usr/bin/env node\nimport {readFileSync,writeFileSync} from 'node:fs';\nconst args=process.argv.slice(2);\nconst file=process.env.MOCK_BROWSER_STATE;\nconst s=JSON.parse(readFileSync(file,'utf8'));\nconst save=()=>writeFileSync(file,JSON.stringify(s));\nconst has=x=>args.includes(x);\nif(has('tabs'))console.log(JSON.stringify({tabs:[{url:s.url,suggestedTargetId:'t1'}]}));\nelse if(has('evaluate'))\n console.log(JSON.stringify({result:{type:'string',value:'IOANT_MAC_LOOP_RESULT::'+JSON.stringify({\n  url:s.url,selectorFound:false,generating:false,messages:[],users:s.users,\n  composerPresent:true,composerEmpty:!s.composer\n })}}));\nelse if(has('snapshot')){\n s.snapshots++;save();\n if(s.snapshots<=s.failSnapshots)process.exit(19);\n console.log('- textbox \"Message ChatGPT\" [ref=e42]');\n}else if(has('type')){s.types++;s.composer=args.at(-1);save();}\nelse if(has('press')){s.presses++;s.users.push(s.composer);s.composer='';save();}\nelse process.exit(17);\n";

async function fixture(fn){
 const home=await mkdtemp(join(tmpdir(),'ioant-feedback-test-'));
 const volume=join(home,'LunaDrive');
 const cache=join(volume,'DeveloperCache','projects','self-recovery');
 const work=join(cache,'chatgpt-loop',chatKey(CHAT));
 await mkdir(work,{recursive:true,mode:0o700});
 const stateFile=join(work,'state.json');
 const state={lastTaskId:'previous-complete',initSent:true,feedbackPending:{
  id:ID,feedback:STATUS}};
 await writeFile(stateFile,JSON.stringify(state),{mode:0o600});
 const mock=join(home,'browser.mjs'),browserFile=join(home,'browser.json');
 await writeFile(mock,MOCK,{mode:0o700});
 await writeFile(browserFile,JSON.stringify({url:CHAT,users:[],composer:'',snapshots:0,failSnapshots:1,types:0,presses:0}));
 try{return await fn({home,volume,cache,work,stateFile,browserFile,mock,state})}
 finally{await rm(home,{recursive:true,force:true})}
}
test('legacy task cannot silently become prepared: explicit operator phrase required',()=>fixture(async f=>{
 await assert.rejects(recoverLegacyCanary({chatUrl:CHAT,cache:f.cache,volume:f.volume,
  operatorConfirmation:'yes'}),/operator confirmation/);
 const s=JSON.parse(await readFile(f.stateFile,'utf8'));
 assert.equal(s.feedbackPending.phase,undefined);
}));

test('explicit recovery changes only pending phase, never executes Git or sends chat',()=>fixture(async f=>{
 const result=await recoverLegacyCanary({chatUrl:CHAT,cache:f.cache,volume:f.volume,
  operatorConfirmation:ACK});
 assert.equal(result.state,'prepared_for_safe_feedback_only');
 assert.equal(result.taskReexecuted,false);
 const s=JSON.parse(await readFile(f.stateFile,'utf8'));
 assert.equal(s.feedbackPending.phase,'prepared');
 assert.equal(s.feedbackPending.action,'project-update-verify');
 assert.equal(s.feedbackPending.reloadRequired,false);
 assert.equal(s.lastTaskId,'previous-complete');
 assert.equal(s.initSent,true);
 await assert.rejects(recoverLegacyCanary({chatUrl:CHAT,cache:f.cache,volume:f.volume,
  operatorConfirmation:ACK}),/No matching legacy canary feedback/);
}));

test('different task IDs cannot turn into send authorization',()=>fixture(async f=>{
 const state={...f.state,feedbackPending:{id:'different-task',feedback:STATUS}};
 await writeFile(f.stateFile,JSON.stringify(state),{mode:0o600});
 await assert.rejects(recoverLegacyCanary({chatUrl:CHAT,cache:f.cache,volume:f.volume,
  operatorConfirmation:ACK}),/No matching legacy canary feedback/);
}));

test('prepared feedback recovers from snapshot timeout without task reexecution',()=>fixture(async f=>{
 await recoverLegacyCanary({chatUrl:CHAT,cache:f.cache,volume:f.volume,operatorConfirmation:ACK});
 const child=spawn(process.execPath,['stage2/chatgpt-loop.mjs','--chat-url',CHAT,'--watch','--interval','10'],{
  cwd:ROOT,env:{...process.env,HOME:f.home,IOANT_OPENCLAW_BIN:f.mock,
   MOCK_BROWSER_STATE:f.browserFile,PROJECT_DEV_CACHE:f.cache,IOANT_DEV_VOLUME:f.volume},
  stdio:['ignore','pipe','pipe']
 });
 let stdout='',stderr='';
 child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
 try{
  const deadline=Date.now()+22000;
  while(Date.now()<deadline){
   const b=JSON.parse(await readFile(f.browserFile,'utf8'));
   if(b.users.some(u=>u.startsWith('[IOANT-MAC-OPS RESULT '+ID+']')))break;
   if(child.exitCode!==null)break;
   await new Promise(r=>setTimeout(r,150));
  }
  const b=JSON.parse(await readFile(f.browserFile,'utf8'));
  const s=JSON.parse(await readFile(f.stateFile,'utf8'));
  assert.equal(b.types,1,JSON.stringify({stdout,stderr}).slice(0,1300));
  assert.equal(b.presses,1);
  assert.equal(b.snapshots,2);
  assert.equal(b.users.filter(u=>u.startsWith('[IOANT-MAC-OPS RESULT '+ID+']')).length,1);
  assert.equal(s.lastTaskId,ID);
  assert.equal(s.feedbackPending,null);
  assert.doesNotMatch(stderr,/STOP|Unhandled/);
 }finally{
  child.kill('SIGTERM');
  await new Promise(done=>{if(child.exitCode!==null)return done();child.once('close',done);setTimeout(done,2500)});
  if(child.exitCode===null)child.kill('SIGKILL');
 }
}),{timeout:30000});

test('uncertain Enter or legacy feedback is never automatically resent',async()=>{
 const code=await readFile(join(ROOT,'stage2/chatgpt-loop.mjs'),'utf8');
 assert.match(code,/phase:'prepared'/);
 assert.match(code,/phase='press_intent'/);
 assert.match(code,/pending\.phase==='prepared'/);
 assert.match(code,/Previous feedback may have been submitted; receipt not visible/);
 assert.match(code,/continue; \/\/ Never run a new task while previous feedback unresolved/);
 assert.match(code,/await beforePress\(\);\s*await browser\('press'/);
 assert.match(code,/state\.feedbackPending\.phase='press_intent';\s*await atomicState\(stateFile,state\)/);
});
