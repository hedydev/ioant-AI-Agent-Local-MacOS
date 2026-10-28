import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessAliceNativeAXSemantics} from
 '../scripts/alice-native-ax-semantic-readiness.mjs';

test('native AX signal distinguishes known prompt/search and associated send hints',()=>{
 const input={ok:true,details:{
  observationId:'private-observation',
  elements:[
   {elementRef:'ref:root',role:'group'},
   {elementRef:'ref:compose-group',role:'group',parentRef:'ref:root'},
   {elementRef:'ref:input-one',role:'AXTextField',label:'Search in workspace',
    parentRef:'ref:root',value:'private search text'},
   {elementRef:'ref:input-two',role:'AXTextArea',placeholder:'Ask anything',
    parentRef:'ref:compose-group',value:'private draft'},
   {elementRef:'ref:send',role:'AXButton',label:'Send message',
    parentRef:'ref:compose-group'}
  ]}};
 const r=assessAliceNativeAXSemantics(input);
 assert.equal(r.nativeEditableCount,2);
 assert.equal(r.nativeButtonsNamedSendCount,1);
 assert.equal(r.uniquePromptHint,true);
 assert.equal(r.candidates[0].searchSemanticSignal,true);
 assert.equal(r.candidates[0].promptSemanticSignal,false);
 assert.equal(r.candidates[1].promptSemanticSignal,true);
 assert.equal(r.candidates[1].relatedSendButtonCount,1);
 assert.equal(r.candidates[1].parentRefProvided,true);
 assert.equal(r.composerIdentityVerified,false);
 assert.equal(r.chatDeliveryAuthorized,false);
 assert.doesNotMatch(JSON.stringify(r),
  /private|ref:root|ref:input|Ask anything|Search in workspace|Send message/);
});
test('common parent alone is insufficient to identify a composer or authorize send',()=>{
 const input={ok:true,observation:{elements:[
  {elementRef:'ref:one',role:'text field',label:'Something else',
   parentRef:'ref:root',value:'private'},
  {elementRef:'ref:button',role:'button',label:'Send message',
   parentRef:'ref:root'}
 ]}};
 const r=assessAliceNativeAXSemantics(input);
 assert.equal(r.nativeEditableCount,1);
 assert.equal(r.candidates[0].relatedSendButtonCount,0);
 assert.equal(r.uniquePromptHint,false);
 assert.equal(r.composerIdentityVerified,false);
});
test('unknown attributes do not leak or grant a send',()=>{
 const privateText='nonauthoritative chat history user content';
 const input={ok:true,details:{observationId:'x',elements:[
  {elementRef:'ref:a',role:'AXTextArea',value:privateText},
  {elementRef:'ref:b',role:'AXButton',label:'Delete conversation'},
  {elementRef:'ref:c',role:'AXTextField',value:'secret token'}
 ]}};
 const r=assessAliceNativeAXSemantics(input);
 assert.equal(r.nativeEditableCount,2);
 assert.equal(r.nativeButtonsNamedSendCount,0);
 assert.equal(r.uniquePromptHint,false);
 assert.equal(r.composerIdentityVerified,false);
 assert.equal(r.rawAXTextReleased,false);
 assert.equal(r.nativeRefsReleased,false);
 assert.doesNotMatch(JSON.stringify(r),/nonauthoritative|secret token|ref:/);
});
test('all semantic readiness outputs are read only without browser or pointer interfaces',()=>{
 const source=readFileSync(new URL('../scripts/alice-native-ax-semantic-readiness.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/['"](?:browser_prepare|get_browser_state|set_value|click|type_text)['"]/);
 assert.match(source,/computerInput:false/);
 assert.match(source,/screenshotTaken:false/);
 assert.match(source,/composerIdentityVerified:false/);
 assert.match(source,/chatDeliveryAuthorized:false/);
});
