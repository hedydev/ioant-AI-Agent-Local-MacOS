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
 const sends=[...byRef.values()].filter(x=>button.has(role(x.role))&&
  attrs(x).some(s=>sendControl.test(s)));
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
   searchSemanticSignal:search,
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
  computerInput:false
 });
}
