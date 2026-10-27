import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyNativeFailure,inspectNativeAppInventory}
 from '../scripts/openclaw-native-app-inventory-readonly.mjs';

const node={nodes:[{nodeId:'connected-mac',platform:'macOS 27.0.1',
 connected:true,commands:['screen.snapshot','computer.act']}]};
const uuid='d74d37dd-dcc3-42d0-ab46-70a43cad4a7f';

test('structured CLI stdout exposes only allowlisted unsupported-action code',()=>{
 const error={code:1,stdout:JSON.stringify({ok:false,error:{
  type:'cli_error',message:'COMPUTER_UNSUPPORTED_ACTION: private/local/path and alice chat'
 }}),stderr:'My private window: AI-MC-Alice'};
 const r=classifyNativeFailure(error);
 assert.deepEqual(r,{errorClass:'unsupported_action',
  nativeCode:'COMPUTER_UNSUPPORTED_ACTION',cliExitCode:1});
 assert.equal(JSON.stringify(r).includes('Alice'),false);
 assert.equal(JSON.stringify(r).includes('path'),false);
});
test('node permission errors and driver failures classify without details',()=>{
 for(const [src,expected] of [
  ['ACCESSIBILITY_REQUIRED: private target','accessibility_missing'],
  ['COMPUTER_DRIVER_UNAVAILABLE: native path','driver_unavailable'],
  ['not authorized for operation','permission_or_policy_denied'],
  ['node invoke timeout after 10 s','timeout'],
  ['invalid params: expected schema','invalid_parameters']
 ]){
  assert.equal(classifyNativeFailure({stderr:src}).errorClass,expected);
  assert.equal(JSON.stringify(classifyNativeFailure({stderr:src})).includes('private'),false);
 }
});
test('unknown CLI error remains unclassified and redacted',()=>{
 const r=classifyNativeFailure({stdout:'{"error":{"message":"private secret"}}',
  stderr:'PRIVATE_TOKEN_WILL_NOT_PRINT',code:1});
 assert.equal(r.errorClass,'unclassified');
 assert.equal(JSON.stringify(r).includes('PRIVATE_TOKEN'),false);
 assert.equal(JSON.stringify(r).includes('secret'),false);
});
test('failed native call is recorded as invoked, without exposing apps',async()=>{
 let calls=0;
 const request=async(args)=>{
  calls++;
  if(args[1]==='status')return node;
  throw Object.assign(Error('unsafe details'),{
   code:1,stdout:'{"ok":false,"error":{"message":"COMPUTER_UNSUPPORTED_ACTION"}}'
  });
 };
 const r=await inspectNativeAppInventory({request,uuid:()=>uuid,
  runtimeAllowed:async()=>true});
 assert.equal(calls,2);
 assert.equal(r.state,'inconclusive');
 assert.equal(r.invokedComputerAct,true);
 assert.equal(r.errorClass,'unsupported_action');
 assert.equal(r.nativeCode,'COMPUTER_UNSUPPORTED_ACTION');
 assert.equal(r.changedDesktop,false);
 assert.equal(r.changedBrowser,false);
 assert.equal(JSON.stringify(r).includes('unsafe'),false);
});
test('successful native result classification remains unchanged',async()=>{
 const request=async(args)=>args[1]==='status'?node:
  {result:{ok:true,details:{apps:[{name:'private app'}]}}};
 const r=await inspectNativeAppInventory({request,uuid:()=>uuid,
  runtimeAllowed:async()=>true});
 assert.equal(r.state,'observed');
 assert.equal(r.invokedComputerAct,true);
 assert.equal(JSON.stringify(r).includes('private app'),false);
});

test('COMPUTER_HOST_BUSY is recognized without reporting owner identity',()=>{
 const error={code:1,stdout:JSON.stringify({ok:false,error:{
  message:'COMPUTER_HOST_BUSY: another provider execution owns this computer /Users/private'
 }})};
 const r=classifyNativeFailure(error);
 assert.equal(r.errorClass,'computer_execution_occupied');
 assert.equal(r.nativeCode,'COMPUTER_HOST_BUSY');
 assert.equal(JSON.stringify(r).includes('/Users/private'),false);
});
