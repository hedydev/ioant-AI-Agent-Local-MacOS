#!/usr/bin/env node
// Dedicated managed AliceAI browser -> native CUA v2 read-only admission.
// No navigation, tab focus, screenshot, native invocation, content or credentials.
// The separate managed Chrome is NOT the operator's daily Chrome.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {realpathSync} from 'node:fs';
import {realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {parseProjectChatUrl} from '../stage2/project-chat-routing.mjs';
import {chooseConnectedMacNode} from './openclaw-mac-visual.mjs';
const exec=promisify(execFile);
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(homedir(),'Library','Application Support','ioant-openclaw-ops','runtime');
const CLI=join(homedir(),'.openclaw','bin','openclaw');
const PROJECT='g-p-6acaef839af081919426a885b3209f54';
const CHAT='6ade11a5-f0c0-83ec-add1-8a0cff00c938';
const AUDIT='IOANT_ALICE_MANAGED_NATIVE_CUA_READINESS';
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const base=()=>({audit:AUDIT,schemaVersion:1,readOnly:true,
 managedProfile:'alice-ai',navigationAttempted:false,tabFocused:false,
 browserPageRead:false,chatContentRead:false,credentialsRead:false,
 screenshotTaken:false,nativeComputerActInvoked:false,desktopInput:false,
 browserConfigChanged:false,ssrfRelaxed:false,proxyChanged:false,
 coordinatorChanged:false,chatMessageSent:false,nativeWindowOwnerVerified:false,
 composerIdentityVerified:false,chatDeliveryAuthorized:false});
export function summarizeManagedTarget(status,tabs){
 if(!plain(status)||status.profile!=='alice-ai'||status.driver!=='openclaw'||
  status.engine!=='chromium'||status.running!==true||status.headless!==false||
  status.cdpReady!==true||status.cdpPort!==18801||
  !Number.isSafeInteger(status.pid)||status.pid<=0)
  return {state:'blocked',reason:'dedicated_managed_browser_identity_unverified',
   exactChatTabMatches:0};
 const body=tabs?.result??tabs;
 const rows=Array.isArray(body)?body:Array.isArray(body?.tabs)?body.tabs:null;
 if(!rows||rows.length>128)return {state:'inconclusive',
  reason:'managed_tab_catalog_unverified',exactChatTabMatches:0};
 const hit=rows.filter(t=>{
  if(!plain(t)||typeof t.url!=='string')return false;
  try{const u=parseProjectChatUrl(t.url,{allowTracking:true});
    return u.projectId===PROJECT&&u.conversationId===CHAT;
  }catch{return false;}
 });
 return {state:hit.length===1?'exact_managed_chat_tab_observed':
    hit.length===0?'await_operator_manual_navigation':'blocked',
  reason:hit.length===1?'exact_chat_in_dedicated_profile':
   hit.length===0?'dedicated_browser_does_not_yet_have_exact_chat':
    'duplicate_exact_chat_tabs_in_dedicated_profile',
  exactChatTabMatches:Math.min(hit.length,128),
  browserOwnedAndReady:true,headless:false,cdpReady:true,
  tabActivationVerified:false};
}
export function summarizeNativeReadProvider(status){
 try{
  const n=chooseConnectedMacNode(status);
  const body=status?.result??status;
  const rows=body?.nodes??[];
  const current=rows.find(x=>x?.connected===true&&
    (x.nodeId===n.id||x.id===n.id));
  const c=current?.computerUse;
  const actions=Array.isArray(c?.actions)?c.actions:[];
  const bg=Array.isArray(c?.deliveryModes)?c.deliveryModes:[];
  const ready=c?.provider?.id==='cua-computer'&&
    c?.contractVersion===2&&typeof c?.provider?.generation==='string'&&
    c.provider.generation.length>0&&
    actions.includes('list_windows')&&actions.includes('get_window_state');
  return {nativeReadAdvertised:ready===true,
   backgroundSetValueAdvertised:ready===true&&actions.includes('set_value')&&
     bg.includes('background')};
 }catch{return {nativeReadAdvertised:false,
  backgroundSetValueAdvertised:false};}
}
export async function inspectDedicatedNativeReady({
 platform=process.platform,
 runtimeCheck=async()=>ROOT===RUNTIME&&await realpath(RUNTIME)===RUNTIME,
 call=async args=>{
  const {stdout}=await exec(CLI,args,{cwd:RUNTIME,timeout:18000,
   maxBuffer:1024*1024,shell:false});
  return JSON.parse(stdout);
 }
}={}){
 const b=base();
 if(platform!=='darwin'||!await runtimeCheck().catch(()=>false))
  return {...b,state:'blocked',reason:'private_macos_runtime_required'};
 let status,tabs;
 try{status=await call(['browser','--browser-profile','alice-ai','--json','status']);}
 catch{return {...b,state:'inconclusive',reason:'managed_browser_status_unavailable'};}
 try{tabs=await call(['browser','--browser-profile','alice-ai','tabs','--json']);}
 catch{return {...b,state:'inconclusive',reason:'managed_browser_tabs_unavailable'};}
 const target=summarizeManagedTarget(status,tabs);
 if(target.state!=='exact_managed_chat_tab_observed')return {...b,...target};
 let nodeStatus;
 try{nodeStatus=await call(['nodes','status','--json']);}
 catch{return {...b,...target,state:'inconclusive',
  reason:'native_cua_status_unavailable'};}
 const native=summarizeNativeReadProvider(nodeStatus);
 return {...b,...target,...native,
  state:native.nativeReadAdvertised?'ready_for_native_window_observation':'blocked',
  reason:native.nativeReadAdvertised?'native_window_identity_check_next':
   'native_cua_read_capabilities_unavailable'};
}
if(process.argv[1]&&realpathSync(process.argv[1])===
 realpathSync(fileURLToPath(import.meta.url))){
 const r=process.argv.length===2?await inspectDedicatedNativeReady():
  {...base(),state:'blocked',reason:'unexpected_arguments'};
 console.log(JSON.stringify(r));
 if(r.state==='inconclusive')process.exitCode=1;
}
