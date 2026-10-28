#!/usr/bin/env node
// Read-only coarse URL categories for the already-owned Alice managed browser.
// Never open URLs or reveal raw browser URLs, titles, tab ids, tokens or cookies.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {realpathSync} from 'node:fs';
import {realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {parseProjectChatUrl} from '../stage2/project-chat-routing.mjs';
const exec=promisify(execFile);
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(homedir(),'Library','Application Support','ioant-openclaw-ops','runtime');
const CLI=join(homedir(),'.openclaw','bin','openclaw');
const AUDIT='IOANT_ALICE_MANAGED_TAB_CATEGORIES';
const PROJECT='g-p-6acaef839af081919426a885b3209f54';
const CHAT='6ade11a5-f0c0-83ec-add1-8a0cff00c938';
const CATEGORIES=['exactAliceChat','otherAliceProject','chatgptHome',
 'otherChatGPT','loginRelated','blankOrNewTab','otherOrigin','unknown'];
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const base=()=>({audit:AUDIT,schemaVersion:1,readOnly:true,
 profile:'alice-ai',browserTabMetadataRead:false,pageContentRead:false,
 rawUrlsEmitted:false,rawTitlesEmitted:false,credentialsRead:false,
 credentialsEmitted:false,browserNavigation:false,tabActivated:false,
 nativeComputerActInvoked:false,chatMessageSent:false,configChanged:false,
 ssrfRelaxed:false,coordinatorChanged:false,loginVerified:false});
export function categoryForTab(row){
 if(!plain(row)||typeof row.url!=='string'||row.url.length>4096)
  return 'unknown';
 let u;
 try{u=new URL(row.url)}catch{return 'unknown';}
 if(u.protocol==='about:'||u.protocol==='chrome:'||
  u.protocol==='chrome-untrusted:')return 'blankOrNewTab';
 const host=u.hostname.toLowerCase();
 const path=u.pathname.replace(/\/$/,'')||'/';
 if(u.protocol==='https:'&&['auth.openai.com','login.openai.com',
  'accounts.google.com'].includes(host))return 'loginRelated';
 if(u.protocol!=='https:'||host!=='chatgpt.com')return 'otherOrigin';
 if(path==='/auth'||path.startsWith('/auth/')||path==='/login'||
  path.startsWith('/login/'))return 'loginRelated';
 try{
  const chat=parseProjectChatUrl(row.url,{allowTracking:true});
  if(chat.projectId===PROJECT&&chat.conversationId===CHAT)
   return 'exactAliceChat';
  if(chat.projectId===PROJECT)return 'otherAliceProject';
 }catch{}
 const project=/^\/g\/(g-p-[a-f0-9]{32})(?:-[a-zA-Z0-9_-]+)?(?:\/|$)/.exec(path);
 if(project&&project[1]===PROJECT)return 'otherAliceProject';
 if(path==='/')return 'chatgptHome';
 return 'otherChatGPT';
}
export function summarizeTabCategories(status,raw){
 if(!plain(status)||status.profile!=='alice-ai'||status.driver!=='openclaw'||
  status.engine!=='chromium'||status.running!==true||
  status.headless!==false||status.cdpReady!==true||
  status.cdpPort!==18801||!Number.isSafeInteger(status.pid)||
  status.pid<=0)return {state:'blocked',reason:'managed_browser_unverified'};
 const body=raw?.result??raw;
 const rows=Array.isArray(body)?body:Array.isArray(body?.tabs)?body.tabs:null;
 if(!rows||rows.length>128)return {state:'inconclusive',
  reason:'tab_inventory_shape_unverified'};
 const categories=Object.fromEntries(CATEGORIES.map(k=>[k,0]));
 for(const row of rows)categories[categoryForTab(row)]++;
 return {state:'observed',tabCount:rows.length,categories,
  exactChatUnique:categories.exactAliceChat===1,
  reason:categories.exactAliceChat===1?'exact_chat_tab_present':
   categories.loginRelated>0?'login_related_page_observed':
   categories.chatgptHome>0?'chatgpt_home_observed':
   categories.otherChatGPT+categories.otherAliceProject>0?'other_chat_page_observed':
   categories.blankOrNewTab>0?'blank_or_new_tab_observed':
   categories.otherOrigin>0?'other_origin_observed':'tab_location_unresolved'};
}
export async function inspectAliceTabCategories({
 platform=process.platform,
 runtimeCheck=async()=>ROOT===RUNTIME&&await realpath(RUNTIME)===RUNTIME,
 call=async args=>{
  const {stdout}=await exec(CLI,args,{cwd:RUNTIME,timeout:18000,
   maxBuffer:1048576,shell:false});
  return JSON.parse(stdout);
 }}={}){
 const b=base();
 if(platform!=='darwin'||!await runtimeCheck().catch(()=>false))
  return {...b,state:'blocked',reason:'private_macos_runtime_required'};
 let status;
 try{status=await call(['browser','--browser-profile','alice-ai','--json','status']);}
 catch{return {...b,state:'inconclusive',reason:'managed_browser_status_unavailable'};}
 if(!plain(status)||status.profile!=='alice-ai'||status.driver!=='openclaw'||
  status.running!==true||status.cdpReady!==true||status.headless!==false||
  status.cdpPort!==18801||!Number.isSafeInteger(status.pid)||status.pid<=0)
  return {...b,state:'blocked',reason:'managed_browser_unverified'};
 let tabs;
 try{tabs=await call(['browser','--browser-profile','alice-ai','tabs','--json']);}
 catch{return {...b,state:'inconclusive',reason:'tab_inventory_unavailable'};}
 return {...b,browserTabMetadataRead:true,...summarizeTabCategories(status,tabs)};
}
if(process.argv[1]&&realpathSync(process.argv[1])===
 realpathSync(fileURLToPath(import.meta.url))){
 const r=process.argv.length===2?await inspectAliceTabCategories():
  {...base(),state:'blocked',reason:'unexpected_arguments'};
 console.log(JSON.stringify(r));
 if(r.state==='inconclusive')process.exitCode=1;
}
