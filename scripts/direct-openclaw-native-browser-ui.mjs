#!/usr/bin/env node
// Authorized Chrome UI inspection and one pinned OpenClaw toolbar click. No page input.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {resolve,join} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {executionEnvironment} from '../integrations/chatgpt-openclaw/project-execution-command.mjs';
import {chooseConnectedMacNode} from './openclaw-mac-visual.mjs';
import {scopedCloseRequest,knownPreAdmissionNativeFailure} from './openclaw-cua-owned-session-guard.mjs';
const exec=promisify(execFile),CLI='/Users/ted/.openclaw/bin/openclaw';
export function nativeObjects(raw){
 const out=[],queue=[raw],seen=new Set();
 while(queue.length&&out.length<10000){
  const x=queue.shift();if(!x)continue;
  if(typeof x==='string'){if(x.length<2097152&&/^\s*[\[{]/.test(x))try{queue.push(JSON.parse(x));}catch{};continue;}
  if(typeof x!=='object'||seen.has(x))continue;seen.add(x);out.push(x);
  for(const [key,value] of Object.entries(x))if(!['base64','screenshot','image'].includes(key))queue.push(value);
 }
 return out;
}
export function chromeWindows(raw){return [...new Map(nativeObjects(raw).filter(x=>x.appName==='Google Chrome'&&typeof x.windowRef==='string').map(x=>[x.windowRef,x])).values()];}
export function nativeBrowserControls(raw){
 return [...new Map(nativeObjects(raw).filter(x=>typeof x.elementRef==='string').map(x=>[x.elementRef,x])).values()].filter(x=>typeof x.elementRef==='string').map(x=>({
  labels:[x.label,x.title,x.accessibilityLabel,x.name,x.description].filter(v=>typeof v==='string'&&v.trim()),
  role:x.role,enabled:x.enabled,
  ...(typeof x.value==='boolean'||x.value===0||x.value===1||x.value==='0'||x.value==='1'?{value:x.value}:{})
 })).filter(x=>x.labels.some(v=>/OpenClaw|Extension|扩展|Debug|调试|Browser|浏览器|Settings|设置|Address|地址/i.test(v))).slice(0,80);
}
async function cli(args){return JSON.parse((await exec(CLI,args,{env:executionEnvironment(),timeout:30000,maxBuffer:2097152})).stdout);}
export function extensionPopupControls(raw){
 const lists=nativeObjects(raw).filter(x=>Array.isArray(x.elements)&&x.elements.some(e=>typeof e.elementRef==='string')).map(x=>x.elements);
 for(const list of lists){
  const start=list.findIndex(e=>e.role==='AXWebArea'&&e.label==='OpenClaw');
  if(start<0)continue;
  return list.slice(start,start+80).map(e=>({role:e.role,label:e.label,
   ...(typeof e.value==='boolean'||['0','1'].includes(e.value)?{value:e.value}:{})}));
 }
 return [];
}
export function extensionToolbarTarget(raw){
 const all=[...new Map(nativeObjects(raw).filter(x=>typeof x.elementRef==='string').map(x=>[x.elementRef,x])).values()];
 const address=all.filter(x=>x.role==='AXTextField'&&x.label==='Address and search bar');
 if(address.length!==1||!['chatgpt.com/plugins','https://chatgpt.com/plugins','https://chatgpt.com/plugins/'].includes(address[0].value))throw Error('native_plugin_page_unverified');
 const rows=all.filter(x=>x.role==='AXPopUpButton'&&x.label==='OpenClaw');
 const observations=[...new Set(nativeObjects(raw).map(x=>x.observationId).filter(x=>typeof x==='string'))];
 if(rows.length!==1||observations.length!==1)throw Error('unique_extension_toolbar_target_required');
 return {elementRef:rows[0].elementRef,observationId:observations[0]};
}
export function pluginTabAllowTarget(raw){
 extensionToolbarTarget(raw);
 const list=nativeObjects(raw).find(x=>Array.isArray(x.elements)&&x.elements.some(e=>e.role==='AXWebArea'&&e.label==='OpenClaw'))?.elements;
 if(!list)throw Error('openclaw_extension_popup_required');
 const start=list.findIndex(e=>e.role==='AXWebArea'&&e.label==='OpenClaw');
 const rows=list.slice(start).filter(e=>e.role==='AXButton'&&e.label==='Allow on this tab');
 const observations=[...new Set(nativeObjects(raw).map(x=>x.observationId).filter(x=>typeof x==='string'))];
 if(rows.length!==1||observations.length!==1)throw Error('unique_tab_allow_control_required');
 return {elementRef:rows[0].elementRef,observationId:observations[0]};
}
export async function nativeBrowserInspect({openExtensionOperation,allowPluginOperation}={}){
 let node,id,attempted=false,skipClose=false,result,journal,clickAttempted=false;
 const operation=openExtensionOperation??allowPluginOperation;
 if(operation){
  if(!/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(operation))throw Error('native_operation_id_required');
  journal=join('/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos/verification',operation+'.json');
  try{const old=JSON.parse(await readFile(journal,'utf8'));return {...old,cached:true,doNotRepeat:true};}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 try{
  const status=await cli(['nodes','status','--json']);node=chooseConnectedMacNode(status).id;
  const row=(status.nodes??status.result?.nodes??[]).find(x=>(x.nodeId??x.id)===node);
  if(row?.computerUse?.contractVersion!==2||row?.computerUse?.provider?.id!=='cua-computer')throw Error('native_provider_unverified');
  id=randomUUID();
  const native=async(action,params={})=>{attempted=true;return cli(['nodes','invoke','--node',node,'--command','computer.act','--params',JSON.stringify({action,executionId:id,...params}),'--json']);};
  const windows=chromeWindows(await native('list_windows'));
  result={state:'observed',chromeWindowCount:windows.length,desktopInput:false,screenshotTaken:false,
   windowMetadata:windows.map((w,i)=>({ordinal:i,isOnScreen:w.isOnScreen,minimized:w.minimized,zIndex:w.zIndex,
    width:w.bounds?.width,height:w.bounds?.height,
    titleClass:/安全重新绑定平台主管 Worker/.test(w.title??'')?'workflow':/Plugins/.test(w.title??'')?'plugins':/OpenClaw/.test(w.title??'')?'openclaw':'other'}))};
  const target=windows.filter(w=>w.isOnScreen===true&&/^Plugins(?: \| ChatGPT)?/.test(w.title??''));
  if(target.length===1){
   let raw=await native('get_window_state',{windowRef:target[0].windowRef,includeScreenshot:false});
   if(operation){
    const proof=allowPluginOperation?pluginTabAllowTarget(raw):extensionToolbarTarget(raw);
    await writeFile(journal,JSON.stringify({state:'click_intent',doNotRepeat:true})+'\n',{mode:0o600,flag:'wx'});
    clickAttempted=true;
    await native('left_click',{windowRef:target[0].windowRef,...proof,deliveryMode:'foreground'});
    raw=await native('get_window_state',{windowRef:target[0].windowRef,includeScreenshot:false});
    result.desktopInput=true;result.uiClickAttempted=allowPluginOperation?'allow_plugins_tab':'open_extension';
   }
   result.controls=nativeBrowserControls(raw);result.popupControls=extensionPopupControls(raw);result.knownWorkflowTabs=[...new Map(nativeObjects(raw).filter(e=>typeof e.elementRef==='string'&&/安全重新绑定平台主管 Worker/.test(e.label??'')).map(e=>[e.elementRef,{role:e.role,label:e.label}])).values()];result.targetClass='plugins';
  }else if(operation)throw Error('unique_plugin_window_required');
 }catch(e){
  skipClose=knownPreAdmissionNativeFailure(e);
  const raw=String(e.stderr??'')+' '+String(e.stdout??'');
  result={state:clickAttempted?'inconclusive':'blocked',desktopInput:clickAttempted,screenshotTaken:false,
   signals:[...new Set(raw.match(/\b(?:COMPUTER|ACCESSIBILITY|SCREEN|BROWSER)_[A-Z_]+\b/g)??[])],
   reason:/^[a-z_]+$/.test(e.message)?e.message:'native_browser_ui_unavailable'};
 }finally{
  if(node&&id&&attempted&&!skipClose){
   try{const r=await cli(scopedCloseRequest(node,id));result.ownCloseAcknowledged=r.ok===true||r.result?.ok===true;}catch{result.ownCloseAcknowledged=false;}
  }
 }
 if(journal&&clickAttempted)await writeFile(journal,JSON.stringify({...result,doNotRepeat:true})+'\n',{mode:0o600});
 return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length===2)console.log(JSON.stringify(await nativeBrowserInspect()));
 else if(process.argv.length===4&&['--open-extension','--allow-plugin-tab'].includes(process.argv[2]))console.log(JSON.stringify(await nativeBrowserInspect(process.argv[2]==='--open-extension'?{openExtensionOperation:process.argv[3]}:{allowPluginOperation:process.argv[3]})));
 else{console.log('{"state":"blocked","reason":"invalid_native_ui_action"}');process.exitCode=1;}
}
