#!/usr/bin/env node
// Fixed, explicitly authorized ChatGPT Plugins setup steps through OpenClaw native CUA.
// No model, browser Relay/CDP, screenshots, arbitrary URL/text, chat send or permission changes.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {readPrivateJson} from '../stage2/workflow-capabilities.mjs';
import {redactFeedback} from '../stage2/protocol.mjs';
import {projectComputerPolicy} from '../integrations/chatgpt-openclaw/agent.mjs';
import {ComputerTaskStore,operationId} from '../integrations/chatgpt-openclaw/computer-task-store.mjs';
import {chooseConnectedMacNode} from './openclaw-mac-visual.mjs';
import {walkNativePayload} from './openclaw-cua-fixture-native-observe.mjs';
import {scopedCloseRequest,knownPreAdmissionNativeFailure} from './openclaw-cua-owned-session-guard.mjs';
const PLUGIN_URL='https://chatgpt.com/plugins',CLI=join(homedir(),'.openclaw/bin/openclaw');
const parent=join(homedir(),'Library/Application Support/ioant-openclaw-ops');
const exec=promisify(execFile);
const registeredTarget=async()=>JSON.parse(await readFile(new URL('../config/chat-projects.json',import.meta.url),'utf8'))
 .projects.find(p=>p.key==='alice-ai')?.chatUrl;
