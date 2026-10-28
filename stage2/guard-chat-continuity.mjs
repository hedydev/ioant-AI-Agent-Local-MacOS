// 205C-1: pure, read-only per-Project Chat continuity preflight.
// The active LaunchAgent plist is the authority for current Chat identity.
// Repository route snapshots are context only, never an implicit rebind grant.
import {parseProjectChatUrl,validateProjectRoutes} from './project-chat-routing.mjs';

const PROJECTS=new Set(['openclaw-workflow','alice-ai']);
const OK_SERVICE=new Set(['running','stopped','unloaded']);
const issue=(state,reason,other={})=>Object.freeze({
 audit:'IOANT_GUARD_CHAT_CONTINUITY',schemaVersion:1,
 state,reason,readOnly:true,createdChat:false,
 sentHandoff:false,changedBinding:false,transferredPermissions:false,
 restartedWorker:false,replayedTask:false,...other
});
export function evaluateChatContinuity({projectKey,binding,manifest,
 service,settlement}={}){
 if(!PROJECTS.has(projectKey))return issue('blocked','unknown_project');
 if(!binding?.chatUrl||!binding.conversationId||
    service?.identityVerified!==true||
    service?.conversationId!==binding.conversationId)
  return issue('blocked','installed_chat_identity_unverified');
 let installed,routes,route;
 try{
  installed=parseProjectChatUrl(binding.chatUrl);
  routes=validateProjectRoutes(manifest);
  route=routes.find(x=>x.key===projectKey);
 }catch{return issue('blocked','route_manifest_invalid')}
 if(!route)return issue('blocked','project_route_missing');
 if(route.projectId!==installed.projectId)
  return issue('blocked','installed_project_manifest_mismatch');
 if(!OK_SERVICE.has(service.serviceState))
  return issue('blocked','worker_state_unverified');
 if(settlement?.verified!==true)
  return issue('blocked',settlement?.reason==='state_file_absent'?
   'state_checkpoint_missing':'conversation_state_unverified',
   {projectKey,checkpointRequired:settlement?.reason==='state_file_absent',
    missingEvidence:['owned_watcher_state_checkpoint']});
 if(projectKey==='alice-ai'&&
    !['none','requested','press_intent','confirmed'].includes(settlement.handshake))
  return issue('blocked','alice_handshake_unverified',
   {projectKey,missingEvidence:['alice_handshake_mailbox']});
 const pending=Object.freeze({
  taskFeedback:settlement.taskFeedback===true,
  guardNotice:settlement.guardNotice===true,
  maintainerNotice:settlement.maintainerNotice===true,
  initialization:settlement.initialization===true,
  aliceHandshake:['requested','press_intent'].includes(settlement.handshake)
 });
 const base={
  projectKey,projectId:installed.projectId,
  currentConversationId:installed.conversationId,
  registeredConversationId:route.conversationId,
  manifestDrift:route.conversationId!==installed.conversationId,
  agentId:route.agentId,
  currentWorkerState:service.serviceState,
  pending,
  pendingGuardIncidents:service.incidentCodes?.length>0,
  missingEvidence:['new_chat_dom_project_verification',
   'operator_approval','new_chat_receipt',
   'old_watcher_shutdown','new_worker_start_confirmation']
 };
 if(Object.values(pending).some(Boolean))
  return issue('blocked','unresolved_chat_delivery',base);
 if(service.feedbackPending===true)
  return issue('blocked','unresolved_task_feedback',base);
 if(service.serviceState!=='running')
  return issue('candidate','old_worker_not_running_handoff_text_unavailable',base);
 if(base.manifestDrift)
  return issue('candidate','registry_reconciliation_required',base);
 return issue('candidate','operator_approved_new_chat_required',base);
}
