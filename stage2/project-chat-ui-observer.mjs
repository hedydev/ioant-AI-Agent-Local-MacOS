// Browser-only, opt-in, one-time, EXACT REGISTERED ChatGPT Project observation.
// Never click, navigate, read chat text, capture input, or infer token percentages.
import {parseProjectChatUrl,resolveProjectRoute,validateProjectRoutes} from './project-chat-routing.mjs';

export const UI_MARKER='IOANT_PROJECT_CHAT_UI_V1::';
const TITLE='IOANT_PROJECT_CHAT_UI_PROBE';
const targetHandle=x=>typeof x==='string'&&/^[A-Za-z0-9_:-]{1,128}$/.test(x);
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const safe=(state,props={})=>({audit:TITLE,schemaVersion:1,state,readOnly:true,
  createsChat:false,sendsMessages:false,changesAgent:false,...props});

// All page-side observations are purpose-built; no content from messages,
// assistant answers, arbitrary aria-labels, URLs, or input values is returned.
export function inspectProjectChatUi(doc=document,loc=location){
 const mark='IOANT_PROJECT_CHAT_UI_V1::';
 const selectors=['#prompt-textarea',
  '[data-testid="composer-input"][contenteditable="true"]',
  '[data-testid="prompt-textarea"][contenteditable="true"]',
  'form [contenteditable="true"][role="textbox"]'];
 const editor=selectors.some(s=>!!doc.querySelector(s));
 const controls=Array.from(doc.querySelectorAll(
   'button,a[href],[role="button"],[role="link"]')).slice(0,240);
 const names=new Set(['new chat','new conversation','新建对话','新聊天','创建聊天']);
 let newChatControls=0;
 for(const el of controls){
   // A conversation message quoting "New chat" is NOT an application control.
   if(el.closest?.('[data-message-author-role],[data-user-message-bubble],'+
      '[data-content-search-unit-key],[data-conversation-role]'))continue;
   const v=String(el.getAttribute?.('aria-label')||
      el.getAttribute?.('title')||el.textContent||'').trim().toLowerCase()
      .replace(/\s+/g,' ');
   if(v.length<=40&&names.has(v))newChatControls++;
 }
 // These signatures must appear as an application-level banner, never inside
 // a chat message or composer. Unknown layouts remain 'unknown' (not false).
 const explicit=[
  'you have reached the maximum length for this conversation',
  "you've reached the maximum length for this conversation",
  'this conversation has reached its maximum length',
  'this conversation has reached its length limit',
  '此对话已达到长度上限',
  '此对话已达到最大长度'
 ];
 let limit='unknown';
 for(const el of Array.from(doc.querySelectorAll('[role="alert"],[role="status"]')).slice(0,24)){
   if(el.closest?.('[data-message-author-role],[data-user-message-bubble],'+
       '[data-content-search-unit-key],[data-conversation-role],form'))continue;
   // Inspect only bounded text for known system banners. NEVER return it.
   // Enforce the bound BEFORE trim: trailing padding must never allow
   // oversized system/banner text to masquerade as a known exact signal.
   const rawText=String(el.textContent||'');
   if(rawText.length===0||rawText.length>220)continue;
   const val=rawText.trim().toLowerCase();
   if(val.length>0&&explicit.includes(val)){
     limit='explicit_limit_banner';
     break;
   }
 }
 return mark+JSON.stringify({url:String(loc.href),hasMain:!!doc.querySelector('main'),
   composerPresent:editor,newChatUiCandidates:Math.min(newChatControls,8),
   newChatCandidateTruncated:newChatControls>8,
   explicitContextLimit:limit,examinedControls:controls.length});
}

export const uiEvaluateFunction='() => ('+inspectProjectChatUi.toString()+')()';

