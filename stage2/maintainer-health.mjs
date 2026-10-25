// Fixed, evidence-only OpenClaw Maintainer diagnostic and ChatGPT report.
// No browser mutation, profile repair, restart, arbitrary shell or Agent tools.
// Evidence can be queued separately if the exact chat browser route is unavailable.
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {parseProjectChatUrl,validateProjectRoutes} from './project-chat-routing.mjs';
const run=promisify(execFile);
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const REGISTRY=join(ROOT,'config','chat-projects.json');
const OC=join(homedir(),'.openclaw','bin','openclaw');
const AUDIT='IOANT_OPENCLAW_MAINTAINER_HEALTH';
const STATES=new Set(['ok','failed','unknown']);
const noSecrets=s=>typeof s==='string'&&s.length<=32&&/^[a-z0-9_-]+$/.test(s);
const readJson=x=>{try{return JSON.parse(x)}catch{return null}};
const status=x=>STATES.has(x)?x:'unknown';

// Only compare strict ChatGPT Project and conversation identifiers. Never
// serialize titles, other tab URLs, DOM, Gateway keys, or diagnostic stdout.
export function summarizeVisibleTabs(raw,project){
 const value=readJson(raw);
 const tabs=Array.isArray(value)?value:value?.tabs??value?.result?.tabs;
 if(!Array.isArray(tabs)||tabs.length>1000)return {state:'unknown',reason:'invalid_tabs'};
 let matching=0;
 for(const tab of tabs){
   try{
     const chat=parseProjectChatUrl(tab?.url,{allowTracking:true});
     if(chat.projectId===project.projectId&&chat.conversationId===project.conversationId)matching++;
   }catch{/* Ignore other tabs without inspecting their contents. */}
 }
 return {state:'ok',visibleTabs:tabs.length,matchingTabs:matching};
}
export function assessMaintainerHealth({project,checks}={}){
 if(!project||!checks)return {state:'blocked',reason:'missing_evidence'};
 const ext=status(checks.extension),doctor=status(checks.doctor);
 const sup=checks.supervisor?.state??'unknown';
 const a=checks.tabSamples;
 if(!Array.isArray(a)||a.length!==2)return {state:'blocked',reason:'insufficient_tab_samples'};
 const valid=a.every(x=>x?.state==='ok'&&Number.isInteger(x.visibleTabs)&&
   x.visibleTabs>=0&&x.visibleTabs<=1000&&Number.isInteger(x.matchingTabs)&&
   x.matchingTabs>=0&&x.matchingTabs<=x.visibleTabs);
 const duplicates=valid&&a.some(x=>x.matchingTabs>1);
 const bothMissing=valid&&a.every(x=>x.matchingTabs===0);
 const allEmpty=valid&&a.every(x=>x.visibleTabs===0);
 let finding='inconclusive',priority='investigate';
 if(duplicates){finding='duplicate_target_tabs';priority='blocked'}
 else if(valid&&a.every(x=>x.matchingTabs===1)&&doctor==='ok'){
   finding='target_visible';priority='normal';
 }else if(ext==='failed'||doctor==='failed'){
   finding='browser_or_gateway_diagnostic_failed';priority='investigate';
 }else if(allEmpty){finding='relay_reports_zero_tabs';priority='investigate'}
 else if(bothMissing){finding='registered_chat_unavailable';priority='investigate'}
 const actions=['read_only_recheck'];
 if(priority==='blocked')actions.push('operator_review_duplicate_tabs');
 else if(finding==='relay_reports_zero_tabs'||finding==='browser_or_gateway_diagnostic_failed')
   actions.push('operator_review_extension_access');
 else if(finding==='registered_chat_unavailable')actions.push('operator_review_target_tab');
 if(sup!=='running')actions.push('operator_review_watcher_state');
 return {audit:AUDIT,schemaVersion:1,state:'assessed',projectKey:project.key,
  projectId:project.projectId,conversationId:project.conversationId,
  finding,priority,checks:{extension:ext,doctor,watcher:sup,
    tabSamples:valid?a.map(x=>({visibleTabs:x.visibleTabs,matchingTabs:x.matchingTabs})):[]},
  recommendedActions:actions,autoChanged:false,permissionsChanged:false,
  reportDelivery:'not_attempted',note:
   'A zero-tab relay snapshot is not proof of user permission revocation. Never bypass Chrome pause or debugger Cancel.'};
}
export function formatMaintainerChatReport(report){
 if(report?.audit!==AUDIT||report.state!=='assessed'||!noSecrets(report.projectKey)||
    !/^[a-z0-9_-]{15,100}$/.test(report.conversationId??''))
   throw Error('invalid_maintainer_report');
 const payload={audit:report.audit,schemaVersion:1,projectKey:report.projectKey,
  conversationId:report.conversationId,finding:report.finding,
  priority:report.priority,checks:report.checks,
  recommendedActions:report.recommendedActions,autoChanged:false};
 return '[IOANT-OPENCLAW MAINTAINER REPORT]\n'+JSON.stringify(payload)+
  '\n请负责该项目的 ChatGPT 判断原因并选择下一项安全诊断操作。尚未获得执行授权时不要自动修改 Chrome、Gateway 或 watcher。';
}
// The caller provides FIXED command selectors, never model-supplied argv.
export async function collectMaintainerHealth({manifest,projectKey,invoke}={}){
 let route;
 try{route=validateProjectRoutes(manifest).find(x=>x.key===projectKey)}
 catch{return {audit:AUDIT,state:'blocked',reason:'invalid_registry'}}
 if(!route)return {audit:AUDIT,state:'blocked',reason:'unregistered_project'};
 if(typeof invoke!=='function')return {audit:AUDIT,state:'blocked',reason:'unavailable_runner'};
 const limited=async kind=>{
   try{
     const result=await invoke(kind);
     return result&&typeof result.stdout==='string'&&result.stdout.length<=131072?
      {state:result.state==='ok'?'ok':'failed',stdout:result.stdout}:{state:'unknown',stdout:''};
   }catch{return {state:'failed',stdout:''}}
 };
 const extension=await limited('extension_status');
 const doctor=await limited('browser_doctor');
 const supervisor=await limited('watcher_status');
 // Two independent samples; no automatic retry or repair commands.
 const a=await limited('chrome_tabs');
 const b=await limited('chrome_tabs');
 const sup=readJson(supervisor.stdout);
 return assessMaintainerHealth({project:route,checks:{
  extension:extension.state,doctor:doctor.state,
  supervisor:{state:sup?.audit==='IOANT_MAC_OPS_SUPERVISOR'?
    (sup.running===true?'running':sup.state??'unknown'):'unknown'},
  tabSamples:[a,b].map(x=>x.state==='ok'?
   summarizeVisibleTabs(x.stdout,route):{state:'unknown',reason:'browser_tabs_unavailable'})
 }});
}
const COMMANDS=Object.freeze({
 extension_status:{bin:OC,args:['browser','extension','status','--json']},
 browser_doctor:{bin:OC,args:['browser','doctor','--browser-profile','chrome']},
 watcher_status:{bin:process.execPath,args:[join(ROOT,'stage2','ops-supervisor.mjs'),'status']},
 chrome_tabs:{bin:OC,args:['browser','--browser-profile','chrome','--json','tabs']}
});
async function cli(argv){
 if(argv.length!==2||argv[0]!=='inspect'||!/^[a-z][a-z0-9-]{2,60}$/.test(argv[1]))
   return {audit:AUDIT,state:'blocked',reason:'invalid_arguments'};
 const raw=await readFile(REGISTRY,'utf8');
 if(raw.length>16384)throw Error('registry_overflow');
 const manifest=JSON.parse(raw);
 const invoke=async kind=>{
   const plan=COMMANDS[kind];
   if(!plan)throw Error('command_denied');
   try{
     const result=await run(plan.bin,plan.args,{cwd:ROOT,timeout:30000,maxBuffer:131072,
       env:{...process.env}});
     return {state:'ok',stdout:result.stdout};
   }catch{return {state:'failed',stdout:''}}
 };
 return collectMaintainerHealth({manifest,projectKey:argv[1],invoke});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const report=await cli(process.argv.slice(2));
   console.log(JSON.stringify(report))}
 catch{console.log(JSON.stringify({audit:AUDIT,state:'blocked',reason:'diagnostic_unavailable'}));
   process.exitCode=1}
}
export {cli as runMaintainerHealth};
