#!/usr/bin/env node
// User-approved, single-frontmost-window text injection.
// macOS System Events accessibility permission must be granted by operator.
// Unlike browser DOM tools this cannot confirm app message delivery.
import {lstat,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {boundChat,installedPlistBinding} from './ops-supervisor.mjs';

const HOME=homedir();
const DIR=join(HOME,'Library','Application Support','ioant-openclaw-ops');
const GRANT=join(DIR,'mac-window-grant.json');
const PLIST=join(HOME,'Library','LaunchAgents','com.ioant.openclaw.safe-watcher.plist');
const NAME=/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,47}$/;
const APP_ID=/^[A-Za-z0-9][A-Za-z0-9._-]{2,180}$/;
const ALIAS=/^[a-z][a-z0-9-]{0,47}$/;
const reply=(state,reason,extra={})=>({audit:'IOANT_MAC_WINDOW_TEXT',
 schemaVersion:1,state,reason,...extra});
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const owner=s=>typeof process.getuid!=='function'||s.uid===process.getuid();
const privateDir=s=>s.isDirectory()&&!s.isSymbolicLink()&&owner(s)&&(s.mode&0o077)===0;
const privateFile=s=>s.isFile()&&!s.isSymbolicLink()&&owner(s)&&(s.mode&0o077)===0;
const key=name=>name.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const validText=s=>typeof s==='string'&&s.trim()&&s.length<=1600&&
 Buffer.byteLength(s,'utf8')<=3600&&!/[\x00-\x1f\x7f]/.test(s);
const asString=x=>'"'+x.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';

