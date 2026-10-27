import test from 'node:test';
import assert from 'node:assert/strict';
import {makeInventoryArgs,inspectNativeAppInventory}
 from '../scripts/openclaw-native-app-inventory-readonly.mjs';

const id='d74d37dd-dcc3-42d0-ab46-70a43cad4a7f';
test('app-inventory action is exactly native list_apps, not browser automation',()=>{
 const args=makeInventoryArgs('node-id',id);
 assert.deepEqual(args.slice(0,6),[
  'nodes','invoke','--node','node-id','--command','computer.act']);
 assert.deepEqual(JSON.parse(args[7]),{action:'list_apps',executionId:id});
 assert.equal(args[8],'--json');
 assert.equal(args.includes('browser'),false);
});
test('invalid Node identity and execution UUID never form a request',()=>{
 assert.throws(()=>makeInventoryArgs('',id),/invalid_identity/);
 assert.throws(()=>makeInventoryArgs('mac','not-a-uuid'),/invalid_identity/);
});
test('native success is reported without app identities or browser contents',async()=>{
 const target={result:{nodes:[{nodeId:'test-node',platform:'macOS 27.0.1',
  connected:true,commands:['screen.snapshot','computer.act']}]}};
 const calls=[];
 const request=async(args)=>{
  calls.push(args);
  if(args[0]==='nodes'&&args[1]==='status')return target;
  return {result:{ok:true,details:{apps:[
   {name:'Sensitive Chat Window',title:'private token should never print'}
  ]}}};
 };
 const result=await inspectNativeAppInventory({request,uuid:()=>id,runtimeAllowed:async()=>true});
 assert.equal(result.state,'observed');
 assert.equal(result.invokedComputerAct,true);
 assert.equal(result.browserTabsQueried,false);
 assert.equal(result.rawAppNamesReturned,false);
 assert.equal(JSON.stringify(result).includes('Sensitive Chat'),false);
 assert.equal(JSON.stringify(result).includes('private token'),false);
 assert.equal(calls.length,3);
 assert.equal(JSON.parse(calls[2][7]).action,'__close_execution');
 assert.equal(JSON.parse(calls[2][7]).executionId,id);
 assert.equal(result.ownExecutionClosure.attempted,true);
 assert.equal(result.ownExecutionClosure.ownerReleaseVerified,false);
});
test('native unavailable result is inconclusive and never marks observed',async()=>{
 const request=async(args)=>{
  if(args[1]==='status')return {nodes:[{nodeId:'n',platform:'macOS 27',
    connected:true,commands:['screen.snapshot','computer.act']}]};
  throw Error('private failure detail');
 };
 const result=await inspectNativeAppInventory({request,uuid:()=>id,runtimeAllowed:async()=>true});
 assert.equal(result.state,'inconclusive');
 assert.equal(JSON.stringify(result).includes('private failure'),false);
});
test('node capability missing blocks without invoking the action',async()=>{
 let count=0;
 const request=async()=>{count++;return {nodes:[{nodeId:'n',platform:'macOS 27',
  connected:true,commands:['screen.snapshot']}]}};
 const result=await inspectNativeAppInventory({request,uuid:()=>id,runtimeAllowed:async()=>true});
 assert.equal(result.state,'blocked');
 assert.equal(count,1);
});

test('legacy list_apps rejects busy owner without speculative close',async()=>{
 const target={nodes:[{nodeId:'n',platform:'macOS 27',connected:true,
  commands:['screen.snapshot','computer.act']}]};
 const calls=[];
 const r=await inspectNativeAppInventory({uuid:()=>id,
  runtimeAllowed:async()=>true,
  request:async args=>{
   calls.push(args);
   if(args[1]==='status')return target;
   throw Object.assign(Error('private owner details'),{code:1,
    stdout:JSON.stringify({error:{message:
     'COMPUTER_HOST_BUSY: another provider execution owns this computer'}})});
  }});
 assert.equal(calls.length,2);
 assert.equal(r.errorClass,'computer_execution_occupied');
 assert.equal(r.ownExecutionClosure.attempted,false);
 assert.equal(r.existingOwnerReleased,false);
});
