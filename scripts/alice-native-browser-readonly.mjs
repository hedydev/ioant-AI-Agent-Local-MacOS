#!/usr/bin/env node
// Phase 205C: owner-scoped native browser discovery for ONE pre-registered AliceAI Chat.
// No Chrome Relay dependency, browser mutation, screenshot or message send.
// Fail closed unless exactly one OS-attested Alice tab belongs to a uniquely
// identified CUA Chrome window. The Alice tab may be inactive; never activate it.
// Never output window titles, URLs, refs, page data or node IDs.
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chooseConnectedMacNode} from './openclaw-mac-visual.mjs';
import {walkNativePayload} from './openclaw-cua-fixture-native-observe.mjs';
import {scopedCloseRequest,knownPreAdmissionNativeFailure} from './openclaw-cua-owned-session-guard.mjs';
import {parseProjectChatUrl} from '../stage2/project-chat-routing.mjs';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(homedir(),'Library','Application Support','ioant-openclaw-ops','runtime');
const CLI=join(homedir(),'.openclaw','bin','openclaw');
const CHAT='https://chatgpt.com/g/g-p-6acaef839af081919426a885b3209f54-ai-mc-alice/c/6ade11a5-f0c0-83ec-add1-8a0cff00c938';
const EXPECTED=parseProjectChatUrl(CHAT);
const AUDIT='IOANT_ALICE_NATIVE_BROWSER_READONLY';
const cleanText=v=>typeof v==='string'&&v.length>0&&v.length<512&&!/[\r\n\t]/.test(v);
const safeRef=v=>typeof v==='string'&&v.length>=3&&v.length<=1024;
function cli(args,timeout=25000){
 return JSON.parse(execFileSync(CLI,args,{cwd:RUNTIME,timeout,maxBuffer:8*1024*1024,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
}
function invoke(node,id,action,params={}){
 return cli(['nodes','invoke','--node',node,'--command','computer.act',
  '--params',JSON.stringify({action,executionId:id,...params}),'--json'],30000);
}
export function verifyChromeTarget(report){
 const rows=String(report).trim().split('\t');
 // Exactly one target tab, in exactly one Chrome window. The third field
 // reports whether that tab is active, NOT a precondition for observing it.
 if(rows.length!==5||rows[0]!=='1'||rows[1]!=='1'||
    !['0','1'].includes(rows[2])||!cleanText(rows[3]))return null;
 try{
  const u=parseProjectChatUrl(rows[4],{allowTracking:true});
  if(u.projectId!==EXPECTED.projectId||u.conversationId!==EXPECTED.conversationId)return null;
  return {title:rows[3],targetActive:rows[2]==='1'};
 }catch{return null}
}
export function chromeAppleScript(){
 // Chrome's tab object does NOT have an "index" property (-1728).
 // Use the enumerated 1-based tab number and the window's active tab index.
 // Read the active tab title *of the target tab's parent window*, even if
 // Alice is not the active tab. Chrome's window.name is not authoritative.
 // No tab activation/navigation, and no page contents are read.
 return 'tell application "Google Chrome"\n'+
  'set n to 0\nset a to 0\nset b to 0\nset nm to ""\nset uri to ""\n'+
  'repeat with w in windows\n'+
  'set activeIdx to active tab index of w\n'+
  'repeat with j from 1 to (count of tabs of w)\n'+
  'set t to tab j of w\n'+
  'set u to URL of t as text\n'+
  'if u contains "/c/6ade11a5-f0c0-83ec-add1-8a0cff00c938" then\n'+
  'set n to n + 1\nset a to a + 1\n'+
  'if j is activeIdx then set b to b + 1\n'+
  'set nm to title of tab activeIdx of w as text\nset uri to u\n'+
  'end if\nend repeat\nend repeat\n'+
  'return (n as text) & tab & (a as text) & tab & (b as text) & tab & nm & tab & uri\nend tell';
}
const normalize=s=>s.normalize('NFKC').replace(/\s+/g,' ').trim();
export function selectNativeWindow(raw,chromeTitle){
 if(!cleanText(chromeTitle))return {state:'inconclusive',reason:'os_window_title_invalid'};
 const rows=walkNativePayload(raw).filter(x=>x&&typeof x==='object'&&!Array.isArray(x)&&
  safeRef(x.windowRef)&&cleanText(x.title));
 const name=normalize(chromeTitle);
 // The OS window title must agree exactly; a browser postfix is allowed,
 // but generic "Chrome" substring, coordinates and guessed refs are forbidden.
 const compatible=x=>{
  const t=normalize(x.title);
  return t===name||t===name+' - Google Chrome'||t===name+' — Google Chrome';
 };
 const matches=rows.filter(compatible);
 const refs=[...new Set(matches.map(x=>x.windowRef))];
 return {state:refs.length===1&&matches.length===1?'matched':'inconclusive',
  reason:refs.length===0?'title_projection_mismatch':
   refs.length!==1||matches.length!==1?'ambiguous_native_window':'exact_title_matched',
  windowRef:refs.length===1&&matches.length===1?refs[0]:null,
  nativeWindowRecords:rows.length,compatibleCount:matches.length};
}
function visitBrowserPayload(raw,max=1200){
 const queue=[{v:raw,d:0}],seen=new Set(),out=[];
 const keys=['result','details','content','structuredContent','text',
  'payload','data','browser','browsers','pages','page','tabs','items'];
 while(queue.length&&out.length<max){
  const {v,d}=queue.shift();if(d>10||v==null)continue;
  if(typeof v==='string'){
   if(v.length<1024*1024&&/^\s*[\[{]/.test(v))try{queue.push({v:JSON.parse(v),d:d+1})}catch{}
   continue;
  }
  if(typeof v!=='object'||seen.has(v))continue;
  seen.add(v);out.push(v);
  if(Array.isArray(v)){for(const el of v.slice(0,200))queue.push({v:el,d:d+1})}
  else for(const key of keys)if(Object.hasOwn(v,key))queue.push({v:v[key],d:d+1});
 }
 return out;
}
export function summarizeBrowserState(raw){
 const items=visitBrowserPayload(raw).filter(x=>x&&!Array.isArray(x)&&typeof x==='object');
 const refs=new Set(items.map(x=>x.browserRef).filter(safeRef));
 const exact=items.filter(x=>{
  if(!safeRef(x.pageRef)||typeof x.url!=='string')return false;
  try{const u=parseProjectChatUrl(x.url,{allowTracking:true});
   return u.projectId===EXPECTED.projectId&&u.conversationId===EXPECTED.conversationId;
  }catch{return false}
 });
 const uniquePages=new Set(exact.map(x=>x.pageRef));
 return {browserRefObserved:refs.size>0,uniqueBrowserRefs:refs.size,
  exactPageMatches:uniquePages.size,state:refs.size===1&&uniquePages.size===1?
   'target_page_verified':'target_page_unverified'};
}
export async function observeAliceNativeBrowser({run=cli,osRead=()=>execFileSync('/usr/bin/osascript',
 ['-e',chromeAppleScript()],{encoding:'utf8',timeout:7000,maxBuffer:8192,stdio:['ignore','pipe','pipe']})}={}){
 const base={audit:AUDIT,schemaVersion:1,readOnly:true,
  changedBrowser:false,chatMessageSent:false,desktopInput:false,
  screenshotTaken:false,relayAccess:false};
 if(process.platform!=='darwin'||ROOT!==RUNTIME||await realpath(RUNTIME)!==RUNTIME)
  return {...base,state:'blocked',reason:'private_runtime_required'};
 let own=null,node=null,closeAttempted=false,closeAcknowledged=false,firstAttempted=false;
 let phase='chrome_os_metadata';
 try{
  const target=verifyChromeTarget(osRead());
  if(!target)return {...base,state:'inconclusive',reason:'os_target_window_unverified'};
  phase='native_provider_preflight';
  const status=run(['nodes','status','--json'],18000);
  const selection=chooseConnectedMacNode(status);
  const rows=(status.result??status).nodes;
  const chosen=rows.find(x=>x?.connected===true&&(x.nodeId===selection.id||x.id===selection.id));
  const provider=chosen?.computerUse;
  if(provider?.contractVersion!==2||provider?.provider?.id!=='cua-computer'||
     !['list_windows','get_browser_state'].every(x=>provider.actions?.includes(x)))
   return {...base,state:'blocked',reason:'native_provider_unverified'};
  node=selection.id;own=randomUUID();
  const native=(action,params={})=>run(['nodes','invoke','--node',node,
   '--command','computer.act','--params',
   JSON.stringify({action,executionId:own,...params}),'--json'],30000);
  phase='native_window_list';
  firstAttempted=true;
  const list=native('list_windows');
  if(list?.ok!==true)return {...base,state:'inconclusive',reason:'native_window_list_unverified'};
  phase='native_window_matching';
  const selected=selectNativeWindow(list,target.title);
  if(selected.state!=='matched')return {...base,state:'inconclusive',
   reason:selected.reason,nativeWindowRecords:selected.nativeWindowRecords,
   compatibleWindowRecords:selected.compatibleCount};
  phase='native_browser_state';
  const response=native('get_browser_state',{windowRef:selected.windowRef});
  if(response?.ok!==true)return {...base,state:'inconclusive',reason:'native_browser_state_refused'};
  const summary=summarizeBrowserState(response);
  return {...base,state:summary.state,reason:summary.state==='target_page_verified'?
   'native_browser_page_reference_verified':'browser_page_identity_unverified',
   browserRefObserved:summary.browserRefObserved,exactPageMatches:summary.exactPageMatches,
   targetWasActive:target.targetActive};
 }catch(e){
  return {...base,state:'inconclusive',
   reason:phase==='chrome_os_metadata'?'chrome_os_metadata_unavailable':'native_browser_observation_unavailable',
   phase,preAdmissionDenied:knownPreAdmissionNativeFailure(e)};
 }finally{
  if(firstAttempted&&own&&node){
   closeAttempted=true;
   try{const r=run(scopedCloseRequest(node,own),15000);
    closeAcknowledged=r?.ok===true||r?.result?.ok===true;}catch{}
   // Do not assert owner release: a close acknowledgement is not lease proof.
   console.log(JSON.stringify({audit:'IOANT_ALICE_CUA_EXECUTION_CLOSE',
    closeAttempted,closeAcknowledged,ownerReleaseVerified:false}));
  }
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let result;
 try{if(process.argv.length!==2)throw Error('unexpected_args');
  result=await observeAliceNativeBrowser();}
 catch{result={audit:AUDIT,state:'inconclusive',reason:'unverified_preflight',
  changedBrowser:false,desktopInput:false,chatMessageSent:false}}
 console.log(JSON.stringify(result));
 if(result.state!=='target_page_verified')process.exitCode=1;
}
