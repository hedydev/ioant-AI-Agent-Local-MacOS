import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessAliceNativeAXSemantics,assessUniqueNativeComposerControls} from
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

test('exact composer identifier is distinguished from generic prompt text, without authorizing input',()=>{
 const raw={ok:true,details:{elements:[
  {elementRef:'ref:search',role:'AXTextField',label:'Search conversation'},
  {elementRef:'ref:compose',role:'AXTextArea',identifier:'prompt-textarea',
   value:'confidential draft text',bounds:{x:120,y:600,width:620,height:50}},
  {elementRef:'ref:icon',role:'AXButton',identifier:'composer-submit-button',
   bounds:{x:710,y:612,width:30,height:30}}
 ]}};
 const r=assessAliceNativeAXSemantics(raw);
 assert.equal(r.uniquePromptHint,true);
 assert.equal(r.candidates[1].exactComposerIdentifierHint,true);
 assert.deepEqual(r.candidates[1].promptSignalSources,['identifier']);
 assert.equal(r.nativeButtonsNamedSendCount,0);
 assert.equal(r.nativeButtonsBroaderSendHintCount,1);
 assert.equal(r.nativeButtonsWithGeometryCount,1);
 assert.equal(r.candidates[1].nearbyNativeButtonsWithBounds,1);
 assert.equal(r.composerIdentityVerified,false);
 assert.equal(r.chatDeliveryAuthorized,false);
 assert.doesNotMatch(JSON.stringify(r),
  /prompt-textarea|ref:compose|ref:icon|confidential draft text|620|710/);
});
test('unnamed icon buttons are reported only as counts, never assumed to send',()=>{
 const raw={ok:true,result:{data:{elements:[
  {elementRef:'opaque-editor',role:'text area',placeholder:'Ask anything'},
  {elementRef:'opaque-icon',role:'button',
   bounds:{x:10,y:20,width:20,height:20}},
  {elementRef:'opaque-other',role:'button',label:'Attach file'}
 ]}}};
 const r=assessAliceNativeAXSemantics(raw);
 assert.equal(r.nativeButtonCount,2);
 assert.equal(r.nativeButtonsWithoutTextMetadataCount,1);
 assert.equal(r.nativeButtonsBroaderSendHintCount,0);
 assert.equal(r.candidates[0].nearbyNativeButtonsWithBounds,0);
 assert.equal(r.composerIdentityVerified,false);
 assert.equal(r.chatDeliveryAuthorized,false);
});
test('no prompt identifier and coarse button proximity cannot grant composer identity',()=>{
 const raw={ok:true,elements:[
  {elementRef:'opaque-editor',role:'text field',label:'Write a message',
   bounds:{x:0,y:0,width:300,height:50}},
  {elementRef:'opaque-button',role:'AXButton',identifier:'send',
   bounds:{x:250,y:20,width:32,height:32}}
 ]};
 const r=assessAliceNativeAXSemantics(raw);
 assert.equal(r.uniquePromptHint,true);
 assert.equal(r.candidates[0].exactComposerIdentifierHint,false);
 assert.equal(r.nativeButtonsBroaderSendHintCount,1);
 assert.equal(r.candidates[0].nearbyNativeButtonsWithBounds,1);
 assert.equal(r.composerIdentityVerified,false);
});

test('one generic-labelled editor with one anonymous nearby icon is classified without assuming Send',()=>{
 const data={ok:true,result:{details:{elements:[
  {elementRef:'ref:search',role:'text field',label:'Search',
   bounds:{x:100,y:50,width:300,height:35}},
  {elementRef:'ref:composer',role:'text area',label:'Ask anything',value:'',
   bounds:{x:120,y:500,width:400,height:100}},
  {elementRef:'ref:icon',role:'button',
   bounds:{x:495,y:550,width:32,height:32},actions:['AXPress']},
  {elementRef:'ref:other',role:'button',label:'Delete conversation',
   bounds:{x:300,y:40,width:40,height:30}}
 ]}}};
 const r=assessUniqueNativeComposerControls(data);
 assert.equal(r.evidenceState,'unique_prompt_hint_with_nearby_controls');
 assert.equal(r.editorRoleKind,'text_area');
 assert.equal(r.editorValueState,'empty');
 assert.equal(r.controlCount,1);
 assert.equal(r.controls[0].hasAccessibleName,false);
 assert.equal(r.controls[0].actionMetadataProvided,true);
 assert.equal(r.controls[0].pressActionHint,true);
 assert.equal(r.controls[0].sendSemanticHint,false);
 assert.equal(r.controls[0].positionClass,'lower_trailing');
 assert.equal(r.uniqueNativeControlIdentified,false);
 assert.equal(r.chatDeliveryAuthorized,false);
 assert.doesNotMatch(JSON.stringify(r),
  /ref:search|ref:composer|ref:icon|Ask anything|Delete conversation|495|550/);
});
test('pre-existing draft never supplies a false empty-composer signal',()=>{
 const r=assessUniqueNativeComposerControls({elements:[
  {elementRef:'ref:composer',role:'AXTextArea',label:'Ask anything',
   value:'Existing private draft'},
  {elementRef:'ref:unknown',role:'button',label:'Talk',
   bounds:{x:200,y:300,width:20,height:20}}
 ]});
 assert.equal(r.editorValueState,'nonempty');
 assert.equal(r.controlCount,0);
 assert.equal(r.chatDeliveryAuthorized,false);
 assert.doesNotMatch(JSON.stringify(r),/Existing private draft|ref:/);
});
test('ambiguous and missing prompts fail closed without selecting an editable',()=>{
 const make=labels=>({elements:labels.map((label,i)=>({
  elementRef:'ref:'+i,role:'text area',label}))});
 for(const labels of [['Nothing'],['Ask anything','Message ChatGPT']]){
  const r=assessUniqueNativeComposerControls(make(labels));
  assert.equal(r.evidenceState,'no_unique_semantic_composer');
  assert.equal(r.controlCount,0);
  assert.equal(r.uniqueNativeControlIdentified,false);
  assert.equal(r.composerIdentityVerified,false);
 }
});
test('absence of native action metadata and value is explicitly unknown, never an inferred button action',()=>{
 const r=assessUniqueNativeComposerControls({elements:[
  {elementRef:'ref:composer',role:'AXTextArea',placeholder:'Ask anything',
   bounds:{x:0,y:0,width:400,height:50}},
  {elementRef:'ref:button',role:'AXButton',label:'Talk',
   bounds:{x:300,y:0,width:20,height:30}}
 ]});
 assert.equal(r.editorValueState,'unknown');
 assert.equal(r.controls[0].pressActionHint,false);
 assert.equal(r.controls[0].actionMetadataProvided,false);
 assert.equal(r.controls[0].sendSemanticHint,false);
 assert.equal(r.chatDeliveryAuthorized,false);
});
