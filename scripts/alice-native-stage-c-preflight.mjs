#!/usr/bin/env node
// Stage C native CUA read-only preflight. Never activate or switch a Chrome
// tab, invoke computer.act, use Browser Relay/MCP, or change macOS focus.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {realpathSync} from 'node:fs';
import {realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chooseConnectedMacNode} from './openclaw-mac-visual.mjs';
import {chromeAppleScript,verifyChromeTarget} from './alice-native-browser-readonly.mjs';
const AUDIT='IOANT_ALICE_NATIVE_STAGE_C_PREFLIGHT';
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(homedir(),'Library','Application Support','ioant-openclaw-ops','runtime');
const CLI=join(homedir(),'.openclaw','bin','openclaw');
const run=promisify(execFile);
const base=()=>({audit:AUDIT,schemaVersion:1,readOnly:true,
 browserRelayUsed:false,browserDomRead:false,computerActInvoked:false,
 screenshotTaken:false,tabSwitched:false,desktopInput:false,
 chatContentRead:false,chatMessageSent:false,permissionsChanged:false,
 workerRestarted:false,aliceCoordinatorChanged:false,
 nativeExecutionAcquired:false,providerGenerationStabilityProven:false,
 composerIdentityVerified:false,chatDeliveryAuthorized:false});
export function classifyStageC({target,provider}={}){
 if(!target)return {state:'blocked',nextGate:'exact_alice_tab_attestation',
  reason:'exact_alice_tab_not_uniquely_attested',aliceTabActive:false,
  providerReadAdvertised:false,backgroundSetValueAdvertised:false,
  needsOperatorTabSelection:false};
 const active=target.targetActive===true;
 const ready=provider?.connected===true&&provider?.id==='cua-computer'&&
  provider?.contractVersion===2&&
  typeof provider.generation==='string'&&provider.generation.length>0;
 const actions=Array.isArray(provider?.actions)?provider.actions:[];
 const background=Array.isArray(provider?.deliveryModes)?
  provider.deliveryModes:[];
 const reads=ready&&['list_windows','get_window_state'].every(x=>actions.includes(x));
 const setValue=ready&&actions.includes('set_value')&&background.includes('background');
 const nextGate=!active?'select_alice_tab_in_own_window':
  !reads?'native_cua_read_capabilities':
  'native_ax_composer_semantics';
 return {state:active&&reads?'ready_for_native_ax_readonly':'blocked',nextGate,
  reason:!active?'alice_tab_inactive_in_own_chrome_window':
   !reads?'native_cua_read_capabilities_unavailable':'exact_tab_and_native_reads_ready',
  aliceTabActive:active,providerReadAdvertised:reads,
  backgroundSetValueAdvertised:setValue,
  needsOperatorTabSelection:!active};
}
export async function inspectStageC({
 platform=process.platform,
 runtimeCheck=async()=>ROOT===RUNTIME&&await realpath(RUNTIME)===RUNTIME,
 osRead=async()=>{
  const {stdout}=await run('/usr/bin/osascript',['-e',chromeAppleScript()],
   {timeout:8000,maxBuffer:8192,shell:false});
  return stdout;
 },
 statusRead=async()=>{
  const {stdout}=await run(CLI,['nodes','status','--json'],
   {timeout:20000,maxBuffer:1024*1024,shell:false});
  return JSON.parse(stdout);
 }
}={}){
 const result=base();
 if(platform!=='darwin'||!await runtimeCheck().catch(()=>false))
  return {...result,state:'blocked',nextGate:'private_runtime',
   reason:'private_macos_runtime_required'};
 let target=null;
 try{target=verifyChromeTarget(await osRead());}
 catch{return {...result,state:'inconclusive',nextGate:'os_tab_attestation',
  reason:'os_tab_attestation_unavailable'};}
 if(!target)return {...result,...classifyStageC({target:null})};
 let provider=null;
 try{
  const status=await statusRead();
  const chosen=chooseConnectedMacNode(status);
  const nodes=(status.result??status).nodes;
  const node=nodes.find(x=>x?.connected===true&&
   (x.nodeId===chosen.id||x.id===chosen.id));
  const c=node?.computerUse;
  provider={connected:node?.connected===true,
   id:c?.provider?.id,contractVersion:c?.contractVersion,
   generation:c?.provider?.generation,actions:c?.actions,
   deliveryModes:c?.deliveryModes};
 }catch{
  return {...result,...classifyStageC({target}),
   state:'inconclusive',nextGate:'native_cua_status',
   reason:'native_cua_status_unavailable'};
 }
 return {...result,...classifyStageC({target,provider})};
}
if(process.argv[1]&&realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url))){
 const result=process.argv.length===2?await inspectStageC():
  {...base(),state:'blocked',nextGate:'invocation',
   reason:'no_arguments_supported'};
 console.log(JSON.stringify(result));
 if(result.state==='inconclusive')process.exitCode=1;
}
