// Read-only, privacy-bounded semantic evidence about the ONE native Alice
// Chrome window observation. NO browser DOM/Relay, messages, coordinates,
// raw labels, values, window refs or element refs can leave this module.
import {walkNativePayload} from './openclaw-cua-fixture-native-observe.mjs';

const editable=new Set(['textarea','textfield','textbox','textentryarea',
 'edittext','axtextarea','axtextfield','textinput','searchfield','searchbox']);
const button=new Set(['button','axbutton']);
const role=s=>typeof s==='string'?s.toLowerCase().replace(/[^a-z0-9]/g,''):'';
const text=v=>typeof v==='string'&&v.length<=256?v.trim():'';
const attrs=x=>[x?.label,x?.accessibilityLabel,x?.placeholder,
 x?.placeholderValue,x?.description,x?.identifier,x?.accessibilityIdentifier,
 x?.name].map(text).filter(Boolean);
const editPrompt=/\b(?:ask anything|ask chatgpt|message chatgpt|send a message|write a message|enter a prompt|chat composer|prompt textarea|prompt-textarea)\b|(?:询问|提问|输入消息|发送消息|聊天输入|向\s*ChatGPT\s*发送)/i;
const sendControl=/^(?:send|send message|send prompt|发送|发送消息|发送信息|发送提问)$/i;
const searchControl=/\b(?:search|find|address|url|omnibox)\b|(?:搜索|查找|地址栏)/i;
const validRef=v=>typeof v==='string'&&v.length>=3&&v.length<=1024;
const semanticFields=['label','accessibilityLabel','placeholder',
 'placeholderValue','description','identifier','accessibilityIdentifier','name'];
// The exact field *name* is safe to reveal. Never reveal a raw attribute.
function promptSignalSources(x){
 return semanticFields.filter(k=>editPrompt.test(text(x?.[k])));
}
function strongComposerIdentifier(x){
 const a=[x?.identifier,x?.accessibilityIdentifier].map(text);
 return a.some(v=>/^(?:prompt-textarea|chat-prompt-textarea)$/i.test(v));
}
const sendLike=/^(?:send|send message|send prompt|submit|submit message|submit prompt|发送|发送消息|发送信息|发送提问)$/i;
const idSendLike=/(?:^|[-_])(send|submit)(?:[-_]|$)/i;
function hintSendButton(x){
 const direct=[x.label,x.accessibilityLabel,x.description,x.name,
  x.title,x.help,x.tooltip].map(text);
 const ident=[x.identifier,x.accessibilityIdentifier].map(text);
 return direct.some(v=>sendLike.test(v))||ident.some(v=>idSendLike.test(v));
}
function readBounds(x){
 const b=[x.bounds,x.frame,x.rect,x.boundingBox]
  .find(v=>v&&typeof v==='object'&&!Array.isArray(v));
 if(!b)return null;
 const px=b.x??b.left??b.origin?.x,py=b.y??b.top??b.origin?.y;
 const width=b.width??b.size?.width,height=b.height??b.size?.height;
 if(![px,py,width,height].every(Number.isFinite)||width<0||height<0)return null;
 return {x:px,y:py,w:width,h:height};
}
function buttonNearEditor(button,editor){
 const b=readBounds(button),e=readBounds(editor);
 if(!b||!e)return false;
 const cx=b.x+b.w/2,cy=b.y+b.h/2;
 return cx>=e.x-64&&cx<=e.x+e.w+64&&
  cy>=e.y-96&&cy<=e.y+e.h+96;
}

