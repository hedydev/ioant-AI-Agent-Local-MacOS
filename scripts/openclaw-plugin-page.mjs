#!/usr/bin/env node
// Fixed, explicitly authorized ChatGPT Plugins setup steps through OpenClaw native CUA.
// No model, browser Relay/CDP, screenshots, arbitrary URL/text, chat send or permission changes.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {readPrivateJson} from '../stage2/workflow-capabilities.mjs';
import {projectComputerPolicy} from '../integrations/chatgpt-openclaw/agent.mjs';
import {ComputerTaskStore,operationId} from '../integrations/chatgpt-openclaw/computer-task-store.mjs';
import {chooseConnectedMacNode} from './openclaw-mac-visual.mjs';
import {walkNativePayload} from './openclaw-cua-fixture-native-observe.mjs';
import {scopedCloseRequest,knownPreAdmissionNativeFailure} from './openclaw-cua-owned-session-guard.mjs';
const URL='https://chatgpt.com/plugins',CLI=join(homedir(),'.openclaw/bin/openclaw');
const parent=join(homedir(),'Library/Application Support/ioant-openclaw-ops');
const exec=promisify(execFile);
const cli=async args=>JSON.parse((await exec(CLI,args,{timeout:25000,maxBuffer:4*1024*1024,shell:false})).stdout);
function envelope(raw){
 const value=walkNativePayload(raw).find(v=>typeof v?.ok==='boolean'&&
  (v.details||v.observation||v.effect));
 if(!value||value.ok!==true)throw Error('native_action_not_verified');return value;
}
export function pluginWindow(raw){
 const rows=walkNativePayload(raw).filter(v=>v?.appName==='Google Chrome'&&typeof v.windowRef==='string'&&v.minimized!==true);
 const unique=[...new Map(rows.map(v=>[v.windowRef,v])).values()];
 const plugins=unique.filter(v=>/plugins/i.test(v.title??''));
 const selected=plugins.length===1?plugins:unique;
 if(selected.length!==1)throw Error('unique_chrome_window_required');return selected[0].windowRef;
}
export function pluginObservation(raw){
 const rows=walkNativePayload(raw);
 const observationIds=[...new Set(rows.map(v=>v?.observationId).filter(v=>typeof v==='string'))];
 if(observationIds.length!==1)throw Error('fresh_observation_required');
 const elements=[...new Map(rows.filter(v=>typeof v?.elementRef==='string').map(v=>[v.elementRef,v])).values()];
 const address=elements.filter(v=>/^(?:Address and search bar|地址和搜索栏|地址栏)$/i.test(v.label??''));
 const originVerified=address.length===1&&/text.?field|textbox/i.test(address[0].role??'')&&
  /^(?:https:\/\/)?chatgpt\.com\/plugins(?:[/?#].*)?$/.test(address[0].value??address[0].stringValue??'');
 const exact=(label)=>elements.filter(v=>v.label===label&&v.enabled!==false);
 const plugin=exact('OpenClaw Mac');
 const refresh=elements.filter(v=>/^(?:Refresh|刷新)$/.test(v.label??'')&&v.enabled!==false&&/button/i.test(v.role??''));
 return {observationId:observationIds[0],originVerified,plugin,refresh,
  tools:[...new Set(elements.map(v=>v.label).filter(v=>typeof v==='string'&&/^openclaw_[a-z_]+$/.test(v)))],
  publicLabels:[...new Set(elements.map(v=>v.label).filter(v=>typeof v==='string'&&/^(?:Plugins|Installed|OpenClaw Mac|Refresh|刷新|Tools|工具)$/.test(v)))]};
}
export async function pluginPageStep(mode,id,{call=cli,load=()=>readPrivateJson(join(homedir(),'.openclaw/openclaw.json')),
 store=new ComputerTaskStore(join(parent,'direct-plugin-page-actions'),parent),uuid=randomUUID,
 pause=ms=>new Promise(ok=>setTimeout(ok,ms))}={}){
 const base={audit:'IOANT_OPENCLAW_PLUGIN_PAGE',mode,modelInferenceInvoked:false,screenshotTaken:false,
  browserRelayUsed:false,chatMessageSent:false};
 let node,executionId,attempted=false,denied=false,claimed=false,result;
 let closeAcknowledged=false;
 try{
  if(!['inspect','open','details','refresh'].includes(mode)||mode!=='inspect'&&!operationId.test(id??''))throw Error('explicit_step_required');
  if(['OPENCLAW_PROFILE','OPENCLAW_CONFIG_PATH','OPENCLAW_STATE_DIR'].some(k=>process.env[k]))throw Error('custom_profile_not_supported');
  if(!projectComputerPolicy(await load()))throw Error('workflow_computer_policy_required');
  if(mode!=='inspect'){
   const digest=createHash('sha256').update(mode+'\n'+URL).digest('hex');
   const claim=await store.begin(id,digest);
   if(!claim.created)return {...base,state:'inconclusive',operationId:id,reason:'step_reserved_do_not_repeat'};
   claimed=true;
  }
  const status=await call(['nodes','status','--json']);node=chooseConnectedMacNode(status);
  const host=(status.result??status).nodes.find(n=>(n.nodeId??n.id)===node.id);
  if(host?.computerUse?.contractVersion!==2||host.computerUse.provider?.id!=='cua-computer')throw Error('native_cua_required');
  const needed=['list_windows','get_window_state',...(mode==='open'?['bring_to_front','key','type']:mode==='inspect'?[]:['left_click'])];
  if(!needed.every(a=>host.computerUse.actions?.includes(a)))throw Error('native_actions_not_advertised');
  executionId=uuid();
  const act=async params=>{
   const priorAttempted=attempted;attempted=true;
   try{return envelope(await call(['nodes','invoke','--node',node.id,'--command','computer.act','--params',JSON.stringify({...params,executionId}),'--json']));}
   catch(e){denied=knownPreAdmissionNativeFailure(e)&&!priorAttempted;throw e;}
  };
  const windowRef=pluginWindow(await act({action:'list_windows'}));
  const observe=async()=>pluginObservation(await act({action:'get_window_state',windowRef,includeScreenshot:false,maxElements:1600}));
  if(mode==='open'){
   await act({action:'bring_to_front',windowRef});
   await act({action:'key',windowRef,keys:'CMD+T',deliveryMode:'foreground'});
   let o=await observe();
   await act({action:'type',windowRef,observationId:o.observationId,text:URL,deliveryMode:'foreground'});
   o=await observe();
   await act({action:'key',windowRef,observationId:o.observationId,keys:'ENTER',deliveryMode:'foreground'});
   await pause(1800);
  }else if(mode==='details'||mode==='refresh'){
   const o=await observe();
   if(!o.originVerified)throw Error('plugins_origin_unverified');
   if(mode==='refresh'&&o.plugin.length===0)throw Error('plugin_identity_unverified');
   const targets=mode==='details'?o.plugin.filter(v=>/button|link/i.test(v.role??'')):o.refresh;
   if(targets.length!==1)throw Error('unique_control_required');
   await act({action:'left_click',windowRef,observationId:o.observationId,elementRef:targets[0].elementRef,deliveryMode:'foreground'});
   await pause(1200);
  }
  const o=await observe();
  result={...base,state:'observed',...(id?{operationId:id}:{}),originVerified:o.originVerified,
   pluginVisible:o.plugin.length>0,refreshControls:o.refresh.length,tools:o.tools,publicLabels:o.publicLabels,
   ...(mode==='refresh'?{refreshClickedOnce:true}: {})};
 }catch(e){result={...base,state:'inconclusive',...(id?{operationId:id}:{}),
  reason:/^[a-z_]+$/.test(e.message)?e.message:'native_step_failed_do_not_repeat'};}
 finally{
  if(node&&executionId&&attempted&&!denied){
   try{const closed=await call(scopedCloseRequest(node.id,executionId));closeAcknowledged=closed?.ok===true||closed?.result?.ok===true;}catch{}
  }
 }
 result={...result,ownExecutionCloseAcknowledged:closeAcknowledged};
 if(claimed){
  try{await store.finish(id,createHash('sha256').update(mode+'\n'+URL).digest('hex'),result);}
  catch{return {...base,state:'inconclusive',operationId:id,reason:'step_receipt_persistence_failed_do_not_repeat'};}
 }
 return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 const result=await pluginPageStep(args.length===1&&args[0]==='inspect'?'inspect':args.length===2?args[0]:'',args[1]);
 console.log(JSON.stringify(result));if(result.state!=='observed')process.exitCode=1;
}
