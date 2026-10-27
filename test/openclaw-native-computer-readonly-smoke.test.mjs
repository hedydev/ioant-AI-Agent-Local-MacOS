import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCursorReadArgs,classifiedComputerReply,inspectNativeComputerRead}
 from '../scripts/openclaw-native-computer-readonly-smoke.mjs';

const uuid='d74d37dd-dcc3-42d0-ab46-70a43cad4a7f';
test('native request is fixed action with UUID and selected node',()=>{
 const args=makeCursorReadArgs('paired-node-id',uuid);
 assert.deepEqual(args.slice(0,6),
  ['nodes','invoke','--node','paired-node-id','--command','computer.act']);
 assert.deepEqual(JSON.parse(args[7]),{action:'get_cursor_position',executionId:uuid});
 assert.equal(args[8],'--json');
 assert.equal(args.some(x=>x.includes('browser')),false);
});
test('reject unexpected node ids and execution identifiers',()=>{
 assert.throws(()=>makeCursorReadArgs('',uuid),/invalid_node_or_execution_id/);
 assert.throws(()=>makeCursorReadArgs('known','old-id'),/invalid_node_or_execution_id/);
 assert.throws(()=>makeCursorReadArgs('known','00000000-0000-0000-0000-000000000000'),/invalid_node_or_execution_id/);
});
test('transport-only acknowledgement does not prove actual provider action',()=>{
 for(const x of [{ok:true},{result:{ok:true}},{success:true},{result:{success:true}},null]){
  const r=classifiedComputerReply(x);
  assert.equal(r.state,'inconclusive');
 }
});
test('recognizes native action envelope nested under transport',()=>{
 const out=classifiedComputerReply({result:{payload:{ok:true,details:{
  cursorX:200,cursorY:450,privateWindowName:'dont print'}}}});
 assert.equal(out.state,'observed');
 assert.equal(out.reason,'native_read_completed');
 assert.equal(JSON.stringify(out).includes('privateWindowName'),false);
 assert.equal(JSON.stringify(out).includes('cursorX'),false);
});
test('native refusal is not mistaken for successful computer control',()=>{
 const out=classifiedComputerReply({result:{
  ok:false,details:{code:'not_authorized',privateUserText:'redact'}}});
 assert.deepEqual(out,{state:'refused',reason:'native_provider_refused'});
});
test('invalid native envelopes remain inconclusive without disclosing content',()=>{
 const out=classifiedComputerReply({content:JSON.stringify({ok:true,
   privateMessage:'my secret'})});
 assert.equal(out.state,'inconclusive');
 assert.equal(JSON.stringify(out).includes('my secret'),false);
});

test('legacy get_cursor_position uses one own UUID and exactly matching close',async()=>{
 const calls=[];
 const out=await inspectNativeComputerRead({
  uuid:()=>uuid,
  call:async args=>{
   calls.push(args);
   if(args[1]==='status')return {nodes:[{
    nodeId:'mac',platform:'macOS 27',connected:true,
    commands:['screen.snapshot','computer.act']
   }]};
   const p=JSON.parse(args[7]);
   if(p.action==='__close_execution')return {ok:true};
   return {result:{ok:true,details:{cursorX:10,cursorY:20}}};
  }
 });
 assert.equal(calls.length,3);
 assert.equal(JSON.parse(calls[1][7]).action,'get_cursor_position');
 assert.equal(JSON.parse(calls[2][7]).action,'__close_execution');
 assert.equal(JSON.parse(calls[1][7]).executionId,uuid);
 assert.equal(JSON.parse(calls[2][7]).executionId,uuid);
 assert.equal(out.state,'observed');
 assert.equal(out.ownExecutionClosure.attempted,true);
 assert.equal(out.ownExecutionClosure.ownerReleaseVerified,false);
 assert.equal(out.existingOwnerReleased,false);
});
test('legacy cursor read never attempts to close a busy unknown owner',async()=>{
 const calls=[];
 const out=await inspectNativeComputerRead({
  uuid:()=>uuid,
  call:async args=>{
   calls.push(args);
   if(args[1]==='status')return {nodes:[{
    nodeId:'mac',platform:'macOS 27',connected:true,
    commands:['screen.snapshot','computer.act']
   }]};
   throw Object.assign(Error('private execution owner'),{code:1,
    stdout:JSON.stringify({error:{message:
     'COMPUTER_HOST_BUSY: another provider execution owns this computer'}})});
  }
 });
 assert.equal(calls.length,2);
 assert.equal(out.state,'inconclusive');
 assert.equal(out.ownExecutionClosure.attempted,false);
 assert.equal(JSON.stringify(out).includes('private execution'),false);
});
