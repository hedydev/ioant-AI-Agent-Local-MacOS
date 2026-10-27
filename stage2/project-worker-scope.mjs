// Explicit AliceAI coordinator is a separate, strictly read-only Project scope.
// Merely recognizing an Agent ID never grants shell, browser write, SSH or Git tools.
import {parseProjectChatUrl,resolveProjectRoute} from './project-chat-routing.mjs';
const FIXED={key:'alice-ai',repo:'hedydev/ioant-AI-Minecraft-Alice',
 agentId:'alice-ai',role:'project-lead'};
const deniedFlags=['enableAlicePreflight','enableAliceLabStartupProbe','enableMintDiagnostics',
 'enableSelfUpdate','enableOpenClawProvision','enableOpenClawAgentCreate',
 'enableOpenClawDevCreate'];
export function validateIsolatedProjectScope(opts,manifest,profile){
 if(opts?.projectKey!==FIXED.key||profile!=='chrome'||opts.initialize!==false||
    !['once','watch'].includes(opts.mode)||opts.devAgent!==null||
    deniedFlags.some(k=>opts[k]!==false)||opts.enableGuiReadonly!==true)
  throw Error('unsafe_alice_worker_options');
 const route=resolveProjectRoute(manifest,opts.url);
 if(route.key!==FIXED.key||route.repo!==FIXED.repo||
    route.agentId!==FIXED.agentId||route.role!==FIXED.role)
  throw Error('alice_worker_route_mismatch');
 const source=parseProjectChatUrl(opts.url);
 if(source.projectId!==route.projectId||source.conversationId!==route.conversationId)
  throw Error('alice_worker_chat_mismatch');
 return Object.freeze({key:route.key,projectId:route.projectId,
   conversationId:route.conversationId,agentId:route.agentId});
}
export function sameIsolatedProjectChat(scope,candidate){
 try{
  const x=parseProjectChatUrl(candidate,{allowTracking:true});
  return scope?.key===FIXED.key&&scope.projectId===x.projectId&&
    scope.conversationId===x.conversationId;
 }catch{return false}
}
export function isolatedProjectAllowsAction(scope,task,opts){
 return scope?.key===FIXED.key&&task?.known===true&&
   (task.action==='openclaw-gui-readonly-probe'||
    task.action==='alice-owner-review-preview')&&opts?.enableGuiReadonly===true;
}