// Accessibly named buttons can be absent while a chat composer is empty.
// Inspect only one uniquely prompt-labelled editor and nearby button
// metadata. Neither proximity nor an AX press action proves a SEND control.
function tri(x){return x===true?'yes':x===false?'no':'unknown'}
function privateEditorValueClass(x){
 const v=x?.value??x?.stringValue;
 if(typeof v!=='string')return 'unknown';
 return v.trim()===''?'empty':'nonempty';
}
// AX may mirror a placeholder/label into `value`. Equality does NOT prove
// an empty editable, so the compositor always remains write-protected.
// Only fixed boolean metadata leaves the private native observation.
function privateEditorValueOriginEvidence(x){
 const v=typeof x?.value==='string'?x.value:
  typeof x?.stringValue==='string'?x.stringValue:null;
 const hasNativeValue=typeof x?.value==='string';
 const hasStringValue=typeof x?.stringValue==='string';
 const valid=typeof v==='string';
 const nonempty=valid&&v.trim().length>0;
 const norm=z=>typeof z==='string'?z.normalize('NFKC').trim():null;
 const value=norm(v);
 const matches=z=>nonempty&&typeof z==='string'&&
  norm(z)!==''&&value===norm(z);
 const matchesLabel=matches(x?.label)||matches(x?.accessibilityLabel);
 const matchesPlaceholder=matches(x?.placeholder)||
  matches(x?.placeholderValue);
 const conflictingValueFields=hasNativeValue&&hasStringValue&&
  norm(x.value)!==norm(x.stringValue);
 return Object.freeze({
  nativeValueFieldPresent:hasNativeValue,
  stringValueFieldPresent:hasStringValue,
  valueClass:!valid?'unknown':nonempty?'nonempty':'empty',
  matchesEditorLabel:matchesLabel,
  matchesPlaceholderText:matchesPlaceholder,
  valueFieldConflict:conflictingValueFields,
  nonemptyDistinctFromKnownPromptText:nonempty&&
   !matchesLabel&&!matchesPlaceholder&&!conflictingValueFields,
  // Even an identical placeholder may be a real user draft: NO mutation.
  safeToOverwrite:false,
  editorIdentityVerified:false
 });
}
function nativePressEvidence(x){
 const fields=[x?.actions,x?.supportedActions,x?.accessibilityActions,
  x?.actionNames];
 const words=fields.flatMap(v=>Array.isArray(v)?v:
  typeof v==='string'?[v]:[]);
 return {actionsProvided:fields.some(v=>Array.isArray(v)||typeof v==='string'),
  pressActionHint:words.some(v=>typeof v==='string'&&
   /^(?:AXPress|press|activate|performPress)$/i.test(v.trim()))};
}
function buttonPositionClass(x,editor){
 const b=readBounds(x),e=readBounds(editor);
 if(!b||!e)return 'unknown';
 const centerX=b.x+b.w/2,centerY=b.y+b.h/2;
 const side=centerX<e.x+e.w/3?'leading':
  centerX>e.x+e.w*2/3?'trailing':'middle';
 const level=centerY<e.y+e.h/2?'upper':'lower';
 return level+'_'+side;
}
export function assessUniqueNativeComposerControls(raw){
 const byRef=new Map();
 for(const e of walkNativePayload(raw)){
  if(!e||typeof e!=='object'||Array.isArray(e)||
   !validRef(e.elementRef)||!role(e.role))continue;
  if(!byRef.has(e.elementRef))byRef.set(e.elementRef,e);
 }
 const edits=[...byRef.values()].filter(x=>editable.has(role(x.role)));
 const matching=edits.filter(x=>attrs(x).some(v=>editPrompt.test(v))&&
  !attrs(x).some(v=>searchControl.test(v)));
 if(matching.length!==1)return Object.freeze({
  evidenceState:'no_unique_semantic_composer',
  promptCandidates:matching.length,
  controlCount:0,controls:[],uniqueNativeControlIdentified:false,
  composerIdentityVerified:false,chatDeliveryAuthorized:false});
 const editor=matching[0];
 const closeButtons=[...byRef.values()].filter(x=>
  button.has(role(x.role))&&buttonNearEditor(x,editor)).slice(0,8);
 const controls=closeButtons.map((x,i)=>{
  const p=nativePressEvidence(x);
  const metadata=[x.label,x.accessibilityLabel,x.description,
   x.name,x.title,x.help,x.tooltip];
  return Object.freeze({
   ordinal:i+1,
   hasAccessibleName:metadata.some(v=>text(v).length>0),
   hasIdentifier:[x.identifier,x.accessibilityIdentifier]
    .some(v=>text(v).length>0),
   sendSemanticHint:hintSendButton(x),
   positionClass:buttonPositionClass(x,editor),
   enabled:tri(x.enabled),visible:tri(x.visible),
   actionMetadataProvided:p.actionsProvided,
   pressActionHint:p.pressActionHint
  });
 });
 return Object.freeze({
  evidenceState:'unique_prompt_hint_with_nearby_controls',
  promptCandidates:1,
  editorRoleKind:role(editor.role).includes('area')?'text_area':'text_field',
  editorValueState:privateEditorValueClass(editor),
  editorValueOriginEvidence:privateEditorValueOriginEvidence(editor),
  editorEnabled:tri(editor.enabled),
  editorVisible:tri(editor.visible),
  controlCount:closeButtons.length,
  controlEvidenceTruncated:[...byRef.values()].filter(x=>
   button.has(role(x.role))&&buttonNearEditor(x,editor)).length>8,
  controls,
  uniqueNativeControlIdentified:false,
  composerIdentityVerified:false,chatDeliveryAuthorized:false
 });
}
function parentRef(x){
 return [x.parentRef,x.parentElementRef,x.parent?.elementRef,
  x.parent?.ref].find(validRef)??null;
}
function parentGroup(x){
 const v=[x.parentRef,x.parentElementRef,x.parent?.elementRef,
  x.parent?.ref].find(validRef);
 return v??null;
}
function ancestors(x,byRef){
 let p=parentGroup(x),depth=0;const seen=new Set(),result=[];
 while(p&&depth<7&&!seen.has(p)&&byRef.has(p)){
  seen.add(p);result.push(p);
  p=parentGroup(byRef.get(p));depth++;
 }
 return result;
}
function relatedByNativeParent(a,b,byRef){
 const aa=ancestors(a,byRef),bb=ancestors(b,byRef);
 // Direct parent or a non-root shared ancestor with at least 2 levels of
 // independent provenance is a *hint*, not proof of a ChatGPT send control.
 if(!aa.length||!bb.length)return false;
 return aa[0]===bb[0]||
  aa.slice(0,3).some(x=>bb.slice(0,3).includes(x));
}
export function assessAliceNativeAXSemantics(raw){
 const nodes=walkNativePayload(raw);
 const byRef=new Map();
 for(const e of nodes){
  if(!e||typeof e!=='object'||Array.isArray(e)||!validRef(e.elementRef)||
   !role(e.role))continue;
  if(!byRef.has(e.elementRef))byRef.set(e.elementRef,e);
 }
 const edits=[...byRef.values()].filter(x=>editable.has(role(x.role)));
 const buttons=[...byRef.values()].filter(x=>button.has(role(x.role)));
 const sends=buttons.filter(x=>attrs(x).some(s=>sendControl.test(s)));
 const broaderSendHints=buttons.filter(hintSendButton);
 const candidates=edits.slice(0,12).map((x,i)=>{
  const a=attrs(x);
  const prompt=a.some(s=>editPrompt.test(s));
  const search=a.some(s=>searchControl.test(s));
  const nearSend=sends.filter(b=>relatedByNativeParent(x,b,byRef)).length;
  return Object.freeze({
   ordinal:i+1,
   roleKind:role(x.role).includes('search')?'search_field':
    role(x.role).includes('area')?'text_area':'text_field',
   promptSemanticSignal:prompt,
   promptSignalSources:promptSignalSources(x),
   exactComposerIdentifierHint:strongComposerIdentifier(x),
   searchSemanticSignal:search,
   nearbyNativeButtonsWithBounds:Math.min(
    buttons.filter(b=>buttonNearEditor(b,x)).length,52),
   parentRefProvided:parentRef(x)!==null,
   mappedAncestorCount:Math.min(ancestors(x,byRef).length,7),
   relatedSendButtonCount:Math.min(nearSend,52),
   enabled:x.enabled===true?'yes':x.enabled===false?'no':'unknown',
   focused:x.focused===true?'yes':x.focused===false?'no':'unknown'
  });
 });
 const potentiallyUnique=candidates.filter(x=>x.promptSemanticSignal===true&&
  x.searchSemanticSignal===false);
 // A prompt word alone, or a button inside the same window, does NOT
 // establish the exact composite widget or authorize a single write.
 return Object.freeze({
  audit:'IOANT_ALICE_NATIVE_AX_SEMANTIC_EVIDENCE',
  state:'observed',
  nativeEditableCount:edits.length,
  nativeButtonsNamedSendCount:sends.length,
  nativeButtonsBroaderSendHintCount:broaderSendHints.length,
  nativeButtonCount:buttons.length,
  nativeButtonsWithGeometryCount:buttons.filter(readBounds).length,
  nativeButtonsWithoutTextMetadataCount:buttons.filter(x=>
   ![x.label,x.accessibilityLabel,x.description,x.name,x.title,
     x.help,x.tooltip].some(v=>text(v).length>0)).length,
  reportedCandidateCount:candidates.length,
  candidatesTruncated:edits.length>12,
  mappedRefCount:Math.min(byRef.size,1800),
  candidates,
  uniquePromptHint:potentiallyUnique.length===1,
  semanticParentEvidencePresent:candidates.some(x=>x.parentRefProvided),
  composerIdentityVerified:false,
  chatDeliveryAuthorized:false,
  rawAXTextReleased:false,
  nativeRefsReleased:false,
  screenshotTaken:false,
  computerInput:false,
  nativeControlReadiness:assessUniqueNativeComposerControls(raw)
 });
}
