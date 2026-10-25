import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {proofPreInvocationCrash} from '../stage2/openclaw-dev-interrupted-claim.mjs';

const ID='openclaw-dev-create-20261025-062';
const time='2026-10-25T00:00:00.000Z';
const state=()=>({lastTaskId:'old-safe-task',feedbackPending:null,
 devAgentCreationAttempted:{id:ID,at:time}});
const ready=()=>({audit:'IOANT_OPENCLAW_DEV_PREFLIGHT',readOnly:true,state:'ready',
 configWrite:false,writeApproved:false});
const event=(name,extra={},at=time)=>({source:'ioant-loop',at,event:name,...extra});
const oldRun=()=>[
 event('launcher_start',{},'2026-10-24T23:54:48.000Z'),
 event('worker_start',{},'2026-10-24T23:54:49.000Z'),
 event('task_seen',{taskId:ID,action:'openclaw-dev-create'}),
 event('action_started',{taskId:ID,action:'openclaw-dev-create'}),
 event('watch_stopped',{},'2026-10-25T00:00:01.000Z'),
 event('worker_error',{code:'unexpected'},'2026-10-25T00:00:02.000Z'),
 event('launcher_exit',{exitCode:1},'2026-10-25T00:00:03.000Z')
];
test('only this one verified pre-invocation diagnostic crash can be reconciled',()=>{
 assert.equal(proofPreInvocationCrash(state(),oldRun(),ready()),true);
 const src=readFileSync(resolve(import.meta.dirname,'../stage2/chatgpt-loop.mjs'),'utf8');
 const claim=src.indexOf("state.devAgentCreationAttempted={id:task.id");
 const persist=src.indexOf("await atomicState(stateFile,state);",claim);
 const diagnostic=src.indexOf("recordDiagnosticEvent('openclaw_dev_create_claimed'",persist);
 const invoke=src.indexOf("result=await runAction(task.action,ROOT,{enableOpenClawDevCreate:true});",diagnostic);
 assert.ok(claim>0&&persist>claim&&diagnostic>persist&&invoke>diagnostic);
 const recovery=readFileSync(resolve(import.meta.dirname,'../stage2/openclaw-dev-interrupted-claim.mjs'),'utf8');
 assert.match(recovery,/acquireConversationLock\(store\)/);
 assert.match(recovery,/lastTaskId:ATTEMPT/);
 assert.match(recovery,/delete next.devAgentCreationAttempted/);
});
test('unknown or potentially invoked commands NEVER clear a claim',()=>{
 const modifications=[
  x=>{x.push(event('openclaw_dev_create_claimed',{taskId:ID}))},
  x=>{x.push(event('action_finished',{taskId:ID,action:'openclaw-dev-create'}))},
  x=>{x.push(event('report_saved',{taskId:ID}))},
  x=>{x.splice(5,1)},
  x=>{x.splice(6,1)},
  x=>{x[3].action='openclaw-alice-create'},
  x=>{x[3].taskId='other-task'},
  x=>{x.push(event('action_started',{taskId:ID,action:'openclaw-dev-create'}))},
  x=>{x[5].code='timeout'}
 ];
 for(const mutate of modifications){
  const x=oldRun();mutate(x);
  assert.equal(proofPreInvocationCrash(state(),x,ready()),false);
 }
});
test('claim identity, pending feedback and readonly live preflight are mandatory',()=>{
 for(const change of [
  s=>{s.devAgentCreationAttempted.id='another-id'},
  s=>{s.devAgentCreationAttempted.at='bad'},
  s=>{s.feedbackPending={id:ID}},
  s=>{s.lastTaskId=ID},
  s=>{s.devAgentCreationRecovery={id:ID}},
  s=>{delete s.devAgentCreationAttempted}
 ]){const s=state();change(s);assert.equal(proofPreInvocationCrash(s,oldRun(),ready()),false);}
 for(const change of [
  r=>{r.state='blocked'},r=>{r.configWrite=true},r=>{r.writeApproved=true},
  r=>{r.audit='untrusted'},r=>{delete r.writeApproved}
 ]){const r=ready();change(r);assert.equal(proofPreInvocationCrash(state(),oldRun(),r),false);}
});
test('this repair never invokes Agent creation or accepts arbitrary paths/commands',()=>{
 const source=readFileSync(resolve(import.meta.dirname,'../stage2/openclaw-dev-interrupted-claim.mjs'),'utf8');
 assert.match(source,/const ATTEMPT='openclaw-dev-create-20261025-062'/);
 assert.match(source,/const LOG_NAME='run-20261024T235448Z-82118-ca6d81ec\.jsonl'/);
 // Comments describe why the call is prohibited; assert against executable
 // source lines so a non-executing explanatory comment cannot fail this test.
 const nonCommentSource=source.split('\n')
  .filter(line=>!line.trimStart().startsWith('//')).join('\n');
 assert.doesNotMatch(nonCommentSource,/config\.patch|spawn\(|execFile\(|runAction\(|createOpenClawDev\(/);
 assert.match(source,/if\(process\.argv\.length!==2\)/);
});