const cli=async args=>JSON.parse((await exec(CLI,args,{timeout:25000,maxBuffer:4*1024*1024,shell:false})).stdout);
export function nativeEnvelope(raw){
 // node.invoke's transport ACK is distinct from the nested native result.
 // CUA actionEnvelope intentionally returns {ok:true} when there is no detail/effect.
 if(raw?.command==='computer.act'&&raw.payload&&typeof raw.payload==='object'){
  if(raw.payload.ok!==true)throw Error('native_action_not_verified');return raw.payload;
 }
 const value=walkNativePayload(raw).find(v=>typeof v?.ok==='boolean'&&
  (v.details||v.observation||v.effect));
 if(!value||value.ok!==true)throw Error('native_action_not_verified');return value;
}
export function windowInventory(raw){
 const rows=walkNativePayload(raw).filter(v=>typeof v?.windowRef==='string');
 const unique=[...new Map(rows.map(v=>[v.windowRef,v])).values()];
 const chrome=unique.filter(v=>v.appName==='Google Chrome');
 const regular=v=>(v.bounds?.width??v.bounds?.w??0)>=400&&(v.bounds?.height??v.bounds?.h??0)>=250;
 return {windowCount:unique.length,
  chromeNames:[...new Set(unique.map(v=>v.appName).filter(v=>typeof v==='string'&&/chrome/i.test(v)&&v.length<80))],
  exactChromeCount:unique.filter(v=>v.appName==='Google Chrome').length,
  nonMinimizedChromeCount:unique.filter(v=>v.appName==='Google Chrome'&&v.minimized!==true).length,
  onScreenChromeCount:chrome.filter(v=>v.isOnScreen===true).length,
  regularChromeCount:chrome.filter(regular).length,
  onScreenRegularChromeCount:chrome.filter(v=>v.isOnScreen===true&&regular(v)).length,
  pluginsTitleHints:chrome.filter(v=>/plugins/i.test(v.title??'')).length,
  unnamedWindows:unique.filter(v=>typeof v.appName!=='string').length};
}
function visibleChromeWindows(raw){
 const rows=walkNativePayload(raw).filter(v=>v?.appName==='Google Chrome'&&typeof v.windowRef==='string'&&
  v.minimized!==true&&v.isOnScreen===true&&(v.bounds?.width??v.bounds?.w??0)>=400&&
  (v.bounds?.height??v.bounds?.h??0)>=250);
 return [...new Map(rows.map(v=>[v.windowRef,v])).values()];
}
export function pluginWindow(raw){
 const unique=visibleChromeWindows(raw);
 const plugins=unique.filter(v=>/plugins/i.test(v.title??''));
 const selected=plugins.length===1?plugins:unique;
 if(selected.length!==1)throw Error('unique_chrome_window_required');return selected[0].windowRef;
}
export async function selectPluginWindow(raw,readAddress,target){
 const candidates=visibleChromeWindows(raw);
 if(candidates.length===1)return candidates[0].windowRef;
 if(candidates.length===0||candidates.length>8)throw Error('unique_chrome_window_required');
 const expected=new globalThis.URL(target);
 if(expected.origin!=='https://chatgpt.com')throw Error('registered_chrome_target_required');
 const plugins=[],chats=[];
 for(const window of candidates){
  const r=pluginObservation(await readAddress(window.windowRef));
  if(r.originVerified)plugins.push(window.windowRef);
  if(r.addressUrl){
   const url=new globalThis.URL(r.addressUrl);
   if(url.origin===expected.origin&&url.pathname===expected.pathname)chats.push(window.windowRef);
  }
 }
 if(plugins.length===1)return plugins[0];
 if(plugins.length===0&&chats.length===1)return chats[0];
 throw Error('registered_chrome_window_unverified');
}
export function pluginObservation(raw){
 const rows=walkNativePayload(raw);
 const observationIds=[...new Set(rows.map(v=>v?.observationId).filter(v=>typeof v==='string'))];
 if(observationIds.length!==1)throw Error('fresh_observation_required');
 const elements=[...new Map(rows.filter(v=>typeof v?.elementRef==='string').map(v=>[v.elementRef,v])).values()];
 const address=elements.filter(v=>/^(?:Address and search bar|地址和搜索栏|地址栏)$/i.test(v.label??''));
 const originVerified=address.length===1&&/text.?field|textbox/i.test(address[0].role??'')&&
  /^(?:https:\/\/)?chatgpt\.com\/plugins(?:[/?#].*)?$/.test(address[0].value??address[0].stringValue??'');
 const value=address.length===1&&/text.?field|textbox/i.test(address[0].role??'')?(address[0].value??address[0].stringValue):null;
 const addressUrl=typeof value==='string'&&/^(?:https:\/\/)?chatgpt\.com\//.test(value)?
  (value.startsWith('https://')?value:'https://'+value):null;
 const exact=(label)=>elements.filter(v=>v.label===label&&v.enabled!==false);
 const plugin=exact('OpenClaw Mac');
 const refresh=elements.filter(v=>/^(?:Refresh|刷新)$/.test(v.label??'')&&v.enabled!==false&&/button|menu.?item/i.test(v.role??''));
 const menu=elements.filter(v=>v.label==='More actions'&&v.enabled!==false&&/button/i.test(v.role??''));
 return {observationId:observationIds[0],originVerified,addressUrl,plugin,refresh,menu,
  buttonHints:originVerified?elements.filter(v=>/button|link|menu.?item/i.test(v.role??'')&&
   /refresh|tools?|more|menu|actions?|connect|edit|settings?|manage|details|version|update|installed|permissions?|刷新|工具|更多|菜单|设置|管理|连接/i.test(v.label??'')&&
   !/^(?:Project actions|Chat actions|Show more|Relaunch|MCSManager|Open profile|Account|Profile)/i.test(v.label??''))
   .slice(0,30).map(v=>({role:v.role,label:redactFeedback(v.label).slice(0,100)})):[],
  tools:[...new Set(elements.map(v=>v.label).filter(v=>typeof v==='string'&&/^openclaw_[a-z_]+$/.test(v)))],
  publicLabels:[...new Set(elements.map(v=>v.label).filter(v=>typeof v==='string'&&/^(?:Plugins|Installed|OpenClaw Mac|Refresh|刷新|Tools|工具)$/.test(v)))]};
}
export async function pluginPageStep(mode,id,{call=cli,load=()=>readPrivateJson(join(homedir(),'.openclaw/openclaw.json')),
 store=new ComputerTaskStore(join(parent,'direct-plugin-page-actions'),parent),uuid=randomUUID,
 pause=ms=>new Promise(ok=>setTimeout(ok,ms)),target=registeredTarget}={}){
 const base={audit:'IOANT_OPENCLAW_PLUGIN_PAGE',mode,modelInferenceInvoked:false,screenshotTaken:false,
  browserRelayUsed:false,chatMessageSent:false};
 let node,executionId,attempted=false,denied=false,claimed=false,inputAttempted=false,result,windowScan,lastAction;
 const completedActions=[];
 let closeAcknowledged=false;
 try{
  if(!['inspect','windows','open','open-focused','details','menu','refresh'].includes(mode)||!['inspect','windows'].includes(mode)&&!operationId.test(id??''))throw Error('explicit_step_required');
  if(['OPENCLAW_PROFILE','OPENCLAW_CONFIG_PATH','OPENCLAW_STATE_DIR'].some(k=>process.env[k]))throw Error('custom_profile_not_supported');
  if(!projectComputerPolicy(await load()))throw Error('workflow_computer_policy_required');
  if(!['inspect','windows'].includes(mode)){
   const digest=createHash('sha256').update(mode+'\n'+PLUGIN_URL).digest('hex');
   const claim=await store.begin(id,digest);
   if(!claim.created)return {...base,state:'inconclusive',operationId:id,reason:'step_reserved_do_not_repeat'};
   claimed=true;
  }
  const status=await call(['nodes','status','--json']);node=chooseConnectedMacNode(status);
  const host=(status.result??status).nodes.find(n=>(n.nodeId??n.id)===node.id);
  if(host?.computerUse?.contractVersion!==2||host.computerUse.provider?.id!=='cua-computer')throw Error('native_cua_required');
  const needed=mode==='windows'?['list_windows']:['list_windows','get_window_state',
   ...(mode==='open'?['bring_to_front','key','type']:mode==='open-focused'?['key','type']:mode==='inspect'?[]:['left_click'])];
  if(!needed.every(a=>host.computerUse.actions?.includes(a)))throw Error('native_actions_not_advertised');
  executionId=uuid();
  const act=async params=>{
   const priorAttempted=attempted;attempted=true;
   lastAction=params.action;
   if(['bring_to_front','key','type','left_click'].includes(params.action))inputAttempted=true;
   try{const r=nativeEnvelope(await call(['nodes','invoke','--node',node.id,'--command','computer.act','--params',JSON.stringify({...params,executionId}),'--json']));
    completedActions.push(params.action);return r;}
   catch(e){denied=knownPreAdmissionNativeFailure(e)&&!priorAttempted;throw e;}
  };
  const windows=await act({action:'list_windows'});
  windowScan=windowInventory(windows);
  if(mode==='windows')result={...base,state:'observed'};
  else{
  const windowRef=await selectPluginWindow(windows,ref=>act({action:'get_window_state',windowRef:ref,
   includeScreenshot:false,maxElements:80,query:'Address and search bar'}),await target());
  const observe=async()=>pluginObservation(await act({action:'get_window_state',windowRef,includeScreenshot:false,maxElements:1600}));
  if(mode==='open'||mode==='open-focused'){
   if(mode==='open')await act({action:'bring_to_front',windowRef});
   await act({action:'key',windowRef,keys:'CMD+T',deliveryMode:'foreground'});
   let o=await observe();
   await act({action:'type',windowRef,observationId:o.observationId,text:PLUGIN_URL,deliveryMode:'foreground'});
   o=await observe();
   await act({action:'key',windowRef,observationId:o.observationId,keys:'ENTER',deliveryMode:'foreground'});
   await pause(1800);
  }else if(mode==='details'||mode==='menu'||mode==='refresh'){
   const o=await observe();
   if(!o.originVerified)throw Error('plugins_origin_unverified');
   if(mode!=='details'&&o.plugin.length===0)throw Error('plugin_identity_unverified');
   const targets=mode==='details'?o.plugin.filter(v=>/button|link/i.test(v.role??'')):mode==='menu'?o.menu:o.refresh;
   if(targets.length!==1)throw Error('unique_control_required');
   await act({action:'left_click',windowRef,observationId:o.observationId,elementRef:targets[0].elementRef,deliveryMode:'foreground'});
   await pause(1200);
  }
  const o=await observe();
  result={...base,state:'observed',...(id?{operationId:id}:{}),originVerified:o.originVerified,
   pluginVisible:o.plugin.length>0,refreshControls:o.refresh.length,tools:o.tools,publicLabels:o.publicLabels,buttonHints:o.buttonHints,
   ...(mode==='refresh'?{refreshClickedOnce:true}: {})};
  }
 }catch(e){result={...base,state:'inconclusive',...(id?{operationId:id}:{}),
  reason:/^[a-z_]+$/.test(e.message)?e.message:'native_step_failed_do_not_repeat'};}
 finally{
  if(node&&executionId&&attempted&&!denied){
   try{const closed=await call(scopedCloseRequest(node.id,executionId));closeAcknowledged=closed?.ok===true||closed?.result?.ok===true;}catch{}
  }
 }
 result={...result,...(windowScan?{windowScan}:{}),...(lastAction?{lastAction}:{}),completedActions,
  thisInvocationInputAttempted:inputAttempted,ownExecutionCloseAcknowledged:closeAcknowledged};
 if(claimed){
  try{await store.finish(id,createHash('sha256').update(mode+'\n'+PLUGIN_URL).digest('hex'),result);}
  catch{return {...base,state:'inconclusive',operationId:id,reason:'step_receipt_persistence_failed_do_not_repeat'};}
 }
 return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 const result=await pluginPageStep(args.length===1&&['inspect','windows'].includes(args[0])?args[0]:args.length===2?args[0]:'',args[1]);
 console.log(JSON.stringify(result));if(result.state!=='observed')process.exitCode=1;
}