async function privateContext(){
 if(!privateDir(await lstat(DIR)))throw Error('unsafe_dir');
 const stat=await lstat(PLIST);
 if(!privateFile(stat)||stat.size>20000)throw Error('unsafe_plist');
 const binding=installedPlistBinding(await readFile(PLIST,'utf8'));
 if(!binding||binding.kind!=='local')throw Error('unrecognized_plist');
 return binding;
}
async function currentGrant(){
 try{
  const st=await lstat(GRANT);
  if(!privateFile(st)||st.size>4096)return {state:'invalid'};
  const doc=JSON.parse(await readFile(GRANT,'utf8'));
  if(!obj(doc)||doc.version!==1||
   !/^[0-9a-f-]{36}$/i.test(doc.conversationId??'')||
   !Array.isArray(doc.apps)||doc.apps.length>12||
   doc.apps.some(a=>!obj(a)||!ALIAS.test(a.alias??'')||
    !NAME.test(a.name??'')||!APP_ID.test(a.bundleId??''))||
   new Set(doc.apps.map(x=>x.alias)).size!==doc.apps.length)
   return {state:'invalid'};
  return {state:'enabled',conversationId:doc.conversationId,apps:doc.apps};
 }catch(e){return {state:e?.code==='ENOENT'?'disabled':'invalid'};}
}
export async function inspectWindowAccess({conversationUrl,app}={}){
 try{
  const binding=await privateContext(), grant=await currentGrant();
  if(grant.state!=='enabled')return reply(grant.state,'local_app_authorization_required');
  const target=conversationUrl?boundChat(conversationUrl).conversationId:binding.conversationId;
  if(binding.conversationId!==grant.conversationId||target!==grant.conversationId)
   return reply('disabled','grant_bound_to_another_conversation');
  if(app&&!grant.apps.some(x=>x.alias===app))
   return reply('disabled','target_app_not_authorized');
  return reply('enabled','operator_approved',{
   apps:grant.apps.map(a=>a.alias),conversationId:grant.conversationId
  });
 }catch{return reply('blocked','app_grant_or_binding_unverified');}
}
function runOsascript(script,{timeout=20000}={}){
 return new Promise(resolveResult=>{
  let proc,done=false,timer;
  const complete=value=>{
   if(done)return;done=true;clearTimeout(timer);resolveResult(value);
  };
  try{
   proc=spawn('/usr/bin/osascript',['-'],{
    shell:false,stdio:['pipe','pipe','pipe'],
    env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME}});
  }catch{return complete({ok:false,reason:'spawn_failed'});}
  let stdout='',timedOut=false;
  proc.stdout.on('data',chunk=>{stdout=(stdout+chunk.toString()).slice(0,256)});
  // AppleScript error details can contain application identifiers or user text.
  proc.stderr.on('data',()=>{});
  proc.on('error',()=>complete({ok:false,reason:'osascript_unavailable'}));
  timer=setTimeout(()=>{timedOut=true;try{proc.kill('SIGKILL')}catch{}},timeout);
  proc.on('close',code=>complete({ok:!timedOut&&code===0,
   value:stdout.trim(),reason:timedOut?'ui_timeout':code===0?'ok':'ui_permission_or_focus_failure'}));
  proc.stdin.on('error',()=>{});
  proc.stdin.end(script);
 });
}
async function detectAppId(name,{run=runOsascript}={}){
 // App name is strictly ASCII, no AppleScript string interpolation escaping risk.
 const script='tell application "System Events"\n'+
  'set matches to (every application process whose name is '+asString(name)+')\n'+
  'if (count of matches) is not 1 then error number 9021\n'+
  'return bundle identifier of (item 1 of matches)\nend tell\n';
 const r=await run(script);
 return r.ok&&APP_ID.test(r.value)?r.value:null;
}
async function change(action,name){
 if(process.platform!=='darwin'||!process.stdin.isTTY||!process.stdout.isTTY)
  return reply('blocked','local_interactive_terminal_required');
 try{
  const binding=await privateContext(), prev=await currentGrant();
  if(prev.state==='invalid')return reply('blocked','invalid_grant');
  if(action==='disable'){
   if(prev.state==='enabled')await unlink(GRANT);
   return reply('disabled','operator_revoked');
  }
  if(action!=='enable'||!NAME.test(name??''))
   return reply('blocked','valid_running_app_name_required');
  const alias=key(name);
  if(!ALIAS.test(alias))return reply('blocked','invalid_app_alias');
  if(prev.state==='enabled'&&prev.conversationId!==binding.conversationId)
   return reply('blocked','grant_belongs_to_previous_conversation');
  const bundleId=await detectAppId(name);
  if(!bundleId)return reply('blocked','app_identity_or_accessibility_unavailable');
  const apps=(prev.apps??[]).filter(a=>a.alias!==alias);
  if(apps.some(a=>a.bundleId===bundleId)||apps.length>=12)
   return reply('blocked','duplicate_or_too_many_apps');
  apps.push({alias,name,bundleId});
  const payload={version:1,conversationId:binding.conversationId,apps};
  const temp=GRANT+'.pending-'+process.pid+'-'+randomBytes(5).toString('hex');
  try{
   await writeFile(temp,JSON.stringify(payload)+'\n',{flag:'wx',mode:0o600});
   if(!privateFile(await lstat(temp)))throw Error('untrusted_temp');
   await rename(temp,GRANT);
  }finally{try{await unlink(temp)}catch(e){if(e?.code!=='ENOENT')throw Error('cleanup_failed')}}
  const saved=await currentGrant();
  if(saved.state!=='enabled'||saved.conversationId!==binding.conversationId)
   return reply('blocked','grant_not_verified');
  return reply('enabled','app_authorized',{alias,apps:saved.apps.map(a=>a.alias)});
 }catch{return reply('blocked','local_app_authorization_failed');}
}
export function windowTextScript(app,text,submit){
 if(!obj(app)||!NAME.test(app.name??'')||!APP_ID.test(app.bundleId??'')||
  !validText(text)||typeof submit!=='boolean')throw Error('invalid_window_task');
 // The app was explicitly bound to a bundle ID via local interactive approval.
 // First check that the existing process is EXACTLY that app, then activate it.
 // This is a UI focus change, not a privilege elevation or app installation.
 return 'try\n'+
  'tell application "System Events"\n'+
  'set targetApps to (every application process whose name is '+asString(app.name)+')\n'+
  'if (count of targetApps) is not 1 then error number 9030\n'+
  'set targetApp to item 1 of targetApps\n'+
  'if (bundle identifier of targetApp) is not '+asString(app.bundleId)+' then error number 9032\n'+
  'if (count of windows of targetApp) is less than 1 then error number 9033\n'+
  'end tell\n'+
  'tell application id '+asString(app.bundleId)+' to activate\n'+
  'delay 0.25\n'+
  'tell application "System Events"\n'+
  'set frontReady to false\n'+
  'repeat 12 times\n'+
  'set focusedApp to (first application process whose frontmost is true)\n'+
  'if (name of focusedApp) is '+asString(app.name)+' and (bundle identifier of focusedApp) is '+asString(app.bundleId)+' then\n'+
  'set frontReady to true\n'+
  'exit repeat\n'+
  'end if\n'+
  'delay 0.2\n'+
  'end repeat\n'+
  'if frontReady is false then error number 9031\n'+
  'if (count of windows of focusedApp) is less than 1 then error number 9033\n'+
  // Prefer the textbox that retains focus after activating the right app.
  // If not a textbox, search the front window and select ONLY an unambiguous
  // single editable candidate. Search fields are excluded from auto-selection.
  'set inputReady to false\n'+
  'try\n'+
  'set focusedItem to value of attribute "AXFocusedUIElement" of focusedApp\n'+
  'set uiRole to value of attribute "AXRole" of focusedItem\n'+
  'if uiRole is "AXTextArea" or uiRole is "AXTextField" or uiRole is "AXComboBox" then set inputReady to true\n'+
  'end try\n'+
  'if inputReady is false then\n'+
  'set editableItems to {}\n'+
  'try\n'+
  'set uiItems to entire contents of front window of focusedApp\n'+
  'if (count of uiItems) > 1200 then error number 9035\n'+
  'repeat with uiItem in uiItems\n'+
  'try\n'+
  'set roleName to value of attribute "AXRole" of uiItem\n'+
  'if roleName is "AXTextArea" or roleName is "AXTextField" then\n'+
  'set end of editableItems to contents of uiItem\n'+
  'end if\n'+
  'end try\n'+
  'end repeat\n'+
  'end try\n'+
  'if (count of editableItems) is not 1 then error number 9034\n'+
  'set focusedItem to item 1 of editableItems\n'+
  'set focused of focusedItem to true\n'+
  'set actualFocused to value of attribute "AXFocusedUIElement" of focusedApp\n'+
  'set actualRole to value of attribute "AXRole" of actualFocused\n'+
  'if actualRole is not "AXTextArea" and actualRole is not "AXTextField" then error number 9034\n'+
  'end if\n'+
  // Recheck foreground app immediately before keystrokes to avoid cross-app
  // delivery if the user switches windows while this task is running.
  'set finalApp to (first application process whose frontmost is true)\n'+
  'if (name of finalApp) is not '+asString(app.name)+' then error number 9031\n'+
  'if (bundle identifier of finalApp) is not '+asString(app.bundleId)+' then error number 9032\n'+
  'keystroke '+asString(text)+'\n'+
  (submit?'key code 36\n':'')+
  'return "IOANT_UI_KEYS_SENT"\nend tell\n'+
  'on error errMsg number errNum\n'+
  'if errNum is 9030 then return "IOANT_UI_ERR_APP_NOT_RUNNING"\n'+
  'if errNum is 9031 then return "IOANT_UI_ERR_TARGET_NOT_FRONTMOST"\n'+
  'if errNum is 9032 then return "IOANT_UI_ERR_APP_IDENTITY_MISMATCH"\n'+
  'if errNum is 9033 then return "IOANT_UI_ERR_NO_WINDOW"\n'+
  'if errNum is 9034 then return "IOANT_UI_ERR_INPUT_AMBIGUOUS"\n'+
  'if errNum is 9035 then return "IOANT_UI_ERR_UI_TREE_TOO_LARGE"\n'+
  'return "IOANT_UI_ERR_PERMISSION_OR_SCRIPT"\n'+
  'end try\n';
}

