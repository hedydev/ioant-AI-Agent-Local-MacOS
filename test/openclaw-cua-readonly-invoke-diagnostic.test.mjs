import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {makeSafeReadArgs,classifyInvokeFailure,
 classifyInvokeResult,inspectCUAInvokeReads}
 from '../scripts/openclaw-cua-readonly-invoke-diagnostic.mjs';
const source=readFileSync(resolve(import.meta.dirname,
 '../scripts/openclaw-cua-readonly-invoke-diagnostic.mjs'),'utf8');
const UUID='d74d37dd-dcc3-42d0-ab46-70a43cad4a7f';
const NODE='paired-node';
const status=()=>({nodes:[{
 nodeId:NODE,platform:'macOS 27.0.1',connected:true,
 commands:['computer.act','screen.snapshot'],
 computerUse:{contractVersion:2,
  provider:{id:'cua-computer',generation:'secret-generation'},
  actions:['get_cursor_position','list_windows'],
  deliveryModes:['foreground','background']}
}]});
test('only get_cursor_position/list_windows can be invoked, without input args',()=>{
 for(const action of ['get_cursor_position','list_windows']){
  const args=makeSafeReadArgs(NODE,UUID,action);
  assert.deepEqual(args.slice(0,6),['nodes','invoke','--node',NODE,
   '--command','computer.act']);
  assert.deepEqual(JSON.parse(args[7]),{action,executionId:UUID});
  assert.equal(args[8],'--json');
 }
 for(const action of ['click','set_value','type','key','scroll','get_browser_state',
  'get_window_state','launch_app','screenshot']){
  assert.throws(()=>makeSafeReadArgs(NODE,UUID,action),/only_readonly/);
 }
 assert.throws(()=>makeSafeReadArgs(NODE,'wrong-id','list_windows'),/only_readonly/);
});
test('structured failure code classifies and never exposes private CLI error',()=>{
 const err={code:1,stdout:JSON.stringify({
  ok:false,error:{message:'COMPUTER_DRIVER_UNAVAILABLE: /Users/ted/private Alice'}
 }),stderr:'private ChatGPT tab text'};
 const r=classifyInvokeFailure(err);
 assert.equal(r.state,'failed');
 assert.equal(r.category,'cua_driver_transport');
 assert.equal(r.nativeCode,'COMPUTER_DRIVER_UNAVAILABLE');
 assert.equal(r.exitCode,1);
 assert.equal(r.structuredErrorBody,true);
 assert.equal(JSON.stringify(r).includes('Alice'),false);
 assert.equal(JSON.stringify(r).includes('ChatGPT tab'),false);
});
test('pairing and node command-policy denials get distinct safe classes',()=>{
 const pairing=classifyInvokeFailure({code:1,stderr:
  'node command surface approval required; not approved'});
 assert.equal(pairing.category,'pending_node_approval');
 const denied=classifyInvokeFailure({code:1,stderr:
  'command denied by policy: computer.act'});
 assert.equal(denied.category,'gateway_command_policy');
});
test('unsupported CLI syntax is not confused with CUA driver failure',()=>{
 const r=classifyInvokeFailure({code:1,stderr:
  'error: unknown option --command\n/Users/private/files'});
 assert.equal(r.category,'unsupported_cli_command');
 assert.equal(JSON.stringify(r).includes('private'),false);
});
test('zero-exit native receipt must prove effect, not transport-only ack',()=>{
 assert.equal(classifyInvokeResult({result:{ok:true}}).state,'inconclusive');
 assert.equal(classifyInvokeResult({result:{ok:true,details:{cursorX:1,cursorY:2}}}).state,'observed');
 assert.equal(classifyInvokeResult({result:{ok:false,
  details:{privateApp:'secret'}}}).state,'refused');
 assert.equal(classifyInvokeResult(null).state,'inconclusive');
});
test('unknown nonzero failure remains inconclusive class with only safe metadata',()=>{
 const r=classifyInvokeFailure({code:1,stderr:'/private/a fake secret',
  stdout:'no structured error'});
 assert.equal(r.category,'unclassified');
 assert.equal(r.stdoutPresent,true);
 assert.equal(r.stderrPresent,true);
 assert.match(r.diagnosticDigest,/^[0-9a-f]{12}$/);
 assert.equal(JSON.stringify(r).includes('fake secret'),false);
});
test('single selected node and same UUID, no native input or window data leak',async()=>{
 const calls=[];
 const run=async args=>{
  calls.push(args);
  if(args[1]==='status')return status();
  const p=JSON.parse(args[7]);
  if(p.action==='get_cursor_position')
   return {result:{ok:true,details:{x:11,y:14}}};
  if(p.action==='list_windows')
   throw Object.assign(Error('private AliceAI window'),{
    code:1,stderr:'COMPUTER_DRIVER_UNAVAILABLE path /Users/secret'});
  throw Error('illegal action');
 };
 const r=await inspectCUAInvokeReads({
  allowedRuntime:async()=>true,uuid:()=>UUID,call:run
 });
 assert.equal(calls.length,3);
 assert.equal(r.state,'observed');
 assert.equal(r.cursorRead.state,'observed');
 assert.equal(r.windowListRead.state,'failed');
 assert.equal(r.windowListRead.category,'cua_driver_transport');
 assert.equal(JSON.parse(calls[1][7]).executionId,
   JSON.parse(calls[2][7]).executionId);
 assert.equal(r.nativeInputAttempted,false);
 assert.equal(r.appsOrWindowsReturned,false);
 assert.equal(JSON.stringify(r).includes('AliceAI'),false);
 assert.equal(JSON.stringify(r).includes('secret'),false);
});
test('native permission denial skips second read and never bypasses',async()=>{
 let calls=0;
 const run=async args=>{
  calls++;
  if(args[1]==='status')return status();
  throw Object.assign(Error('approval denied'),{code:1,
   stderr:'node command surface approval required; not approved'});
 };
 const r=await inspectCUAInvokeReads({
  allowedRuntime:async()=>true,uuid:()=>UUID,call:run});
 assert.equal(calls,2);
 assert.equal(r.cursorRead.category,'pending_node_approval');
 assert.equal(r.windowListRead.state,'skipped');
});
test('provider missing action fails preflight before any native invocation',async()=>{
 let calls=0;
 const run=async args=>{
  calls++;
  const doc=status();
  doc.nodes[0].computerUse.actions=['get_cursor_position'];
  return doc;
 };
 const r=await inspectCUAInvokeReads({
  allowedRuntime:async()=>true,uuid:()=>UUID,call:run});
 assert.equal(calls,1);
 assert.equal(r.state,'blocked');
 assert.equal(r.nativeInputAttempted,undefined);
});
test('private runtime check blocks without any CLI calls',async()=>{
 let calls=0;
 const r=await inspectCUAInvokeReads({
  allowedRuntime:async()=>false,
  call:async()=>{calls++;return status()}
 });
 assert.equal(r.state,'blocked');
 assert.equal(calls,0);
});
test('native refusal with CLI 0 does not count as successful read',async()=>{
 const r=await inspectCUAInvokeReads({
  allowedRuntime:async()=>true,uuid:()=>UUID,
  call:async args=>args[1]==='status'?status():
   {result:{ok:false,details:{message:'untrusted content'}}}
 });
 assert.equal(r.cursorRead.state,'refused');
 assert.equal(r.windowListRead.state,'refused');
});
test('script does not launch GUI, browser, screenshot or keyboard actions',()=>{
 assert.doesNotMatch(source,/--browser-profile|osascript|CGEventPost|launch\(/);
 assert.match(source,/screenshotTaken:false/);
 assert.match(source,/invokedComputerInput:false/);
 assert.match(source,/appsOrWindowsReturned:false/);
 assert.match(source,/changedFocus:false/);
});
