import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeComputerProviderStatus as summary,inspectComputerProvider}
 from '../scripts/openclaw-computer-provider-readiness.mjs';
const v2=(provider='cua',patch={})=>({
 contractVersion:2,
 provider:{id:provider,label:'private provider label',generation:'live-generation-id'},
 actions:['get_cursor_position','list_apps','list_windows','set_value'],
 targets:['screen','window','element'],
 deliveryModes:['foreground','background'],
 observations:['image','accessibility'],
 features:{recording:false,agentCursor:true,multiDisplay:false},
 ...patch
});
const node=(extra={})=>({
 nodeId:'private-mac-node-uid',platform:'macOS 27.0.1',connected:true,
 commands:['computer.act','screen.snapshot'],...extra});
test('official v2 CUA descriptor reports support but never execution proof',()=>{
 const result=summary({nodes:[node({computerUse:v2('macos-cua')})]});
 assert.equal(result.provider,'cua');
 assert.equal(result.providerIndependentlyConfirmed,true);
 assert.equal(result.descriptorAvailable,true);
 assert.equal(result.descriptorSchemaValid,true);
 assert.equal(result.descriptorContractVersion,2);
 assert.equal(result.backgroundDeliveryAdvertised,true);
 assert.equal(result.agentCursorAdvertised,true);
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
 assert.equal(result.descriptorSchemaValid,false);
});
test('Peekaboo is not misreported as CUA or guaranteed background-safe',()=>{
 const result=summary({nodes:[node({computerUse:v2('peekaboo',{
  deliveryModes:['foreground'],features:{agentCursor:false}})})]});
 assert.equal(result.provider,'peekaboo');
 assert.equal(result.backgroundDeliveryAdvertised,false);
 assert.equal(result.backgroundExecutionVerified,false);
});
test('only the selected connected macOS node contributes metadata',()=>{
 const result=summary({nodes:[
  {nodeId:'linux',platform:'linux',connected:true,
   computerUse:v2('macos-cua'),commands:['screen.snapshot','computer.act']},
  node({computerUse:v2('macos-peekaboo',{deliveryModes:['foreground']})})
 ]});
 assert.equal(result.provider,'peekaboo');
 assert.equal(result.backgroundDeliveryAdvertised,false);
 assert.equal(JSON.stringify(result).includes('private-mac-node-uid'),false);
});
test('metadata only; no raw windows, apps, device ids, chat URLs',()=>{
 const result=summary({nodes:[node({computerUse:v2('cua'),
  windowTitle:'private Alice chat',appNames:['secret'],
  chatUrl:'https://chatgpt.com/c/private'})]});
 const json=JSON.stringify(result);
 assert.equal(json.includes('private Alice'),false);
 assert.equal(json.includes('chatgpt.com'),false);
 assert.equal(json.includes('secret'),false);
 assert.equal(json.includes('private provider label'),false);
 assert.equal(json.includes('live-generation-id'),false);
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
test('legacy aliases cannot fake a v2 computerUse descriptor',()=>{
 const result=summary({nodes:[node({
  computerProvider:'cua',computer:{provider:'cua',descriptor:{
   provider:'cua',actions:['list_apps'],deliveryModes:['background']}}
 })]});
 assert.equal(result.provider,'unknown');
 assert.equal(result.backgroundDeliveryAdvertised,false);
 assert.equal(result.listAppsAdvertised,null);
});
test('invalid v2 version or generation cannot authorize provider claims',()=>{
 for(const bad of [
  v2('cua',{contractVersion:1}),
  v2('cua',{provider:{id:'cua',generation:''}}),
  v2('cua',{actions:'list_apps'}),
  v2('cua',{deliveryModes:'background'})
 ]){
  const result=summary({nodes:[node({computerUse:bad})]});
  assert.equal(result.provider,'unknown');
  assert.equal(result.listAppsAdvertised,null);
  assert.equal(result.backgroundDeliveryAdvertised,false);
 }
});
test('unrecognized provider IDs are never inferred from substring matches',()=>{
 const result=summary({nodes:[node({computerUse:v2('not-cua-but-close')})]});
 assert.equal(result.provider,'unknown');
 assert.equal(result.providerIndependentlyConfirmed,false);
 assert.equal(result.listAppsAdvertised,true);
});
