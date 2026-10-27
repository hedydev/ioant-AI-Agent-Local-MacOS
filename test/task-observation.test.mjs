import test from 'node:test';
import assert from 'node:assert/strict';
import {extractWatchedAction} from '../stage2/task-observation.mjs';
const base={url:'https://chatgpt.com/c/12345678-aaaa-bbbb-cccc-0123456789ab',generating:false};
const message=code=>({...base,messages:[{codes:[code]}]});
test('malformed action never executes, next valid task still accepted',()=>{
 const bad=JSON.stringify({protocol:'ioant-mac-ops-v1',id:'bad-command-001',action:'mac-terminal',cwd:'workspace',command:'a'.repeat(2049)});
 const invalid=extractWatchedAction(message(bad));
 assert.equal(invalid.status,'rejected_invalid_task');
 assert.equal(invalid.report.reason,'terminal_command_too_long');
 assert.equal(Object.hasOwn(invalid,'task'),false);
 const ok=JSON.stringify({protocol:'ioant-mac-ops-v1',id:'new-task-002',action:'project-head'});
 const next=extractWatchedAction(message(ok));
 assert.equal(next.status,'task');assert.equal(next.task.id,'new-task-002');
});
test('unexpected command field never grants executor access',()=>{
 const bad=JSON.stringify({protocol:'ioant-mac-ops-v1',id:'unsafe-003',action:'project-head',command:'whoami'});
 assert.equal(extractWatchedAction(message(bad)).status,'rejected_invalid_task');
});
test('invalid role and ambiguous multiple executable tasks still fail closed',()=>{
 assert.throws(()=>extractWatchedAction({...base,messages:null}),/Cannot prove/);
 const a=JSON.stringify({protocol:'ioant-mac-ops-v1',id:'first-004',action:'project-head'});
 const b=JSON.stringify({protocol:'ioant-mac-ops-v1',id:'second-005',action:'project-tests'});
 assert.throws(()=>extractWatchedAction({...base,messages:[{codes:[a,b]}]}),/More than one executable task/);
});