function unwrap(v){
 if(typeof v==='string'){
  if(v.length>1024*128)return null;
  if(v.startsWith(UI_MARKER)){
   try{return JSON.parse(v.slice(UI_MARKER.length))}catch{return null}
  }
  try{return unwrap(JSON.parse(v))}catch{return null}
 }
 if(obj(v)){
  for(const key of ['value','result','data','text','output','content']){
   if(Object.hasOwn(v,key)){const found=unwrap(v[key]);if(found)return found}
  }
 }
 return null;
}
function verifiedFlags(value){
 return obj(value)&&Object.keys(value).length===7&&
  ['url','hasMain','composerPresent','newChatUiCandidates',
   'newChatCandidateTruncated','explicitContextLimit','examinedControls']
   .every(k=>Object.hasOwn(value,k))&&
   typeof value.hasMain==='boolean'&&typeof value.composerPresent==='boolean'&&
   Number.isSafeInteger(value.newChatUiCandidates)&&value.newChatUiCandidates>=0&&
   value.newChatUiCandidates<=8&&
   typeof value.newChatCandidateTruncated==='boolean'&&
   Number.isSafeInteger(value.examinedControls)&&value.examinedControls>=0&&
   value.examinedControls<=240&&
   ['unknown','explicit_limit_banner'].includes(value.explicitContextLimit);
}
function asTabs(raw){
 let v;
 try{v=JSON.parse(raw)}catch{throw Error('invalid_browser_tab_metadata')}
 const tabs=Array.isArray(v)?v:(v?.tabs??v?.result?.tabs);
 if(!Array.isArray(tabs)||tabs.length>1000)throw Error('invalid_browser_tab_metadata');
 return tabs;
}
function sameIdentity(url,expected){
 try{
  const u=parseProjectChatUrl(url,{allowTracking:true});
  return u.projectId===expected.projectId&&u.conversationId===expected.conversationId;
 }catch{return false}
}

// Caller must provide trusted repo-owned registry, never a registration from
// the model conversation or browser DOM. Browser callback is injectable solely
// for tests and the dedicated local CLI. One strict read-only evaluate max.
export async function observeProjectChatUi({manifest,projectKey,browser}={}){
 let route;
 try{
  route=validateProjectRoutes(manifest).find(x=>x.key===projectKey);
  if(!route||typeof browser!=='function')throw Error('unregistered_project');
 }catch{return safe('blocked',{reason:'unregistered_project'})}
 let tabs;
 try{tabs=asTabs(await browser('--json','tabs'))}
 catch{return safe('inconclusive',{projectKey,reason:'browser_tab_list_unavailable'})}
 const matches=tabs.filter(t=>sameIdentity(t?.url,route));
 const metadata={projectKey,projectId:route.projectId,
  conversationId:route.conversationId,visibleTabs:tabs.length,
  matchingConversationTabs:matches.length};
 if(matches.length===0)return safe('target_unavailable',metadata);
 if(matches.length!==1)return safe('blocked',{...metadata,reason:'duplicate_conversation_tabs'});
 const target=matches[0].suggestedTargetId??matches[0].tabId??matches[0].targetId;
 if(!targetHandle(target))return safe('blocked',{...metadata,reason:'unusable_target_handle'});
 let raw,parsed;
 try{
  raw=await browser('--json','evaluate','--target-id',target,'--fn',uiEvaluateFunction);
  if(typeof raw!=='string'||raw.length>1024*128)throw Error('unbounded');
  parsed=unwrap(raw);
 }catch{return safe('inconclusive',{...metadata,reason:'browser_read_unavailable'})}
 if(!verifiedFlags(parsed))return safe('inconclusive',{...metadata,reason:'unsafe_browser_result'});
 if(!sameIdentity(parsed.url,route))return safe('blocked',{...metadata,reason:'page_changed_during_observation'});
 return safe('observed',{...metadata,pageVerified:true,
   hasMain:parsed.hasMain,composerPresent:parsed.composerPresent,
   newChatUiCandidates:parsed.newChatUiCandidates,
   newChatCandidateTruncated:parsed.newChatCandidateTruncated,
   explicitContextLimit:parsed.explicitContextLimit,
   note:parsed.explicitContextLimit==='explicit_limit_banner'?
    'Known app-level limit banner matched. No automatic rollover action.':
    'No verified limit indication; remaining context cannot be estimated.'});
}