// Only the locally bound OpenClaw App has a proven WebArea/AXTextArea tree.
// Keep the old AppleScript path for other applications, unchanged.
export const OPENCLAW_NATIVE_BUNDLE='ai.openclaw.mac';
export const NATIVE_AX_HELPER=join(dirname(fileURLToPath(import.meta.url)),'openclaw-native-ax.swift');
export function focusedEditorKeysScript(app,text,submit){
 if(!obj(app)||!NAME.test(app.name??'')||!APP_ID.test(app.bundleId??'')||
  !validText(text)||typeof submit!=='boolean')throw Error('invalid_window_task');
 return 'tell application "System Events"\n'+
  'set p to first application process whose frontmost is true\n'+
  'if (name of p) is not '+asString(app.name)+' then error number 9031\n'+
  'if (bundle identifier of p) is not '+asString(app.bundleId)+' then error number 9032\n'+
  'set e to value of attribute "AXFocusedUIElement" of p\n'+
  'set r to value of attribute "AXRole" of e\n'+
  'if r is not "AXTextArea" and r is not "AXTextField" then error number 9034\n'+
  'keystroke '+asString(text)+'\n'+
  (submit?'key code 36\n':'')+
  'return "IOANT_UI_KEYS_SENT"\nend tell\n';
}
export function runNativeAX(mode,bundleId,{execute=spawn,timeout=32000}={}){
 if(!['focus','probe'].includes(mode)||bundleId!==OPENCLAW_NATIVE_BUNDLE)
  return Promise.resolve({ok:false,reason:'unsupported_native_app'});
 return new Promise(resolveResult=>{
  let done=false,proc,timer,output='',timedOut=false;
  const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolveResult(value)};
  try{
   proc=execute('/usr/bin/swift',[NATIVE_AX_HELPER,mode,bundleId],{
    shell:false,stdio:['ignore','pipe','pipe'],
    env:{HOME,PATH:'/usr/bin:/bin:/usr/sbin:/sbin'}});
  }catch{return finish({ok:false,reason:'native_launch_failed'})}
  proc.stdout.on('data',data=>{output=(output+String(data)).slice(-280)});
  // Never relay native crash dumps, raw UI strings, application text or stderr.
  proc.stderr.on('data',()=>{});
  proc.on('error',()=>finish({ok:false,reason:'native_launch_failed'}));
  timer=setTimeout(()=>{timedOut=true;try{proc.kill('SIGKILL')}catch{}},timeout);
  proc.on('close',code=>{
   const value=output.trim();
   if(!timedOut&&code===0&&
      (mode==='focus'?value==='AX_FOCUS_READY':value.startsWith('AX_PROBE_OK '))){
    return finish({ok:true,value});
   }
   const codes=new Set(['AX_BAD_ARGUMENTS','AX_BAD_MODE','AX_APP_NOT_ALLOWLISTED',
    'AX_NOT_TRUSTED','AX_APP_NOT_UNIQUE','AX_APP_NOT_RUNNING',
    'AX_WINDOW_NOT_UNIQUE','AX_TREE_BOUNDED','AX_EDITOR_NOT_FOUND',
    'AX_EDITOR_AMBIGUOUS','AX_EDITOR_DISABLED','AX_EDITOR_NOT_FOCUSABLE',
    'AX_EDITOR_NOT_EMPTY','AX_ACTIVATION_FAILED','AX_NOT_FRONTMOST',
    'AX_FOCUS_REJECTED','AX_FOCUS_UNVERIFIED','AX_FRONTMOST_CHANGED']);
   finish({ok:false,reason:timedOut?'native_ax_timeout':
    codes.has(value)?value.toLowerCase():'native_ax_script_or_permission_failure'});
  });
 });
}

