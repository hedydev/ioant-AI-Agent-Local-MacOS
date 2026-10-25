#!/usr/bin/env node
// Read-only project/chat inventory. No browser clicks, writes or Agent tools.
import {readFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateProjectRoutes,parseProjectChatUrl,resolveProjectRoute,proposedSuccessor} from './project-chat-routing.mjs';
import {createHandoffRequest,handoffPrompt} from './chat-handoff.mjs';
import {getHandoffStatus} from './handoff-journal.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const FILE=join(ROOT,'config','chat-projects.json');
const safeError=e=>['invalid_chat_url','invalid_chat_origin','unapproved_chat_query',
 'not_a_project_chat','invalid_project_manifest','invalid_project_route',
 'duplicate_project_or_conversation','unregistered_project',
 'inactive_project_conversation','cross_project_handoff',
 'same_chat_handoff','conversation_already_registered',
 'invalid_handoff_id','untrusted_rollover_reason'].includes(e?.message)?e.message:'invalid_request';
async function main(argv){
 const raw=await readFile(FILE,'utf8');
 if(raw.length>16384)throw Error('invalid_project_manifest');
 const manifest=JSON.parse(raw);
 const routes=validateProjectRoutes(manifest);
 const [action,...args]=argv;
 if(action==='status'&&args.length===0)
   return {audit:'IOANT_CHAT_PROJECT_ROUTER',schemaVersion:1,state:'read_only',
     routes:routes.map(x=>({key:x.key,projectId:x.projectId,conversationId:x.conversationId,
       repo:x.repo,agentId:x.agentId,role:x.role}))};
 if(action==='handoff-status'&&args.length===1){
   const key=args[0];
   if(!routes.some(x=>x.key===key))throw Error('unregistered_project');
   return getHandoffStatus(key);
 }
 if(action==='inspect'&&args.length===1){
   const chat=parseProjectChatUrl(args[0],{allowTracking:true});
   const route=routes.find(x=>x.projectId===chat.projectId);
   return {audit:'IOANT_CHAT_PROJECT_ROUTER',schemaVersion:1,state:!route?'unregistered_project':
     route.conversationId===chat.conversationId?'active_project_chat':'inactive_project_chat',
     projectId:chat.projectId,conversationId:chat.conversationId,
     ...(route?{key:route.key,agentId:route.agentId}:{}),
     trackingRemoved:args[0]!==chat.canonicalUrl};
 }
 if(action==='preview'&&args.length===2){
   const [key,requestId]=args;
   const request=createHandoffRequest(manifest,key,{requestId});
   return {audit:'IOANT_CHAT_HANDOFF',schemaVersion:1,state:'proposal_only',
     projectKey:key,oldConversationId:request.oldConversationId,requestId,
     prompt:handoffPrompt(request),
     note:'This does not create a chat, send a message, or change the Agent route.'};
 }
 if(action==='check-successor'&&args.length===2){
   const [key,url]=args;
   const next=proposedSuccessor(manifest,key,url);
   return {audit:'IOANT_CHAT_HANDOFF',schemaVersion:1,state:'candidate_only',
     projectKey:key,projectId:next.projectId,oldConversationId:next.fromConversationId,
     newConversationId:next.toConversationId,
     note:'No DOM/receipt verification or route promotion performed.'};
 }
 throw Error('invalid_request');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await main(process.argv.slice(2))))}
 catch(e){console.log(JSON.stringify({audit:'IOANT_CHAT_PROJECT_ROUTER',
   schemaVersion:1,state:'blocked',reason:safeError(e)}));process.exitCode=1}
}
export {main as inspectProjectRoutes};
