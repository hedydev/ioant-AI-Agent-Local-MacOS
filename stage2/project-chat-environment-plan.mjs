// Pure, side-effect-free project-chat environment recovery planner.
// This module NEVER launches a browser, reads DOM, calls Chrome Relay/CDP,
// issues computer.act, types messages, or promotes a new chat binding.
// It combines independently attested evidence; browser-access policy wins.
import {parseProjectChatUrl} from './project-chat-routing.mjs';

const PRESENCE=new Set(['yes','no','unknown']);
const RELAY=new Set(['ready','unavailable','unknown']);
const ACCESS=new Set(['authorized','blocked','unavailable']);
const MAX_TABS=1000;
const reply=(state,nextAction,reason,extra={})=>Object.freeze({
 audit:'IOANT_PROJECT_CHAT_ENVIRONMENT_PLAN',schemaVersion:1,
 state,nextAction,reason,readOnly:true,executed:false,...extra
});
const count=x=>Number.isSafeInteger(x)&&x>=0&&x<=MAX_TABS;
const validEvidence=s=>s&&typeof s==='object'&&!Array.isArray(s);
function exactRoute(route){
 if(!validEvidence(route)||typeof route.chatUrl!=='string'||
    typeof route.key!=='string'||!/^[a-z][a-z0-9-]{2,60}$/.test(route.key))
  return null;
 try{
  const x=parseProjectChatUrl(route.chatUrl);
  return {projectId:x.projectId,conversationId:x.conversationId};
 }catch{return null;}
}
export function planProjectChatEnvironment({route,relay,chrome,visual,control}={}){
 const target=exactRoute(route);
 if(!target||!validEvidence(relay)||!RELAY.has(relay.state)||
    !validEvidence(chrome)||!PRESENCE.has(chrome.running)||
    !validEvidence(control)||!ACCESS.has(control.browser)||
    !ACCESS.has(control.computer))
  return reply('blocked','none','invalid_or_unverified_inputs');
 const exact=relay.exactMatches;
 const osExact=chrome.exactMatches;
 if(!count(exact)||!count(osExact)||typeof chrome.allWindowsScanned!=='boolean'||
    !validEvidence(visual)||!PRESENCE.has(visual.exactChatVisible)||
    !Number.isFinite(visual.ageSeconds)||visual.ageSeconds<0)
  return reply('blocked','none','invalid_or_unverified_inputs');

 const base={projectKey:route.key,targetConversationId:target.conversationId};
 const freshVisual=visual.ageSeconds<=60&&visual.exactChatVisible==='yes';
 const relayReady=relay.state==='ready';

 // A relay view cannot prove the absence of an actual Chrome tab.
 if(relayReady&&exact>1)
  return reply('blocked','manual_duplicate_identity_review','duplicate_relay_target',base);
 if(relayReady&&exact===1)
  return reply('ready','reuse_relay_target','exact_conversation_verified_in_relay',base);

 // The browser was visibly present or independently found, but invisible to
 // this relay. Do not make a second chat or switch to "recent" blindly.
 if(osExact>0||freshVisual)
  return reply('diagnostic','investigate_relay_registration',
   'existing_chrome_chat_not_visible_to_relay',
   {...base,osExactVerified:osExact>0,visualEvidenceFresh:freshVisual});

 // When a host blocks page automation, stop here. Never switch to CDP,
 // AppleScript, HTTP, computer.act or another browser surface as a fallback.
 if(control.browser==='blocked'||control.computer==='blocked')
  return reply('blocked','none','browser_or_computer_control_policy_block',base);

 if(chrome.running==='unknown'||!chrome.allWindowsScanned)
  return reply('needs_observation','inspect_all_chrome_windows',
   'absence_not_independently_confirmed',base);
 if(chrome.running==='no'){
  if(control.computer!=='authorized')
   return reply('needs_authorization','request_computer_authorization',
    'chrome_not_running',base);
  return reply('needs_action','request_authorized_launch_then_verify',
   'chrome_not_running',base);
 }
 if(chrome.running==='yes'&&chrome.allWindowsScanned&&osExact===0){
  if(control.browser!=='authorized')
   return reply('needs_authorization','request_browser_authorization',
    'target_chat_absent_in_complete_window_inventory',base);
  return reply('needs_action','request_authorized_exact_chat_open_then_verify',
   'target_chat_absent_in_complete_window_inventory',
   {...base,doNotAssumeMostRecent:true});
 }
 return reply('needs_observation','inspect_all_chrome_windows',
  'incomplete_evidence',base);
}
