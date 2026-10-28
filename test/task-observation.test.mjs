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
test('invalid provenance still throws, ambiguous actions are all rejected without execution',()=>{
 assert.throws(()=>extractWatchedAction({...base,messages:null}),/Cannot prove/);
 const a=JSON.stringify({protocol:'ioant-mac-ops-v1',id:'first-004',action:'project-head'});
 const b=JSON.stringify({protocol:'ioant-mac-ops-v1',id:'second-005',action:'project-tests'});
 const refused=extractWatchedAction({...base,messages:[{codes:[a,b]}]});
 assert.deepEqual(refused,{status:'rejected_ambiguous_task'});
 assert.equal(Object.hasOwn(refused,'task'),false);
 assert.equal(Object.hasOwn(refused,'report'),false);
 assert.equal(Object.hasOwn(refused,'fingerprint'),false);
});
test('three valid tasks never result in a chosen task or execution',()=>{
 const codes=['project-head','project-status','project-tests'].map((action,i)=>
  JSON.stringify({protocol:'ioant-mac-ops-v1',id:'ambiguous-'+i,action}));
 const rejected=extractWatchedAction({...base,messages:[{codes}]});
 assert.deepEqual(rejected,{status:'rejected_ambiguous_task'});
});
test('new single action after ambiguous turn can be selected safely',()=>{
 const a=JSON.stringify({protocol:'ioant-mac-ops-v1',id:'ambiguous-a',action:'project-head'});
 const b=JSON.stringify({protocol:'ioant-mac-ops-v1',id:'ambiguous-b',action:'project-tests'});
 const first=extractWatchedAction({...base,messages:[{codes:[a,b]}]});
 assert.equal(first.status,'rejected_ambiguous_task');
 const second=extractWatchedAction({...base,messages:[{codes:[a,b]},{codes:[a]}]});
 assert.equal(second.status,'task');
 assert.equal(second.task.id,'ambiguous-a');
});
test('multiple snippets with only one valid task can still be handled',()=>{
 const good=JSON.stringify({protocol:'ioant-mac-ops-v1',id:'single-c',action:'project-head'});
 const other='example: invalid json';
 const result=extractWatchedAction({...base,messages:[{codes:[other,good]}]});
 assert.equal(result.status,'task');
 assert.equal(result.task.id,'single-c');
});
