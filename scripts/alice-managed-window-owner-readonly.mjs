#!/usr/bin/env node
// Stage E2a: independently attest that the managed AliceAI browser's exact
// reported PID has a normal macOS WindowServer window. Does not navigate,
// focus, capture pixels, read window titles, visit ChatGPT, or invoke CUA.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {realpath} from 'node:fs/promises';
import {realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {summarizeManagedTarget,summarizeNativeReadProvider} from './alice-managed-native-readiness.mjs';
const exec=promisify(execFile);
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(homedir(),'Library','Application Support','ioant-openclaw-ops','runtime');
const CLI=join(homedir(),'.openclaw','bin','openclaw');
const AUDIT='IOANT_ALICE_MANAGED_WINDOW_OWNER_READONLY';
const SWIFT=`
import Foundation
import CoreGraphics
let expected = Int(ProcessInfo.processInfo.environment["IOANT_ALICE_MANAGED_PID"] ?? "") ?? -1
let records = CGWindowListCopyWindowInfo([.optionAll],kCGNullWindowID) as? [[String:Any]] ?? []
let owned = records.filter { w in
  (w[kCGWindowOwnerPID as String] as? NSNumber)?.intValue == expected &&
  (w[kCGWindowLayer as String] as? NSNumber)?.intValue == 0
}
let visible = owned.filter { w in
  (w[kCGWindowIsOnscreen as String] as? NSNumber)?.boolValue == true
}
print("{\\"normalWindowCount\\":\\(min(owned.count,99)),\\"onScreenNormalWindowCount\\":\\(min(visible.count,99))}")
`;
const base=()=>({audit:AUDIT,schemaVersion:1,readOnly:true,
 browserNavigation:false,chatPageRead:false,windowTitlesRead:false,
 windowPixelsCaptured:false,nativeComputerActInvoked:false,
 desktopInput:false,changedFocus:false,profileModified:false,
 ssrfRelaxed:false,proxyChanged:false,credentialsRead:false,
 cookiesRead:false,chatMessageSent:false,aliceCoordinatorChanged:false,
 chatDeliveryAuthorized:false,nativeAXIdentityVerified:false});
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const bounded=n=>Number.isInteger(n)&&n>=0&&n<=99?n:null;
export function classifyWindowOwner(status,tabs,rawWindows,nodeStatus){
 const target=summarizeManagedTarget(status,tabs);
 if(target.reason==='dedicated_managed_browser_identity_unverified')
  return {state:'blocked',reason:target.reason,exactChatTabMatches:0,
   windowOwnerAttested:false};
 if(target.state==='inconclusive')return {state:'inconclusive',
  reason:'managed_tabs_unavailable',windowOwnerAttested:false};
 const n=bounded(rawWindows?.normalWindowCount),
  on=bounded(rawWindows?.onScreenNormalWindowCount);
 if(n===null||on===null||on>n)return {state:'inconclusive',
  reason:'windowserver_ownership_evidence_invalid',windowOwnerAttested:false};
 const capability=summarizeNativeReadProvider(nodeStatus);
 if(n===0)return {state:'blocked',reason:'managed_pid_has_no_normal_window',
  ownedNormalWindowCount:0,ownedOnScreenWindowCount:0,
  exactChatTabMatches:target.exactChatTabMatches,
  windowOwnerAttested:false,...capability};
 const out={
  ownedNormalWindowCount:n,ownedOnScreenWindowCount:on,
  windowOwnerAttested:true,exactChatTabMatches:target.exactChatTabMatches,
  exactChatTabUniquelyObserved:target.exactChatTabMatches===1,
  nativeReadAdvertised:capability.nativeReadAdvertised,
  backgroundSetValueAdvertised:capability.backgroundSetValueAdvertised,
  targetPageActiveInOwnedWindowVerified:false};
 if(target.exactChatTabMatches!==1)
  return {...out,state:'await_operator_manual_navigation',
   reason:target.exactChatTabMatches===0?'managed_window_exists_target_chat_absent':
    'exact_chat_tab_not_unique'};
 if(!capability.nativeReadAdvertised)return {...out,state:'blocked',
  reason:'native_cua_read_capabilities_unavailable'};
 if(on===0)return {...out,state:'blocked',
  reason:'owned_window_not_onscreen'};
 return {...out,state:'ready_for_native_window_ref_readonly',
  reason:'managed_pid_windowserver_owner_and_exact_chat_tab_attested'};
}
export async function inspectManagedWindowOwner({
 platform=process.platform,
 runtimeCheck=async()=>ROOT===RUNTIME&&await realpath(RUNTIME)===RUNTIME,
 call=async args=>{
  const {stdout}=await exec(CLI,args,{cwd:RUNTIME,timeout:20000,
   maxBuffer:1048576,shell:false});
  return JSON.parse(stdout);
 },
 windowRead=async pid=>{
  const {stdout}=await exec('/usr/bin/swift',['-e',SWIFT],{
   cwd:RUNTIME,timeout:35000,maxBuffer:8192,shell:false,
   env:{...process.env,IOANT_ALICE_MANAGED_PID:String(pid)}});
  return JSON.parse(stdout);
 }
}={}){
 const b=base();
 if(platform!=='darwin'||!await runtimeCheck().catch(()=>false))
  return {...b,state:'blocked',reason:'private_macos_runtime_required'};
 let status,tabs;
 try{
  status=await call(['browser','--browser-profile','alice-ai','--json','status']);
  // Never probe WindowServer for an unspecified PID.
  if(!plain(status)||status.profile!=='alice-ai'||status.driver!=='openclaw'||
   status.engine!=='chromium'||status.running!==true||status.cdpReady!==true||
   status.headless!==false||status.cdpPort!==18801||
   !Number.isSafeInteger(status.pid)||status.pid<=0)
   return {...b,state:'blocked',reason:'dedicated_managed_browser_identity_unverified'};
  tabs=await call(['browser','--browser-profile','alice-ai','tabs','--json']);
 }catch{return {...b,state:'inconclusive',reason:'browser_status_or_tabs_unavailable'};}
 let native;
 try{native=await call(['nodes','status','--json']);}
 catch{return {...b,state:'inconclusive',reason:'native_provider_status_unavailable'};}
 let windows;
 try{windows=await windowRead(status.pid);}
 catch{return {...b,state:'inconclusive',reason:'windowserver_read_unavailable'};}
 return {...b,...classifyWindowOwner(status,tabs,windows,native)};
}
if(process.argv[1]&&realpathSync(process.argv[1])===
 realpathSync(fileURLToPath(import.meta.url))){
 const r=process.argv.length===2?await inspectManagedWindowOwner():
  {...base(),state:'blocked',reason:'unexpected_arguments'};
 console.log(JSON.stringify(r));
 if(r.state==='inconclusive')process.exitCode=1;
}
