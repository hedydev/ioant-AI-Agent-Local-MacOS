// Pure decision layer for independent per-chat Guard Worker.
// The input is host-observed metadata, NOT instructions from a ChatGPT turn.
import {parseProjectChatUrl} from './project-chat-routing.mjs';
const CODE=new Set(['watcher_stopped','feedback_unconfirmed','recent_watcher_stop',
 'relay_unavailable','service_unverifiable','private_state_unavailable']);
const VALID_PHASES=new Set(['prepared','press_intent','unknown']);
const OBSERVED=new Set(['running','stopped','unloaded','unknown']);
const DURATIONS={feedback:180,recent:180};
export function classifyGuardObservation(x){
 const identity=x?.identityVerified===true;
 const status=OBSERVED.has(x?.serviceState)?x.serviceState:'unknown';
 const pending=VALID_PHASES.has(x?.pendingPhase)?x.pendingPhase:'none';
 const age=Number.isFinite(x?.pendingAgeSeconds)&&x.pendingAgeSeconds>=0?
  x.pendingAgeSeconds:null;
 const log=x?.recentLogCode;
 const incidents=[];
 if(!identity||status==='unknown')incidents.push('service_unverifiable');
 else if(status==='stopped')incidents.push('watcher_stopped');
 if(x?.privateState==='unavailable')incidents.push('private_state_unavailable');
 if(pending!=='none'&&age!==null&&age>=DURATIONS.feedback)
  incidents.push('feedback_unconfirmed');
 if(x?.recentLogAgeSeconds!==null&&
    Number.isFinite(x?.recentLogAgeSeconds)&&x.recentLogAgeSeconds>=0&&
    x.recentLogAgeSeconds<=DURATIONS.recent){
  if(log==='stop')incidents.push('recent_watcher_stop');
  if(log==='relay')incidents.push('relay_unavailable');
 }
 return Object.freeze({
  serviceState:status,identityVerified:identity,
  feedbackPending:pending!=='none',feedbackPhase:pending,
  feedbackAgeBand:age===null?'unknown':age>=3600?'over_1h':
   age>=600?'over_10m':age>=180?'over_3m':'under_3m',
  incidentCodes:Object.freeze(incidents.filter(k=>CODE.has(k))),
  reportOnly:true,mayRestartWorker:false,mayReplayTask:false,
  mayRerouteChat:false,maySendChatMessage:false
 });
}
// An explicit same-Project destination is a *candidate*, never permission
// to deliver, stop a worker, transfer approvals, or promote a registry.
export function evaluateGuardHandoff({oldUrl,newUrl,
 operatorApproved=false,oldFeedbackClear=false,
 newProjectMembershipVerified=false,newChatReceiptVerified=false,
 oldWatcherStopped=false}={}){
 const base={audit:'IOANT_GUARD_HANDOFF_CHECK',schemaVersion:1,readOnly:true,
 changedBinding:false,createdChat:false,submittedHandoff:false,
 transferOfPermissions:false};
 let oldChat,newChat;
 try{
  oldChat=parseProjectChatUrl(oldUrl);
  newChat=parseProjectChatUrl(newUrl);
 }catch{return {...base,state:'blocked',reason:'invalid_chat_url'};}
 if(oldChat.projectId!==newChat.projectId)
  return {...base,state:'blocked',reason:'cross_project_handoff'};
 if(oldChat.conversationId===newChat.conversationId)
  return {...base,state:'blocked',reason:'same_chat_handoff'};
 if(!oldFeedbackClear)return {...base,state:'blocked',
  reason:'old_feedback_unresolved'};
 if(!operatorApproved)return {...base,state:'candidate',
  reason:'operator_approval_required'};
 if(!newProjectMembershipVerified)
  return {...base,state:'candidate',reason:'new_chat_membership_not_verified'};
 if(!newChatReceiptVerified)
  return {...base,state:'candidate',reason:'handoff_receipt_not_verified'};
 if(!oldWatcherStopped)return {...base,state:'candidate',
  reason:'old_watcher_not_stopped'};
 // This is a pure checklist. No automatic promotion even if all flags true.
 return {...base,state:'candidate',reason:'operator_rebind_preflight_only'};
}
export function classifyWorkerLogTail(body){
 if(typeof body!=='string')return null;
 const lines=body.split(/\r?\n/).slice(-120);
 const mostRecent=lines.filter(Boolean).slice(-20).reverse();
 for(const row of mostRecent){
  if(/\[loop\] STOP:/.test(row))return 'stop';
  if(/Feedback send deferred: browser unavailable or delivery uncertain/.test(row))
   return 'feedback_deferred';
  if(/(?:ChatGPT tab not ready|browser read circuit opened|zero visible tabs|relay unavailable)/i.test(row))
   return 'relay';
 }
 return null;
}
