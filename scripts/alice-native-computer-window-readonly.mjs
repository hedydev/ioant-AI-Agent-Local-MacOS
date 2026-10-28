#!/usr/bin/env node
// Native Computer Use window readiness for the ONE registered AliceAI Chrome
// conversation. This is NOT browser get_browser_state, DOM retrieval, an
// approval bypass, or authority to send a ChatGPT message.
// Read only: no screenshot, tab activation, browser input or chat content.
// Discard all native accessibility values; expose only fixed status flags.
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chooseConnectedMacNode} from './openclaw-mac-visual.mjs';
import {chromeAppleScript,verifyChromeTarget,selectNativeWindow,
 classifyNativeBrowserError} from './alice-native-browser-readonly.mjs';
import {walkNativePayload,makeReadOnlyNativeArgs} from
 './openclaw-cua-fixture-native-observe.mjs';
import {scopedCloseRequest,knownPreAdmissionNativeFailure} from
 './openclaw-cua-owned-session-guard.mjs';
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(homedir(),'Library','Application Support','ioant-openclaw-ops','runtime');
const CLI=join(homedir(),'.openclaw','bin','openclaw');
const AUDIT='IOANT_ALICE_NATIVE_COMPUTER_WINDOW_READONLY';
const base=()=>({audit:AUDIT,schemaVersion:1,readOnly:true,
 browserRelayUsed:false,browserDomRead:false,chatTextReleased:false,
 screenshotTaken:false,tabSwitched:false,computerInput:false,
 chatMessageSent:false,workflowMutated:false});
// Inspect role/label metadata in memory, discarding all label/value contents.
// Counts are only UI-readiness hints, never permission to type or send.
// The v2 contract exposes elementRef/role/label/bounds in window observation.
export function summarizeNativeAXElements(raw){
 const nodes=walkNativePayload(raw);
 const refs=new Set(),editable=new Set(),composerHints=new Set(),buttons=new Set();
 for(const el of nodes){
  if(!el||typeof el!=='object'||Array.isArray(el)||
     typeof el.elementRef!=='string'||el.elementRef.length<3||
     el.elementRef.length>1024||typeof el.role!=='string')continue;
  const ref=el.elementRef;
  const role=el.role.toLowerCase().replace(/[^a-z0-9]/g,'');
  refs.add(ref);
  if(role==='button'||role==='axbutton')buttons.add(ref);
  if(['textarea','textfield','textbox','textentryarea','edittext',
       'axtextarea','axtextfield','textinput','searchfield','searchbox']
      .includes(role)){
   editable.add(ref);
   const label=typeof el.label==='string'?el.label.trim():'';
   if(/^(?:ask anything|message chatgpt|message aliceai|提问任何问题|询问任何问题|发送消息|输入消息)$/i.test(label))
    composerHints.add(ref);
  }
 }
 return Object.freeze({
  accessibleElementCount:Math.min(refs.size,1800),
  editableElementCount:Math.min(editable.size,1800),
  possibleComposerLabelHints:Math.min(composerHints.size,1800),
  buttonElementCount:Math.min(buttons.size,1800),
  composerIdentityVerified:false
 });
}
// Ephemeral native AX structure hints only. Never expose labels, values,
// references, coordinates or a claim that any field is the ChatGPT composer.
const EDITABLE_ROLES=new Set(['textarea','textfield','textbox','textentryarea',
 'edittext','axtextarea','axtextfield','textinput','searchfield','searchbox']);
