import test from 'node:test';
import assert from 'node:assert/strict';
import {scopedReadRequest,scopedCloseRequest,withScopedNativeReads}
 from '../scripts/openclaw-cua-owned-session-guard.mjs';
const UUID='7f574a5a-594e-45e6-9d4b-28e920890667',NODE='synthetic-mac';
const request=action=>({action});
const unpack=args=>JSON.parse(args[7]);

test('only read-only actions may join the scoped CUA execution',()=>{
 for(const action of ['list_windows','get_cursor_position']){
  const args=scopedReadRequest(NODE,UUID,action);
  assert.deepEqual(args.slice(0,6),[
   'nodes','invoke','--node',NODE,'--command','computer.act']);
  assert.deepEqual(unpack(args),{action,executionId:UUID});
 }
 const a=scopedReadRequest(NODE,UUID,'get_window_state',{windowRef:'fixture'});
 assert.deepEqual(unpack(a),{action:'get_window_state',
  executionId:UUID,windowRef:'fixture',includeScreenshot:false});
 for(const action of ['set_value','click','type','key','__close_execution',
  'launch_app','screenshot','browser_navigate'])
  assert.throws(()=>scopedReadRequest(NODE,UUID,action),/unsupported_scoped/);
 assert.throws(()=>scopedReadRequest(NODE,UUID,'get_window_state'),
  /fixture_window_reference_required/);
});
test('close accepts only a specific valid UUID, never omitted or guessed owner',()=>{
 const a=scopedCloseRequest(NODE,UUID);
 assert.deepEqual(unpack(a),{action:'__close_execution',executionId:UUID,
  reason:'scoped-read-finished'});
 for(const id of ['',null,undefined,'random','00000000-0000-0000-0000-000000000000'])
  assert.throws(()=>scopedCloseRequest(NODE,id),/invalid_scoped/);
 assert.throws(()=>scopedCloseRequest('',UUID),/invalid_scoped/);
});
test('successful two reads issue one matching close with no new ID',async()=>{
 const calls=[];
 const out=await withScopedNativeReads({
  nodeId:NODE,makeId:()=>UUID,
  actions:[request('get_cursor_position'),request('list_windows')],
  call:async args=>{
   calls.push(unpack(args));
   if(unpack(args).action==='__close_execution')
    return {result:{ok:true}};
   return {result:{ok:true,details:{secret:'private window title'}}};
  }});
 assert.deepEqual(calls.map(x=>x.action),[
  'get_cursor_position','list_windows','__close_execution']);
 assert.equal(calls.every(x=>x.executionId===UUID),true);
 assert.equal(out.closure.acknowledged,true);
 assert.equal(out.closure.ownerReleaseVerified,false);
 assert.equal(out.crossExecutionCloseAttempted,false);
 assert.equal(out.nativeInputAttempted,false);
});
test('BUSY preadmission failure does not attempt an unrelated owner close',async()=>{
 const calls=[];
 const r=await withScopedNativeReads({
  nodeId:NODE,makeId:()=>UUID,
  actions:[request('get_cursor_position'),request('list_windows')],
  classifyError:()=>({category:'computer_execution_occupied'}),
  call:async args=>{calls.push(unpack(args));throw Error('PRIVATE_APP')}
 });
 assert.equal(calls.length,1);
 assert.equal(r.results.length,1);
 assert.equal(r.results[0].state,'failed');
 assert.equal(r.closure.attempted,false);
});
test('unclassified provider error may have opened own execution, close matching ID',async()=>{
 const calls=[];
 const r=await withScopedNativeReads({
  nodeId:NODE,makeId:()=>UUID,
  actions:[request('list_windows'),request('get_cursor_position')],
  classifyError:()=>({category:'unclassified'}),
  call:async args=>{
   calls.push(unpack(args));
   if(unpack(args).action==='__close_execution')return {ok:true};
   throw Error('private information not exposed in summary');
  }});
 assert.deepEqual(calls.map(x=>x.action),[
  'list_windows','__close_execution']);
 assert.equal(calls[0].executionId,calls[1].executionId);
 assert.equal(r.closure.attempted,true);
 assert.equal(r.closure.acknowledged,true);
 assert.equal(r.closure.ownerReleaseVerified,false);
 assert.equal(JSON.stringify(r).includes('private information'),false);
});
test('explicit Gateway permission refusal never leads to second native call',async()=>{
 for(const category of ['operator_scope_missing','node_pairing_required',
  'gateway_unauthorized','gateway_command_policy']){
  const calls=[];
  const out=await withScopedNativeReads({
   nodeId:NODE,makeId:()=>UUID,
   actions:[request('list_windows'),request('get_cursor_position')],
   classifyError:()=>({category}),
   call:async args=>{calls.push(unpack(args));throw Error('denied')}
  });
  assert.equal(calls.length,1);
  assert.equal(out.closure.attempted,false);
 }
});
test('close denied never claims owner was safely released',async()=>{
 const calls=[];
 const out=await withScopedNativeReads({
  nodeId:NODE,makeId:()=>UUID,
  actions:[request('list_windows')],
  call:async args=>{
   calls.push(unpack(args));
   if(unpack(args).action==='__close_execution')throw Error('private driver');
   return {ok:true};
  }
 });
 assert.equal(calls.length,2);
 assert.equal(out.closure.attempted,true);
 assert.equal(out.closure.acknowledged,false);
 assert.equal(out.closure.ownerReleaseVerified,false);
});
test('preflight rejects bad identity or >2 read operations without invoking anything',async()=>{
 let calls=0;
 for(const param of [
  {nodeId:'',makeId:()=>UUID,actions:[request('list_windows')]},
  {nodeId:NODE,makeId:()=>UUID,actions:[]},
  {nodeId:NODE,makeId:()=>UUID,actions:Array(3).fill(request('list_windows'))},
  {nodeId:NODE,makeId:()=> 'bad',actions:[request('list_windows')]}
 ]){
  await assert.rejects(withScopedNativeReads({
   ...param,call:async()=>{calls++;}
  }));
 }
 assert.equal(calls,0);
});
