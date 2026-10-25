// Conservative ChatGPT Project chat rollover protocol.
// No heuristics claiming knowledge of undisclosed ChatGPT context limits.
// Every browser write/agent rebind must be separately authorized and witnessed.
import {randomUUID,createHash} from 'node:crypto';
import {proposedSuccessor,promoteProjectChat,parseProjectChatUrl,validateProjectRoutes} from './project-chat-routing.mjs';

const PHASES=new Set(['requested','handoff_ready','new_chat_verified','receipt_verified','agent_acknowledged','promoted','blocked']);
const HANDOFF_MAX=10000;
const SINGLE=/^[a-zA-Z0-9][a-zA-Z0-9_-]{3,79}$/;
const o=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const HANDOFF_REQUEST_MARKER='IOANT_CHAT_HANDOFF_V1';
export const HANDOFF_RECEIPT_MARKER='IOANT_CHAT_HANDOFF_RECEIPT_V1';

// Never infer a numeric token/remaining-context percentage from message count.
// The only automatic trigger is an independently observed explicit limit banner
// in the EXACT registered conversation (not untrusted assistant text).
export function contextRolloverSignal(observation){
 if(!o(observation)||observation.trustedSource!=='exact_chat_ui'||
    observation.exactConversationVerified!==true)
   return {status:'unknown',reason:'no_trusted_context_limit_evidence'};
 if(observation.explicitLimitBanner===true)
   return {status:'handoff_recommended',reason:'explicit_context_limit_banner'};
 if(observation.explicitLimitBanner===false)
   return {status:'unknown',reason:'no_limit_signal'};
 return {status:'unknown',reason:'ambiguous_limit_signal'};
}

export function createHandoffRequest(manifest,projectKey,{requestId,reason='operator_requested'}={}){
 if(!SINGLE.test(requestId??''))throw Error('invalid_handoff_id');
 if(!['operator_requested','explicit_context_limit_banner'].includes(reason))
   throw Error('untrusted_rollover_reason');
 const routes=validateProjectRoutes(manifest);
 const route=routes.find(p=>p.key===projectKey);
 if(!route)throw Error('unregistered_project');
 const original=parseProjectChatUrl(route.chatUrl);
 return Object.freeze({schemaVersion:1,id:requestId,phase:'requested',reason,
   projectKey,projectId:original.projectId,oldConversationId:original.conversationId,
   oldUrl:original.canonicalUrl,createdAt:new Date().toISOString()});
}

// This is a suggested message to the *current* ChatGPT, not an instruction
// to the browser or model for arbitrary execution. The current ChatGPT must
// explicitly return a human-readable handoff, including the project and
// project-specific decisions. No raw transcript/cookies are copied.
export function handoffPrompt(request){
 if(!o(request)||request.phase!=='requested'||!SINGLE.test(request.id??''))
   throw Error('invalid_handoff_request');
 return `当前项目对话需要交接到同一 ChatGPT Project 的新聊天。请生成一段完整、可直接复制的中文交接文字，包含：项目职责、当前工作目标、仓库与分支、已经完成及真实测试证据、正在进行的任务、尚未解决的问题、下一步操作与安全限制。明确哪些结论未验证。不要输出密钥、Token、个人敏感信息或任意自动执行指令。交接标识：${HANDOFF_REQUEST_MARKER} ${request.id}。只生成交接文稿，不要声称已经创建新聊天或完成交接。`;
}

export function recordHandoffText(request,text,{confirmedAssistantTurn=false}={}){
 if(!o(request)||request.phase!=='requested')throw Error('invalid_handoff_phase');
 if(confirmedAssistantTurn!==true)throw Error('handoff_not_confirmed_from_original_assistant');
 if(typeof text!=='string'||text.trim().length<100||text.length>HANDOFF_MAX||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))
   throw Error('invalid_handoff_document');
 // Block protocol-structured operational orders in a prose-only handoff.
 if(text.includes('"protocol":"ioant-mac-ops-v1"')||text.includes('"action":"project-update-verify"'))
   throw Error('handoff_contains_executable_task');
 const digest=createHash('sha256').update(text).digest('hex');
 return Object.freeze({...request,phase:'handoff_ready',handoffSha256:digest,
   handoffText:text,confirmedAssistantTurn:true});
}

export function verifyNewProjectChat(request,manifest,newUrl,{operatorApproved=false,domProjectVerified=false}={}){
 if(!o(request)||request.phase!=='handoff_ready')throw Error('handoff_not_ready');
 if(operatorApproved!==true||domProjectVerified!==true)
   throw Error('new_chat_not_user_approved_or_dom_verified');
 const next=proposedSuccessor(manifest,request.projectKey,newUrl);
 if(next.projectId!==request.projectId||next.fromConversationId!==request.oldConversationId)
   throw Error('stale_handoff_request');
 return Object.freeze({...request,phase:'new_chat_verified',newUrl:next.toUrl,
   newConversationId:next.toConversationId});
}

export function handoffDeliveryMessage(request){
 if(!o(request)||request.phase!=='new_chat_verified')
   throw Error('new_chat_not_verified');
 // Fixed short receipt prefix can be checked in a fresh user role bubble.
 return HANDOFF_RECEIPT_MARKER+' '+request.id+' '+request.handoffSha256.slice(0,16)+
   '\n\n'+request.handoffText;
}

export function confirmHandoffReceipt(request,{recipientUrl,userRoleReceiptFound=false}={}){
 if(!o(request)||request.phase!=='new_chat_verified')
   throw Error('invalid_handoff_phase');
 const page=parseProjectChatUrl(recipientUrl);
 if(page.projectId!==request.projectId||page.conversationId!==request.newConversationId||
    userRoleReceiptFound!==true)throw Error('handoff_receipt_missing');
 return Object.freeze({...request,phase:'receipt_verified',receiptConfirmed:true});
}

export function acknowledgeAgentRouting(request,{agentId,agentAcknowledged=false}={}){
 if(!o(request)||request.phase!=='receipt_verified')throw Error('handoff_not_delivered');
 if(typeof agentId!=='string'||agentAcknowledged!==true)
   throw Error('agent_handoff_not_acknowledged');
 return Object.freeze({...request,phase:'agent_acknowledged',agentId});
}

export function completeHandoff(request,manifest,{oldWatcherInactive=false}={}){
 if(!o(request)||request.phase!=='agent_acknowledged')
   throw Error('handoff_not_acknowledged');
 const proposal=proposedSuccessor(manifest,request.projectKey,request.newUrl);
 if(proposal.agentId!==request.agentId||proposal.fromConversationId!==request.oldConversationId||
    proposal.toConversationId!==request.newConversationId||
    request.receiptConfirmed!==true)throw Error('agent_route_mismatch');
 const updated=promoteProjectChat(manifest,proposal,{
   oldWatcherInactive,newProjectChatVerified:true,
   handoffReceiptVerified:true,agentRouteAcknowledged:true});
 return {request:Object.freeze({...request,phase:'promoted'}),manifest:updated};
}
