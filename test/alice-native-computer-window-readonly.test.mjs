import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeNativeWindowOnly,summarizeNativeAXElements} from
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
  accessibleElementCount:0,editableElementCount:0,
  possibleComposerLabelHints:0,buttonElementCount:0,
  composerIdentityVerified:false,
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

test('native accessibility reports only structural element counts, never labels or values',()=>{
 const secret='Secret AliceAI message to teammate';
 const doc={ok:true,observation:{observationId:'cua:v2:observation:one',
  elements:[
   {elementRef:'cua:v2:element:input',role:'text area',
    label:'Ask anything',value:secret},
   {elementRef:'cua:v2:element:button',role:'button',label:'Private chat'},
   {elementRef:'cua:v2:element:search',role:'search field',
    label:'Search personal files'},
   {elementRef:'cua:v2:element:input',role:'text area',value:secret}
  ]}};
 const result=summarizeNativeAXElements(doc);
 assert.deepEqual(result,{accessibleElementCount:3,editableElementCount:2,
  possibleComposerLabelHints:1,buttonElementCount:1,
  composerIdentityVerified:false});
 assert.doesNotMatch(JSON.stringify(result),/Secret|AliceAI message|Private chat|Search personal|cua:v2:element/);
 const observed=summarizeNativeWindowOnly(doc,true);
 assert.equal(observed.state,'native_window_observed');
 assert.equal(observed.possibleComposerLabelHints,1);
 assert.equal(observed.alicePageVerified,false);
 assert.equal(observed.chatDeliveryAuthorized,false);
});
test('no known composer label is not permission to guess a text field',()=>{
 const result=summarizeNativeAXElements({ok:true,details:{
  observationId:'obs:id:one',elements:[
   {elementRef:'element:one',role:'text field',label:'Address and search bar'},
   {elementRef:'element:two',role:'AXTextArea',label:'Unknown target'},
   {elementRef:'element:three',role:'button',value:'Send'}]}}); 
 assert.equal(result.editableElementCount,2);
 assert.equal(result.possibleComposerLabelHints,0);
 assert.equal(result.composerIdentityVerified,false);
});
test('UI attestation is rechecked after native state observation',()=>{
 const source=readFileSync(new URL('../scripts/alice-native-computer-window-readonly.mjs',
  import.meta.url),'utf8');
 assert.match(source,/phase='post_observation_os_attestation'/);
 assert.match(source,/after\.title!==target\.title/);
 assert.match(source,/after\.targetActive!==target\.targetActive/);
 assert.match(source,/return \{\.\.\.result,state:'inconclusive',reason:'active_tab_identity_changed'\}/);
 assert.doesNotMatch(source,/get_browser_state|browser_prepare|bring_to_front/);
});
