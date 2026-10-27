import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {extractWatchedAction,invalidTaskResponse,malformedTaskMeta}
 from '../stage2/task-observation.mjs';
const url='https://chatgpt.com/c/12345678-aaaa-bbbb-cccc-0123456789ab';
const page=raw=>({url,generating:false,messages:[{codes:[raw]}]});
const task=(id,command)=>JSON.stringify({protocol:'ioant-mac-ops-v1',id,
 action:'mac-terminal',cwd:'workspace',command});
test('too-long command is never executable and yields bounded correction receipt',()=>{
 const raw=task('command-too-long-075','x'.repeat(2049));
 const a=extractWatchedAction(page(raw));
 assert.equal(a.status,'rejected_invalid_task');
 assert.equal(a.report.reason,'terminal_command_too_long');
 assert.equal(a.report.id,'command-too-long-075');
 const reply=invalidTaskResponse(a.report);
 assert.match(reply,/Status: invalid_task/);
 assert.match(reply,/2048 characters/);
 assert.match(reply,/No action was executed/);
 assert.doesNotMatch(reply,/x{50}|command:|\\bBearer\\b/);
});
test('bad fields get generic safe feedback without echoing private contents',()=>{
 const raw=JSON.stringify({protocol:'ioant-mac-ops-v1',id:'bad-fields-076',
   action:'project-head',secret:'PRIVATE_SHOULD_NOT_ECHO'});
 const a=extractWatchedAction(page(raw));
 assert.equal(a.report.reason,'invalid_action_fields');
 assert.doesNotMatch(invalidTaskResponse(a.report),/PRIVATE_SHOULD_NOT_ECHO/);
});
test('non-protocol, invalid IDs, unknown action, multiple codes never get correction',()=>{
 for(const raw of [JSON.stringify({protocol:'invalid',id:'a-id-001',action:'mac-terminal',command:'x'}),
   JSON.stringify({protocol:'ioant-mac-ops-v1',id:'!',action:'mac-terminal',command:'x'}),
   JSON.stringify({protocol:'ioant-mac-ops-v1',id:'new-id-001',action:'not-allowed',cwd:'workspace',command:'x'})]){
  assert.equal(malformedTaskMeta(page(raw)),null);
 }
 assert.equal(malformedTaskMeta({messages:[{codes:[task('id-long-077','x'.repeat(2049)),task('id-long-078','x'.repeat(2049))]}]}),null);
 assert.equal(malformedTaskMeta({...page(task('id-long-077','x'.repeat(2049))),generating:true}),null);
});
test('valid structured task still dispatches normally without correction',()=>{
 const a=extractWatchedAction(page(task('valid-079','echo OK')));
 assert.equal(a.status,'task');
 assert.equal(a.task.id,'valid-079');
});
test('the exact-page Watcher persists one correction before send and never executes it',()=>{
 const s=readFileSync(resolve(import.meta.dirname,'../stage2/chatgpt-loop.mjs'),'utf8');
 const start=s.indexOf("if(a.status==='rejected_invalid_task'&&a.report&&a.report.id!==state.lastTaskId)");
 const end=s.indexOf("if(a.status==='task'&&a.task.id!==state.lastTaskId)",start);
 assert.ok(start>0&&end>start);
 const chunk=s.slice(start,end);
 assert.match(chunk,/stable>=2/);
 assert.match(chunk,/state.feedbackPending=\\{id:bad.id,action:'invalid-task-feedback'/);
 assert.match(chunk,/await atomicState\\(stateFile,state\\)/);
 assert.match(chunk,/await sendToChat\\(nowTarget,opts.url,feedback,receipt/);
 assert.match(chunk,/beforePress:async/);
 assert.match(chunk,/state.lastTaskId=bad.id/);
 assert.doesNotMatch(chunk,/runAction|config.patch|execFile|browser\\('press'/);
});
