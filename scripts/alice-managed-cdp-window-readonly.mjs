#!/usr/bin/env node
// Read-only CDP page inventory with native WindowServer owner verification.
// Work around CLI's incomplete tab list WITHOUT allowing CDP navigation,
// cookies, script evaluation, focus, browser mutation or ChatGPT sends.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {get as httpGet} from 'node:http';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {realpath} from 'node:fs/promises';
import {realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {summarizeManagedTarget} from './alice-managed-native-readiness.mjs';
import {inspectManagedWindowOwner} from './alice-managed-window-owner-readonly.mjs';
const exec=promisify(execFile);
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(homedir(),'Library','Application Support','ioant-openclaw-ops','runtime');
const CLI=join(homedir(),'.openclaw','bin','openclaw');
const PORT=18801;
const AUDIT='IOANT_ALICE_CDP_NATIVE_WINDOW_READINESS';
const base=()=>({audit:AUDIT,schemaVersion:1,readOnly:true,managedProfile:'alice-ai',
 source:'owned_local_cdp_target_metadata',rawUrlsEmitted:false,rawTitlesEmitted:false,
 tabIdsEmitted:false,credentialsRead:false,cookiesRead:false,
 chatContentRead:false,cdpScriptEvaluation:false,cdpWebSocketUsed:false,
 browserNavigation:false,tabActivated:false,focusChanged:false,
 nativeComputerActInvoked:false,desktopInput:false,chatMessageSent:false,
 proxyChanged:false,ssrfRelaxed:false,browserConfigChanged:false,
 aliceCoordinatorChanged:false,chatDeliveryAuthorized:false,
 composerIdentityVerified:false,targetPageInOwnedWindowVerified:false,
 loginVerified:false});
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function strictStatus(s){
 return plain(s)&&s.profile==='alice-ai'&&s.driver==='openclaw'&&
 s.engine==='chromium'&&s.running===true&&s.headless===false&&
 s.cdpReady===true&&s.cdpPort===PORT&&
 Number.isSafeInteger(s.pid)&&s.pid>0;
}
export function summarizeCdpEvidence(status,cliTabs,cdpTargets){
 if(!strictStatus(status))return {state:'blocked',reason:'managed_browser_identity_unverified'};
 if(!Array.isArray(cdpTargets)||cdpTargets.length<1||cdpTargets.length>128)
  return {state:'inconclusive',reason:'cdp_target_inventory_invalid'};
 const cli=summarizeManagedTarget(status,cliTabs);
 if(cli.state==='inconclusive')return {state:'inconclusive',reason:'cli_tab_inventory_invalid'};
 const pages=[];
 for(const t of cdpTargets){
  if(!plain(t)||typeof t.type!=='string')
   return {state:'inconclusive',reason:'cdp_target_type_missing'};
  if(t.type==='page'){
   if(typeof t.url!=='string'||t.url.length>4096)
    return {state:'inconclusive',reason:'cdp_page_url_shape_invalid'};
   pages.push({url:t.url});
  }
 }
 const exact=summarizeManagedTarget(status,{tabs:pages});
 const out={cdpTargetCount:cdpTargets.length,cdpPageTargetCount:pages.length,
  cdpExactPageMatches:exact.exactChatTabMatches,
  cliExactTabMatches:cli.exactChatTabMatches,
  cliCdpDisagree:cli.exactChatTabMatches!==exact.exactChatTabMatches};
 if(exact.exactChatTabMatches===0)
  return {...out,state:'blocked',reason:'cdp_exact_chat_page_absent'};
 if(exact.exactChatTabMatches!==1)
  return {...out,state:'blocked',reason:'cdp_exact_chat_page_not_unique'};
 return {...out,state:'cdp_exact_page_attested',
  reason:'one_exact_alice_project_chat_page_target'};
}
export async function readLocalCdpTargets(){
 return await new Promise((resolve,reject)=>{
  let buf='',size=0,finished=false;
  const done=(err,value)=>{
   if(finished)return;finished=true;
   if(err)reject(err);else resolve(value);
  };
  const req=httpGet({hostname:'127.0.0.1',port:PORT,
   path:'/json/list',method:'GET',timeout:3500,agent:false,
   headers:{Accept:'application/json'}},res=>{
   if(res.statusCode!==200){res.resume();done(Error('cdp_http_status'));return;}
   res.setEncoding('utf8');
   res.on('data',x=>{
    size+=Buffer.byteLength(x,'utf8');
    if(size>524288){res.destroy();done(Error('cdp_metadata_too_large'));return;}
    buf+=x;
   });
   res.on('end',()=>{
    try{done(null,JSON.parse(buf))}
    catch{done(Error('cdp_json_invalid'))}
   });
   res.on('error',e=>done(e));
  });
  req.on('timeout',()=>req.destroy(Error('cdp_timeout')));
  req.on('error',e=>done(e));
 });
}
export async function inspectCdpNativeWindow({
 platform=process.platform,
 runtimeCheck=async()=>ROOT===RUNTIME&&await realpath(RUNTIME)===RUNTIME,
 call=async args=>{
  const {stdout}=await exec(CLI,args,{cwd:RUNTIME,timeout:22000,
   maxBuffer:1048576,shell:false});
  return JSON.parse(stdout);
 },
 processRead=async pid=>{
  const {stdout}=await exec('/bin/ps',['-p',String(pid),'-o','command='],
   {timeout:6500,maxBuffer:262144,shell:false});
  return stdout;
 },
 cdpRead=readLocalCdpTargets,
 windowOwnerRead=inspectManagedWindowOwner
}={}){
 const b=base();
 if(platform!=='darwin'||!await runtimeCheck().catch(()=>false))
  return {...b,state:'blocked',reason:'private_macos_runtime_required'};
 let status;
 try{status=await call(['browser','--browser-profile','alice-ai','--json','status']);}
 catch{return {...b,state:'inconclusive',reason:'managed_browser_status_unavailable'};}
 if(!strictStatus(status))return {...b,state:'blocked',
  reason:'managed_browser_identity_unverified'};
 let processCommand;
 try{processCommand=await processRead(status.pid);}
 catch{return {...b,state:'inconclusive',reason:'managed_browser_pid_not_observable'};}
 // A tab inventory on a loopback port unrelated to the managed PID
 // must never be treated as the managed Alice browser.
 if(typeof processCommand!=='string'||
  !/(?:^|\s)--remote-debugging-port=18801(?:\s|$)/.test(processCommand))
  return {...b,state:'blocked',reason:'cdp_port_owner_not_attested'};
 let cliTabs,cdpTargets;
 try{
  cliTabs=await call(['browser','--browser-profile','alice-ai','tabs','--json']);
  cdpTargets=await cdpRead();
 }catch{return {...b,state:'inconclusive',reason:'browser_inventory_unavailable'};}
 const evidence=summarizeCdpEvidence(status,cliTabs,cdpTargets);
 if(evidence.state!=='cdp_exact_page_attested')return {...b,...evidence};
 // Use only CDP PAGE records for target evidence. The existing native
 // owner gate independently reads WindowServer by current managed PID,
 // verifies provider advertised capabilities, and performs zero input.
 const selected={tabs:cdpTargets.filter(t=>t.type==='page')
  .map(t=>({url:t.url}))};
 let owner;
 try{
  owner=await windowOwnerRead({
   platform,runtimeCheck,
   call:async args=>{
    if(args[0]==='browser'&&args.includes('tabs'))return selected;
    return call(args);
   }
  });
 }catch{return {...b,...evidence,state:'inconclusive',
  reason:'native_window_owner_read_unavailable'};}
 let latest;
 try{latest=await call(['browser','--browser-profile','alice-ai','--json','status']);}
 catch{return {...b,...evidence,state:'inconclusive',
  reason:'post_observation_browser_status_unavailable'};}
 if(!strictStatus(latest)||latest.pid!==status.pid)
  return {...b,...evidence,state:'blocked',reason:'managed_browser_pid_changed'};
 const safeOwner={
  windowOwnerAttested:owner?.windowOwnerAttested===true,
  ownedNormalWindowCount:Number.isInteger(owner?.ownedNormalWindowCount)?
   owner.ownedNormalWindowCount:null,
  ownedOnScreenWindowCount:Number.isInteger(owner?.ownedOnScreenWindowCount)?
   owner.ownedOnScreenWindowCount:null,
  nativeReadAdvertised:owner?.nativeReadAdvertised===true,
  backgroundSetValueAdvertised:owner?.backgroundSetValueAdvertised===true
 };
 const ready=owner?.state==='ready_for_native_window_ref_readonly'&&
  owner.windowOwnerAttested===true&&owner.exactChatTabMatches===1&&
  owner.nativeReadAdvertised===true;
 return {...b,...evidence,...safeOwner,
  state:ready?'ready_for_native_window_ref_readonly':'blocked',
  reason:ready?'cdp_page_and_managed_window_owner_attested':
   'native_window_owner_or_provider_not_ready'};
}
if(process.argv[1]&&realpathSync(process.argv[1])===
 realpathSync(fileURLToPath(import.meta.url))){
 const r=process.argv.length===2?await inspectCdpNativeWindow():
  {...base(),state:'blocked',reason:'unexpected_arguments'};
 console.log(JSON.stringify(r));
 if(r.state==='inconclusive')process.exitCode=1;
}
