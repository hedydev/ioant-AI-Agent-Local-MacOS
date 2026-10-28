import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeNativeWindowOnly} from
 '../scripts/alice-native-computer-window-readonly.mjs';

test('native Computer window observation is distinct from browser DOM authority',()=>{
 const sample={ok:true,details:{observationId:'cua:v2:observation:one',
  windows:[{value:'Sensitive private chat conversation',
   title:'Private AliceAI browser title'}]}};
 const result=summarizeNativeWindowOnly(sample,false);
 assert.deepEqual(result,{
  state:'native_window_observed',
  reason:'containing_window_only_target_tab_inactive',
  aliceTabActive:false,windowObservationVerified:true,
  alicePageVerified:false,chatDeliveryAuthorized:false
 });
 assert.doesNotMatch(JSON.stringify(result),/Sensitive|private chat|title|observation:one/);
});
test('active target tab does not automatically grant chat approval or delivery',()=>{
 const result=summarizeNativeWindowOnly({ok:true,
  content:[{text:JSON.stringify({details:{observationId:'cua:v2:observation:one',
   elementRef:'opaque'}})}]},true);
 assert.equal(result.state,'native_window_observed');
 assert.equal(result.aliceTabActive,true);
 assert.equal(result.alicePageVerified,false);
 assert.equal(result.chatDeliveryAuthorized,false);
});
test('missing/ambiguous observations and native refusal never claim window access',()=>{
 for(const raw of [
  {ok:false,details:{observationId:'cua:v2:observation:one'}},
  {ok:true,details:{message:'no observed window'}},
  {ok:true,details:{observations:[
   {observationId:'cua:v2:observation:one'},
   {observationId:'cua:v2:observation:two'}]}}
 ]){
  const value=summarizeNativeWindowOnly(raw,false);
  assert.equal(value.state,'inconclusive');
  assert.equal(value.windowObservationVerified,false);
  assert.equal(value.chatDeliveryAuthorized,false);
 }
});
test('native Alice observer forbids Chrome Relay, screenshot, switch, typed input',()=>{
 const source=readFileSync(new URL('../scripts/alice-native-computer-window-readonly.mjs',
  import.meta.url),'utf8');
 assert.match(source,/makeReadOnlyNativeArgs\(node,id,'get_window_state'/);
 assert.match(source,/selectNativeWindow\(listed,target.title\)/);
 assert.match(source,/scopedCloseRequest\(node,id\)/);
 assert.doesNotMatch(source,/native\('get_browser_state'|browser\.act|browser_prepare|set active tab|activate application|computer\.type\(/);
 assert.match(source,/browserDomRead:false/);
 assert.match(source,/screenshotTaken:false/);
 assert.match(source,/computerInput:false/);
});
