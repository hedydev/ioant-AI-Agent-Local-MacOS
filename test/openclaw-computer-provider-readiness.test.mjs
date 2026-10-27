import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeComputerProviderStatus as summary,inspectComputerProvider}
 from '../scripts/openclaw-computer-provider-readiness.mjs';
const node=(extra={})=>({
 nodeId:'private-mac-node-uid',platform:'macOS 27.0.1',connected:true,
 commands:['computer.act','screen.snapshot'],...extra});
test('CUA explicit descriptor yields supported flags but not execution proof',()=>{
 const result=summary({nodes:[node({computer:{provider:'CUA',descriptor:{
  provider:'cua',deliveryModes:['foreground','background'],
  actions:['get_cursor_position','list_apps']}}})]});
 assert.equal(result.provider,'cua');
 assert.equal(result.providerIndependentlyConfirmed,true);
 assert.equal(result.backgroundDeliveryAdvertised,true);
 assert.equal(result.listAppsAdvertised,true);
 assert.equal(result.backgroundExecutionVerified,false);
 assert.equal(result.safeToControlActiveUserDesktop,false);
});
test('unknown provider is never guessed from computer.act advertisement',()=>{
 const result=summary({nodes:[node()]});
 assert.equal(result.provider,'unknown');
 assert.equal(result.computerAdvertised,true);
 assert.equal(result.backgroundDeliveryAdvertised,false);
 assert.equal(result.listAppsAdvertised,null);
});
test('Peekaboo is not misreported as CUA or guaranteed background-safe',()=>{
 const result=summary({nodes:[node({computerProvider:'peekaboo'})]});
 assert.equal(result.provider,'peekaboo');
 assert.equal(result.backgroundExecutionVerified,false);
});
test('only explicitly selected connected macOS node contributes metadata',()=>{
 const result=summary({nodes:[
  {nodeId:'linux',platform:'linux',connected:true,
   computerProvider:'cua',commands:['screen.snapshot','computer.act']},
  node({computerProvider:'peekaboo',computer:{descriptor:{
   deliveryModes:['foreground']}}})
 ]});
 assert.equal(result.provider,'peekaboo');
 assert.equal(result.backgroundDeliveryAdvertised,false);
 assert.equal(JSON.stringify(result).includes('private-mac-node-uid'),false);
});
test('metadata only; no raw windows, apps, device ids, chat URLs',()=>{
 const result=summary({nodes:[node({computerProvider:'cua',
  windowTitle:'private Alice chat',appNames:['secret'],
  chatUrl:'https://chatgpt.com/c/private'})]});
 const json=JSON.stringify(result);
 assert.equal(json.includes('private Alice'),false);
 assert.equal(json.includes('chatgpt.com'),false);
 assert.equal(json.includes('secret'),false);
});
test('status wrapper performs one status invocation and no computer act',async()=>{
 let calls=0;
 const result=await inspectComputerProvider({runtimeAllowed:async()=>true,
  request:async(args)=>{
   calls++;assert.deepEqual(args,['nodes','status','--json']);
   return {nodes:[node()]};
  }});
 assert.equal(calls,1);
 assert.equal(result.state,'observed');
 assert.equal(result.invokedComputerAct,false);
});
test('failed status inspection reports only sanitized error class',async()=>{
 const result=await inspectComputerProvider({runtimeAllowed:async()=>true,
  request:async()=>{throw Error('private Alice window secret')}});
 assert.equal(result.reason,'native_status_unavailable');
 assert.equal(JSON.stringify(result).includes('Alice'),false);
});
test('unapproved runtime path refuses without inspecting nodes',async()=>{
 let calls=0;
 const r=await inspectComputerProvider({runtimeAllowed:async()=>false,
  request:async()=>{calls++;return null}});
 assert.equal(r.state,'blocked');
 assert.equal(calls,0);
});
