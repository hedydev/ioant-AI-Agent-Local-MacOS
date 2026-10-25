// One registered Project/Chat's crash-resumable Maintainer notice.
// Pure transformations only; no browser calls, writes, permissions or Agent tools.
import {randomUUID} from 'node:crypto';

const ID=/^maintainer-[0-9a-f]{12}$/;
const CHAT=/^[A-Za-z0-9-]{15,100}$/;
const PROJECT=/^[a-z][a-z0-9-]{2,60}$/;
const REASONS=new Set(['relay_zero_tabs']);
const STAGES=new Set(['prepared','press_intent']);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);

export function validateMaintainerNotice(value,{projectKey,conversationId}={}){
 if(!object(value)||Object.keys(value).sort().join('|')!==[
   'conversationId','id','observedAt','phase','projectKey','reason'
  ].sort().join('|')||!ID.test(value.id)||!PROJECT.test(value.projectKey)||
  !CHAT.test(value.conversationId)||!REASONS.has(value.reason)||
  !STAGES.has(value.phase)||typeof value.observedAt!=='string'||
  !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.observedAt)||
  !Number.isFinite(Date.parse(value.observedAt))||
  value.projectKey!==projectKey||value.conversationId!==conversationId)
   throw Error('invalid_maintainer_notice');
 return value;
}

// A trusted Mac watcher may call this only after two consecutive independent
// zero-tab snapshots. A durable pending notice is never overwritten.
export function enqueueZeroTabNotice(state,{projectKey,conversationId,observedAt=new Date().toISOString(),id}={}){
 if(!object(state)||!PROJECT.test(projectKey??'')||!CHAT.test(conversationId??'')||
    typeof observedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(observedAt)||
    !Number.isFinite(Date.parse(observedAt)))throw Error('untrusted_maintainer_incident');
 if(state.maintainerNotice){
   validateMaintainerNotice(state.maintainerNotice,{projectKey,conversationId});
   return {state,created:false};
 }
 const newId=id??'maintainer-'+randomUUID().replace(/-/g,'').slice(0,12);
 const notice={id:newId,projectKey,conversationId,reason:'relay_zero_tabs',
  observedAt,phase:'prepared'};
 validateMaintainerNotice(notice,{projectKey,conversationId});
 return {state:{...state,maintainerNotice:notice},created:true};
}
export function maintainerReceipt(notice,route){
 validateMaintainerNotice(notice,route);
 return '[IOANT-OPENCLAW MAINTAINER NOTICE '+notice.id+']';
}
export function maintainerNoticeMessage(notice,route){
 const receipt=maintainerReceipt(notice,route);
 return receipt+'\n'+
   'Audit: IOANT_OPENCLAW_MAINTAINER_RECOVERY_NOTICE\n'+
   'Project: '+notice.projectKey+'\n'+
   'Conversation ID: '+notice.conversationId+'\n'+
   'Observed at: '+notice.observedAt+'\n'+
   'Finding: the local authorized Chrome Relay returned zero visible tabs in at least two successive watcher checks.\n'+
   'Current state: the exact authorized ChatGPT conversation became visible again so this notice can be sent.\n'+
   'Limitations: an empty tab list does not prove permission revocation, user pause, model health or Agent task completion.\n'+
   'No Chrome settings, debugger attachments, Gateway, permissions, or other projects were automatically changed.\n'+
   'Please analyze this incident and request a fixed read-only openclaw-maintainer-health task only if further evidence is needed.';
}
export function markMaintainerPressIntent(state,route){
 const n=validateMaintainerNotice(state?.maintainerNotice,route);
 if(n.phase!=='prepared')throw Error('maintainer_send_uncertain_no_replay');
 return {...state,maintainerNotice:{...n,phase:'press_intent'}};
}
export function completeMaintainerNotice(state,route){
 validateMaintainerNotice(state?.maintainerNotice,route);
 const next={...state};
 delete next.maintainerNotice;
 return next;
}
export function pendingMaintainerPhase(state,route){
 if(!state?.maintainerNotice)return 'none';
 return validateMaintainerNotice(state.maintainerNotice,route).phase;
}