const CLASSIC_COMPOSER=/^(?:ask anything|message chatgpt|message aliceai|提问任何问题|询问任何问题|发送消息|输入消息)$/i;
function axRole(raw){
 return typeof raw==='string'?raw.toLowerCase().replace(/[^a-z0-9]/g,''):'';
}
function semanticClass(raw){
 if(typeof raw!=='string'||raw.trim()==='')return 'missing';
 return CLASSIC_COMPOSER.test(raw.trim())?'known_chat_ui':'other_unreleased';
}
function coarseBox(el){
 const b=[el?.bounds,el?.frame,el?.rect,el?.boundingBox]
  .find(x=>x&&typeof x==='object'&&!Array.isArray(x));
 if(!b)return null;
 const y=b.y??b.top??b.origin?.y;
 const width=b.width??b.size?.width;
 if(!Number.isFinite(y)||!Number.isFinite(width)||width<0)return null;
 return {y,width};
}
export function summarizeNativeEditableCandidates(raw){
 const rows=new Map();
 for(const el of walkNativePayload(raw)){
  if(!el||typeof el!=='object'||Array.isArray(el)||
     typeof el.elementRef!=='string'||el.elementRef.length<3||
     el.elementRef.length>1024||!EDITABLE_ROLES.has(axRole(el.role)))continue;
  if(rows.has(el.elementRef))continue;
  const b=coarseBox(el);
  const labels=[el.label,el.accessibilityLabel,el.placeholder,
    el.placeholderValue,el.description].filter(x=>typeof x==='string');
  rows.set(el.elementRef,{
   kind:axRole(el.role).includes('search')?'search_field':
    axRole(el.role).includes('area')?'text_area':'text_field',
   metadataClass:labels.some(x=>semanticClass(x)==='known_chat_ui')?
    'known_chat_ui':labels.length?'other_unreleased':'missing',
   geometry:b,
   enabled:el.enabled===true?'yes':el.enabled===false?'no':'unknown',
   focused:el.focused===true?'yes':el.focused===false?'no':'unknown'
  });
 }
 const all=[...rows.values()].slice(0,12);
 const sorted=[...all].filter(x=>x.geometry).sort((a,b)=>a.geometry.y-b.geometry.y);
 return Object.freeze({
  candidateCount:rows.size,
  diagnosticsTruncated:rows.size>12,
  candidates:all.map((x,i)=>Object.freeze({
   ordinal:i+1,roleKind:x.kind,uiLabelClass:x.metadataClass,
   positionWithinEditables:x.geometry&&sorted.length>1?
    (sorted.indexOf(x)===0?'highest':
      sorted.indexOf(x)===sorted.length-1?'lowest':'middle'):
    x.geometry?'single_position':'unknown',
   widthClass:!x.geometry?'unknown':x.geometry.width>=500?'wide':
    x.geometry.width>=200?'medium':'narrow',
   enabled:x.enabled,focused:x.focused
  })),
  composerIdentityVerified:false,
  chatDeliveryAuthorized:false
 });
}
export function summarizeNativeWindowOnly(raw,targetActive){
 const envelope=raw?.result??raw;
 const nodes=walkNativePayload(raw);
 const obs=new Set(nodes.map(x=>x?.observationId).filter(x=>
  typeof x==='string'&&x.length>=3&&x.length<=1024));
 return {
  state:raw?.ok===true&&obs.size===1?'native_window_observed':'inconclusive',
  reason:raw?.ok!==true?'native_window_state_refused':
   obs.size!==1?'native_window_observation_unverified':
   targetActive?'active_target_window_observed':'containing_window_only_target_tab_inactive',
  aliceTabActive:targetActive===true,
  windowObservationVerified:raw?.ok===true&&obs.size===1,
  ...(raw?.ok===true&&obs.size===1?summarizeNativeAXElements(raw):{}),
  alicePageVerified:false,chatDeliveryAuthorized:false
 };
}
export async function inspectAliceNativeWindow({run,osRead,uuid=randomUUID}={}){
 const result=base();
 if(process.platform!=='darwin'||ROOT!==RUNTIME||
   await realpath(RUNTIME)!==RUNTIME)
  return {...result,state:'blocked',reason:'private_runtime_required'};
 const cli=run??((args,timeout=25000)=>JSON.parse(execFileSync(CLI,args,{
  encoding:'utf8',timeout,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']})));
 const readOS=osRead??(()=>execFileSync('/usr/bin/osascript',
  ['-e',chromeAppleScript()],{encoding:'utf8',timeout:7000,
   maxBuffer:8192,stdio:['ignore','pipe','pipe']}));
 let node=null,id=null,attempted=false,phase='os_attestation',active=null;
 try{
  const target=verifyChromeTarget(readOS());
  if(!target)return {...result,state:'inconclusive',reason:'os_target_unverified'};
  active=target.targetActive;
  phase='native_preflight';
  const status=cli(['nodes','status','--json'],18000);
  const chosen=chooseConnectedMacNode(status);
  const rows=(status.result??status).nodes;
  const current=rows.find(x=>x?.connected===true&&
   (x.nodeId===chosen.id||x.id===chosen.id));
  if(current?.computerUse?.provider?.id!=='cua-computer'||
     current.computerUse.contractVersion!==2||
     !['list_windows','get_window_state'].every(x=>
      current.computerUse.actions?.includes(x)))
   return {...result,state:'blocked',reason:'native_window_provider_unavailable'};
  node=chosen.id;id=uuid();
  phase='window_list';attempted=true;
  const listed=cli(makeReadOnlyNativeArgs(node,id,'list_windows'),30000);
  if(listed?.ok!==true)return {...result,state:'inconclusive',
   reason:'native_list_windows_refused'};
  const match=selectNativeWindow(listed,target.title);
  if(match.state!=='matched')return {...result,state:'inconclusive',
   reason:match.reason};
  phase='native_window_state';
  const observed=cli(makeReadOnlyNativeArgs(node,id,'get_window_state',
   {windowRef:match.windowRef}),30000);
  // Prevent an OS tab/window swap between the independent identity check
  // and native accessibility observation. Never use stale refs after this.
  phase='post_observation_os_attestation';
  const after=verifyChromeTarget(readOS());
  if(!after||after.title!==target.title||
      after.targetActive!==target.targetActive)
   return {...result,state:'inconclusive',reason:'active_tab_identity_changed'};
  return {...result,activeTabIdentityRechecked:true,
   ...summarizeNativeWindowOnly(observed,active),
   ...(active===true&&observed?.ok===true?
      {editableStructure:summarizeNativeEditableCandidates(observed)}:{})};
 }catch(e){
  const classified=phase==='native_window_state'?
   classifyNativeBrowserError(e):null;
  return {...result,state:'inconclusive',reason:'native_window_read_unavailable',
   phase,preAdmissionDenied:knownPreAdmissionNativeFailure(e),
   ...(classified?{failureCategory:classified.failureCategory,
    ...(classified.nativeCode?{nativeCode:classified.nativeCode}:{})}: {})};
 }finally{
  if(attempted&&node&&id){
   let closeAcknowledged=false;
   try{
    const closed=cli(scopedCloseRequest(node,id),15000);
    closeAcknowledged=closed?.ok===true||closed?.result?.ok===true;
   }catch{}
   console.log(JSON.stringify({audit:'IOANT_ALICE_NATIVE_WINDOW_CLOSE',
    closeAttempted:true,closeAcknowledged,ownerReleaseVerified:false}));
  }
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let result;
 try{result=process.argv.length===2?await inspectAliceNativeWindow():
  {...base(),state:'blocked',reason:'unexpected_args'};}
 catch{result={...base(),state:'inconclusive',reason:'preflight_unavailable'};}
 console.log(JSON.stringify(result));
 if(result.state!=='native_window_observed')process.exitCode=1;
}
