import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 concludeLeaseTransition,classifyCUAResponse,inspectOwnLeaseTransition
} from '../scripts/openclaw-cua-lease-transition-readonly.mjs';
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const NODE='mock-safe-node';
const descriptor={provider:{id:'cua-computer',generation:'gen-1'},
 contractVersion:2,actions:['get_cursor_position']};
const status=async()=>({nodes:[{nodeId:NODE,connected:true,
 platform:'macos 27.0.1',computerUse:descriptor,
 commands:['computer.act']}]});
const mock=(responses)=>{
 const calls=[];
 const run=async args=>{
  assert.deepEqual(args.slice(0,2),['nodes','invoke']);
  assert.equal(args[3],NODE);
  assert.equal(args[5],'computer.act');
  const req=JSON.parse(args[7]);
  assert.ok([A,B].includes(req.executionId));
  assert.ok(['get_cursor_position','__close_execution'].includes(req.action));
  assert.equal(Object.keys(req).some(k=>/screen|window|click|text|value/i.test(k)),false);
  calls.push(req);
  const next=responses.shift();
  if(next instanceof Error)throw next;
  assert.ok(next);
  return next;
 };
 const ids=[A,B];
 return {calls,run,makeId:()=>ids.shift()};
};
test('busy while first lease held, then success after close is a bounded proof',async()=>{
 const h=mock(['admitted','busy','admitted','admitted','admitted']);
 const x=await inspectOwnLeaseTransition({status,run:h.run,
  makeId:h.makeId,permitted:async()=>true});
 assert.equal(x.state,'own_lease_transition_observed');
 assert.equal(x.ownLeaseTransitionObserved,true);
 assert.equal(x.ownerReleaseVerified,false);
 assert.equal(x.hostCurrentlyIdleVerified,false);
 assert.equal(x.chatDeliveryAuthorized,false);
 assert.deepEqual(h.calls.map(k=>k.action),[
  'get_cursor_position','get_cursor_position','__close_execution',
  'get_cursor_position','__close_execution']);
 assert.deepEqual(h.calls.map(k=>k.executionId),[A,B,A,B,B]);
 assert.doesNotMatch(JSON.stringify(x),/mock-safe-node|11111111|22222222|gen-1/);
});
test('existing busy owner results in a single read and no foreign close',async()=>{
 const h=mock(['busy']);
 const x=await inspectOwnLeaseTransition({status,run:h.run,
  makeId:h.makeId,permitted:async()=>true});
 assert.equal(x.state,'inconclusive');
 assert.equal(x.reason,'preexisting_owner_busy');
 assert.deepEqual(h.calls.map(k=>k.action),['get_cursor_position']);
 assert.equal(x.ownLeaseTransitionObserved,false);
});
test('unexpected parallel admission fails closed, closing each exact own id once',async()=>{
 const h=mock(['admitted','admitted','admitted','admitted']);
 const x=await inspectOwnLeaseTransition({status,run:h.run,
  makeId:h.makeId,permitted:async()=>true});
 assert.equal(x.reason,'parallel_owner_admission');
 assert.equal(x.ownLeaseTransitionObserved,false);
 assert.deepEqual(h.calls.map(k=>k.action),[
  'get_cursor_position','get_cursor_position',
  '__close_execution','__close_execution']);
 assert.deepEqual(h.calls.slice(2).map(k=>k.executionId),[B,A]);
});
test('missing close acknowledgement is never retried or treated as release',async()=>{
 const h=mock(['admitted','busy','inconclusive']);
 const x=await inspectOwnLeaseTransition({status,run:h.run,
  makeId:h.makeId,permitted:async()=>true});
 assert.equal(x.reason,'first_close_unacknowledged');
 assert.equal(x.ownerReleaseVerified,false);
 assert.deepEqual(h.calls.map(k=>k.action),[
  'get_cursor_position','get_cursor_position','__close_execution']);
});
test('thrown native reads still close only their own potentially acquired id',async()=>{
 const h=mock(['admitted',new Error('private native failure'),
  'admitted','admitted']);
 const x=await inspectOwnLeaseTransition({status,run:h.run,
  makeId:h.makeId,permitted:async()=>true});
 assert.equal(x.reason,'probe_error');
 assert.equal(x.ownLeaseTransitionObserved,false);
 assert.deepEqual(h.calls.map(k=>k.action),[
  'get_cursor_position','get_cursor_position',
  '__close_execution','__close_execution']);
 assert.deepEqual(h.calls.slice(2).map(k=>k.executionId),[B,A]);
 assert.doesNotMatch(JSON.stringify(x),/private native failure/);
});
test('unknown status, fake success and BUSY are not mistaken for release',()=>{
 assert.equal(classifyCUAResponse({ok:true}),'admitted');
 assert.equal(classifyCUAResponse({ok:false}),'inconclusive');
 assert.equal(classifyCUAResponse({result:{ok:true}}),'inconclusive');
 assert.equal(classifyCUAResponse({ok:false,error:{code:'COMPUTER_HOST_BUSY'}}),'busy');
 const r=concludeLeaseTransition({firstAdmitted:true,overlapBusy:true,
  firstCloseAcknowledged:true,afterCloseAdmitted:true,
  afterCloseAcknowledged:true,providerGenerationStable:false});
 assert.equal(r.ownLeaseTransitionObserved,false);
 assert.equal(r.ownerReleaseVerified,false);
});
test('probe source permits only cursor read and exact execution closure',()=>{
 const s=readFileSync(new URL(
  '../scripts/openclaw-cua-lease-transition-readonly.mjs',import.meta.url),'utf8');
 assert.match(s,/get_cursor_position/);
 assert.match(s,/scopedCloseRequest\(node,id\)/);
 assert.doesNotMatch(s,/['"](?:set_value|click|type_text|press|screenshot|activate)['"]/);
 assert.doesNotMatch(s,/writeFile|unlink|rmSync|spawn\(/);
 assert.match(s,/hostCurrentlyIdleVerified:false/);
});
