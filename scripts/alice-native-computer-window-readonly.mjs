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
  return {...result,...summarizeNativeWindowOnly(observed,active)};
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
