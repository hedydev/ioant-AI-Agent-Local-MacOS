import test from 'node:test';
import assert from 'node:assert/strict';
import {runTerminalSmoke} from '../scripts/workflow-terminal-smoke.mjs';

const id='d30a0922-1153-49e5-bb75-c27c67a37ec8';
const data={schemaVersion:1,operationId:id,fixture:'ioant-terminal-roundtrip-v1',
 sum:5,modelInferenceInvoked:false};
const fixture={id,prepare:async()=>'/private/fixture.json',
 execute:async()=>({status:'passed',exitCode:0}),
 stat:async()=>({isFile:()=>true,isSymbolicLink:()=>false,mode:0o600,
  size:100,uid:process.getuid()}),read:async()=>JSON.stringify(data)};

test('terminal smoke requires independent content verification, not exit zero',async()=>{
 const r=await runTerminalSmoke(fixture);
 assert.equal(r.state,'passed');
 assert.equal(r.fileReadbackVerified,true);
 assert.equal(r.chatRoundtripVerified,false);
 for(const read of [async()=>'{"sum":5}',async()=>{throw Error('private failure')}]){
  const failed=await runTerminalSmoke({...fixture,read});
  assert.equal(failed.state,'inconclusive');
  assert.equal(failed.reason,'independent_readback_failed');
 }
});

test('missing authority, failed child and unsafe fixture never become success',async()=>{
 for(const status of ['approval_required','failed','timed_out']){
  let reads=0;
  const r=await runTerminalSmoke({...fixture,
   execute:async()=>({status,exitCode:1}),read:async()=>{reads++;throw Error('no read')}});
  assert.notEqual(r.state,'passed');
  assert.equal(reads,0);
 }
 const r=await runTerminalSmoke({...fixture,stat:async()=>({
  isFile:()=>true,isSymbolicLink:()=>true,uid:process.getuid(),mode:0o600,size:100})});
 assert.equal(r.state,'inconclusive');
});

test('one reviewed fixed child command is sent with no model or GUI call',async()=>{
 let calls=0;
 const r=await runTerminalSmoke({...fixture,execute:async task=>{
  calls++;
  assert.equal(task.action,'mac-terminal');
  assert.equal(task.cwd,'workspace');
  assert.match(task.command,/workflow-terminal-smoke\.mjs' --write-fixture/);
  assert.equal(task.command.includes('openclaw agent'),false);
  return {status:'passed',exitCode:0};
 }});
 assert.equal(r.state,'passed');
 assert.equal(calls,1);
});