export async function runWindowText(task,{conversationUrl,context=privateContext,
 readGrant=currentGrant,run=runOsascript,axRun=runNativeAX}={}){
 if(!obj(task)||task.action!=='mac-window-text'||!ALIAS.test(task.app??'')||
  !validText(task.text)||typeof task.submit!=='boolean')
  return {status:'approval_required',reason:'invalid_window_task'};
 let binding,grant;
 try{binding=await context();grant=await readGrant();}
 catch{return {status:'approval_required',reason:'gui_authorization_unverified'};}
 const requested=conversationUrl?boundChat(conversationUrl).conversationId:null;
 if(grant.state!=='enabled'||grant.conversationId!==binding.conversationId||
  requested!==binding.conversationId)
  return {status:'approval_required',reason:'gui_authorization_required'};
 const app=grant.apps.find(a=>a.alias===task.app);
 if(!app)return {status:'approval_required',reason:'target_app_not_authorized'};
 let script;try{
  script=app.bundleId===OPENCLAW_NATIVE_BUNDLE?
   focusedEditorKeysScript(app,task.text,task.submit):
   windowTextScript(app,task.text,task.submit);
 }catch{return {status:'approval_required',reason:'invalid_window_task'};}
 const start=Date.now();
 if(app.bundleId===OPENCLAW_NATIVE_BUNDLE){
  const focused=await axRun('focus',app.bundleId);
  if(!focused.ok)return {status:'inconclusive',reason:focused.reason,
   elapsedMs:Date.now()-start};
 }
 const r=await run(script);
 // A failed script may have partially typed or submitted. Never auto-retry.
 if(!r.ok||r.value!=='IOANT_UI_KEYS_SENT'){
  const reasons={
   IOANT_UI_ERR_APP_NOT_RUNNING:'target_app_not_running_or_ambiguous',
   IOANT_UI_ERR_TARGET_NOT_FRONTMOST:'target_not_frontmost_after_activation',
   IOANT_UI_ERR_APP_IDENTITY_MISMATCH:'registered_app_identity_mismatch',
   IOANT_UI_ERR_NO_WINDOW:'target_window_missing',
   IOANT_UI_ERR_INPUT_AMBIGUOUS:'target_input_unfocused_or_ambiguous',
   IOANT_UI_ERR_UI_TREE_TOO_LARGE:'accessibility_tree_too_large',
   IOANT_UI_ERR_PERMISSION_OR_SCRIPT:'accessibility_or_script_error'
  };
  return {status:'inconclusive',reason:reasons[r.value]??r.reason??'gui_delivery_unverified',
   elapsedMs:Date.now()-start};
 }
 return {status:'passed',elapsedMs:Date.now()-start,
  output:JSON.stringify({audit:'IOANT_MAC_WINDOW_TEXT',schemaVersion:1,
   app:task.app,state:'keys_sent',submitRequested:task.submit,
   deliveryConfirmed:false})};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 const result=args.length===1&&args[0]==='status'?await inspectWindowAccess():
  args.length===2&&args[0]==='enable'?await change('enable',args[1]):
  args.length===1&&args[0]==='disable'?await change('disable'):reply('blocked','usage_status_enable_app_or_disable');
 console.log(JSON.stringify(result));
 if(!['enabled','disabled'].includes(result.state))process.exitCode=1;
}
