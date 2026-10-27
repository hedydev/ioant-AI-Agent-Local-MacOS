import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {summarizeCUANativeStatus as summary,summarizeDriverProcess,
 inspectMacCUARuntime} from '../scripts/openclaw-cua-native-runtime-readiness.mjs';
const code=readFileSync(resolve(import.meta.dirname,
 '../scripts/openclaw-cua-native-runtime-readiness.mjs'),'utf8');
const status=(patch={})=>({nodes:[{
 nodeId:'private-node-id',platform:'macOS 27.0.1',connected:true,
 commands:['screen.snapshot','computer.act'],
 computerUse:{contractVersion:2,
  provider:{id:'cua-computer',generation:'private-generation'},
  actions:['list_windows','get_window_state','get_cursor_position','set_value'],
  deliveryModes:['foreground','background'],
  ...patch}
}]});
test('selected native CUA v2 descriptor advertises read actions but not proof',()=>{
 const r=summary(status());
 assert.equal(r.cuaDescriptorValid,true);
 assert.equal(r.actionsAdvertised.listWindows,true);
 assert.equal(r.actionsAdvertised.getWindowState,true);
 assert.equal(r.actionsAdvertised.setValue,true);
 assert.equal(r.backgroundDeliveryAdvertised,true);
 assert.equal(r.safeForBackgroundInput,false);
 assert.equal(r.pairedCommandApprovalProven,false);
 assert.equal(r.accessibilityGrantIndependentlyVerified,false);
 assert.equal(r.cuaDriverEndpointVerified,false);
 assert.equal(JSON.stringify(r).includes('private-node-id'),false);
 assert.equal(JSON.stringify(r).includes('private-generation'),false);
});
test('missing action cannot be upgraded from provider family alone',()=>{
 const r=summary(status({actions:['get_cursor_position'],
  deliveryModes:['foreground']}));
 assert.equal(r.actionsAdvertised.listWindows,false);
 assert.equal(r.backgroundDeliveryAdvertised,false);
 assert.equal(r.safeForBackgroundInput,false);
});
test('Peekaboo or malformed native provider fails closed',()=>{
 for(const id of ['peekaboo','not-cua-but-close','']){
  const r=summary(status({provider:{id,generation:'private'}}));
  assert.equal(r.cuaDescriptorValid,false);
  assert.equal(r.actionsAdvertised.listWindows,false);
  assert.equal(r.safeForBackgroundInput,false);
 }
});
test('driver process check reports presence without PID or command-line',()=>{
 const r=summarizeDriverProcess({stdout:'3152\n89234\n'});
 assert.deepEqual(r,{state:'observed',processObserved:true,
  driverUnavailableProven:false});
 assert.equal(JSON.stringify(r).includes('3152'),false);
});
test('no process observed is not proof of permanent driver failure',()=>{
 const r=summarizeDriverProcess({error:{code:1,stderr:'private system info'}});
 assert.deepEqual(r,{state:'not_observed',processObserved:false,
  driverUnavailableProven:false});
 const unknown=summarizeDriverProcess({error:{code:'EPERM',stderr:'secret'}});
 assert.equal(unknown.state,'inconclusive');
 assert.equal(JSON.stringify(unknown).includes('secret'),false);
});
test('one status call and one fixed process predicate; no computer act',async()=>{
 let n=0,p=0;
 const r=await inspectMacCUARuntime({
  runtimeAllowed:async()=>true,
  status:async()=>{n++;return status();},
  driver:async()=>{p++;return {state:'observed',processObserved:true};}
 });
 assert.equal(r.state,'observed');
 assert.equal(n,1);
 assert.equal(p,1);
 assert.equal(r.driverProcessObserved,true);
 assert.equal(r.invokedComputerAct,false);
 assert.equal(r.performedPointerOrKeyboardInput,false);
 assert.equal(r.screenCapture,false);
});
test('private runtime rejection performs no node or process inspection',async()=>{
 let calls=0;
 const r=await inspectMacCUARuntime({
  runtimeAllowed:async()=>false,
  status:async()=>{calls++;return status()},
  driver:async()=>{calls++;return {}}
 });
 assert.equal(r.state,'blocked');assert.equal(calls,0);
});
test('status failure does not cause fallbacks or raw error disclosure',async()=>{
 let called=0;
 const r=await inspectMacCUARuntime({
  runtimeAllowed:async()=>true,
  status:async()=>{throw Error('secret app/window names')},
  driver:async()=>{called++;return {}}
 });
 assert.equal(r.state,'inconclusive');
 assert.equal(r.reason,'native_status_unavailable');
 assert.equal(called,0);
 assert.equal(JSON.stringify(r).includes('secret'),false);
});
test('script contains no GUI launch, action invoke or browser route',()=>{
 assert.match(code,/\/usr\/bin\/pgrep/);
 assert.match(code,/\['-x','cua-driver'\]/);
 assert.doesNotMatch(code,/nodes','invoke|launch_app|screen\.snapshot'\s*,|--browser-profile|osascript|CGEventPost/);
 assert.match(code,/invokedComputerAct:false/);
 assert.match(code,/safeForBackgroundInput:false/);
});
