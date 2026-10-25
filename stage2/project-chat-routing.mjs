// Trusted local project-to-chat routing foundation; pure and browser-free.
// ChatGPT navigation/query strings and model turns never grant new permissions.
import {createHash} from 'node:crypto';

const PROJECT=/^g-p-([a-f0-9]{32})(?:-[A-Za-z0-9_-]{1,120})?$/;
const CONVERSATION=/^[A-Za-z0-9-]{15,100}$/;
const KEY=/^[a-z][a-z0-9-]{2,60}$/;
const REPO=/^hedydev\/[A-Za-z0-9._-]{2,100}$/;
const AGENT_IDS=new Set(['openclaw-dev','alice-ai','main']);
const ROLES=new Set(['ops-platform','project-lead','advisor']);
const STATES=new Set(['active','retired']);
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);

export function parseProjectChatUrl(value,{allowTracking=false}={}){
 if(typeof value!=='string'||value.length>1024)throw Error('invalid_chat_url');
 let u;
 try{u=new URL(value)}catch{throw Error('invalid_chat_url')}
 if(u.protocol!=='https:'||u.hostname!=='chatgpt.com'||u.port||
    u.username||u.password||u.hash)throw Error('invalid_chat_origin');
 if(u.search){
   // Tracking parameter is not part of the conversation identity.
   if(!allowTracking||[...u.searchParams.keys()].length!==1||
      u.searchParams.get('utm_source')!=='chatgpt.com')
     throw Error('unapproved_chat_query');
 }
 const parts=u.pathname.split('/');
 if(parts.length!==5||parts[0]!==''||parts[1]!=='g'||
    !PROJECT.test(parts[2])||parts[3]!=='c'||!CONVERSATION.test(parts[4]))
   throw Error('not_a_project_chat');
 // The first fixed 32-hex identifier is used as the project key;
 // a human-readable suffix can vary. This is a URL-derived identifier,
 // NOT proof of browser-side Project membership by itself.
 const projectId='g-p-'+parts[2].match(PROJECT)[1];
 return Object.freeze({
   projectId,projectPath:parts[2],conversationId:parts[4],
   canonicalUrl:'https://chatgpt.com'+u.pathname,
   projectUrl:'https://chatgpt.com/g/'+parts[2]
 });
}

export function validateProjectRoutes(manifest){
 if(!isObject(manifest)||manifest.schemaVersion!==1||
   !Array.isArray(manifest.projects)||manifest.projects.length<1||
   manifest.projects.length>24||Object.keys(manifest).some(k=>!['schemaVersion','projects'].includes(k)))
   throw Error('invalid_project_manifest');
 const keys=new Set(),projects=new Set(),conversations=new Set();
 const verified=manifest.projects.map(item=>{
   if(!isObject(item)||Object.keys(item).some(k=>!['key','repo','agentId','chatUrl','role'].includes(k))||
      !KEY.test(item.key??'')||!REPO.test(item.repo??'')||
      !AGENT_IDS.has(item.agentId)||!ROLES.has(item.role)||
      keys.has(item.key))throw Error('invalid_project_route');
   const chat=parseProjectChatUrl(item.chatUrl);
   if(projects.has(chat.projectId)||conversations.has(chat.conversationId))
     throw Error('duplicate_project_or_conversation');
   keys.add(item.key);projects.add(chat.projectId);conversations.add(chat.conversationId);
   return Object.freeze({...item,...chat});
 });
 return Object.freeze(verified);
}

export function resolveProjectRoute(manifest,url){
 const chat=parseProjectChatUrl(url,{allowTracking:true});
 const routes=validateProjectRoutes(manifest);
 const route=routes.find(x=>x.projectId===chat.projectId);
 if(!route)throw Error('unregistered_project');
 if(route.conversationId!==chat.conversationId)
   throw Error('inactive_project_conversation');
 return route;
}

// The project identity survives a changed /c/... ID; the successor must
// be created under precisely the registered Project path.
export function proposedSuccessor(manifest,projectKey,successorUrl){
 const routes=validateProjectRoutes(manifest);
 const route=routes.find(x=>x.key===projectKey);
 if(!route)throw Error('unregistered_project');
 const next=parseProjectChatUrl(successorUrl,{allowTracking:true});
 if(route.projectId!==next.projectId)throw Error('cross_project_handoff');
 if(route.conversationId===next.conversationId)throw Error('same_chat_handoff');
 if(routes.some(x=>x.conversationId===next.conversationId))
   throw Error('conversation_already_registered');
 return Object.freeze({projectKey:route.key,repo:route.repo,agentId:route.agentId,
   fromConversationId:route.conversationId,toConversationId:next.conversationId,
   fromUrl:route.canonicalUrl,toUrl:next.canonicalUrl,projectId:route.projectId});
}

// Only Mac-witnessed, receipt-confirmed promotions can alter an active route.
// Caller must persist the returned snapshot atomically after its local checks.
export function promoteProjectChat(manifest,proposal,evidence){
 const routes=validateProjectRoutes(manifest);
 const route=routes.find(x=>x.key===proposal?.projectKey);
 if(!route||!isObject(evidence))throw Error('invalid_promotion');
 const expected=proposedSuccessor(manifest,route.key,proposal.toUrl);
 if(expected.fromConversationId!==proposal.fromConversationId||
    expected.toConversationId!==proposal.toConversationId||
    expected.agentId!==proposal.agentId||expected.repo!==proposal.repo||
    expected.projectId!==proposal.projectId)throw Error('stale_handoff_proposal');
 const flags=['oldWatcherInactive','newProjectChatVerified','handoffReceiptVerified','agentRouteAcknowledged'];
 if(flags.some(k=>evidence[k]!==true)||Object.keys(evidence).some(k=>!flags.includes(k)))
   throw Error('handoff_evidence_incomplete');
 return Object.freeze({schemaVersion:1,projects:manifest.projects.map(item=>
   item.key===route.key?{...item,chatUrl:expected.toUrl}:structuredClone(item))});
}

export function projectChatFingerprint(url){
 const x=parseProjectChatUrl(url,{allowTracking:true});
 return createHash('sha256').update(x.projectId+'\0'+x.conversationId).digest('hex').slice(0,24);
}
