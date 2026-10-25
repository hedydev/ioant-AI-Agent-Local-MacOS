// Owner-private, crash-resumable handoff journal. No ChatGPT/browser/Agent actions.
// Only locally trusted orchestrators may supply independently verified transitions.
import {mkdir,readFile,lstat,realpath,open,rename,unlink,rmdir} from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {createHandoffRequest,recordHandoffText,verifyNewProjectChat,confirmHandoffReceipt,acknowledgeAgentRouting} from './chat-handoff.mjs';
import {validateProjectRoutes} from './project-chat-routing.mjs';

const PROJECT=/^[a-z][a-z0-9-]{2,60}$/;
const ID=/^[a-zA-Z0-9][a-zA-Z0-9_-]{3,79}$/;
const PHASES=['requested','handoff_ready','new_chat_verified','receipt_verified','agent_acknowledged'];
const PHASE_NEXT=new Map(PHASES.slice(0,-1).map((value,i)=>[value,PHASES[i+1]]));
const MAX=512*1024;
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const privateFile=s=>s.isFile()&&!s.isSymbolicLink()&&s.size<=MAX&&(s.mode&0o077)===0&&
 (typeof process.getuid!=='function'||s.uid===process.getuid());
const privateDir=s=>s.isDirectory()&&!s.isSymbolicLink()&&(s.mode&0o077)===0&&
 (typeof process.getuid!=='function'||s.uid===process.getuid());

function rootPath(explicit){
 if(explicit!==undefined){
  // Explicit root is allowed only as an injected dependency for isolated tests.
  if(process.env.IOANT_HANDOFF_TEST_ROOT!=='1')throw Error('test_root_not_authorized');
  return resolve(explicit);
 }
 const cache=process.env.PROJECT_DEV_CACHE;
 const volume=process.env.IOANT_DEV_VOLUME;
 if(!cache||!volume||resolve(cache)!==resolve(volume,'DeveloperCache','projects','ioant-ai-agent-local-macos'))
   throw Error('handoff_cache_not_pinned');
 return join(resolve(cache),'chat-projects','handoffs');
}
async function ownedParents(root){
 // Only the exact local developer cache (or explicit isolated test parent)
 // may be used. Create a single private container folder if absent.
 const parent=dirname(root),grand=dirname(parent);
 const g=await lstat(grand);
 if(!privateDir(g)||await realpath(grand)!==grand)
   throw Error('untrusted_handoff_cache');
 try{await mkdir(parent,{mode:0o700})}
 catch(e){if(e.code!=='EEXIST')throw e}
 const p=await lstat(parent);
 if(!privateDir(p)||await realpath(parent)!==parent)
   throw Error('untrusted_handoff_parent');
}
async function ensureRoot(root){
 await ownedParents(root);
 try{await mkdir(root,{mode:0o700})}
 catch(e){if(e.code!=='EEXIST')throw e}
 const p=await lstat(root);
 if(!privateDir(p)||await realpath(root)!==root)throw Error('unsafe_handoff_root');
 return root;
}
async function loadProject(root,key){
 const file=join(root,key+'.json');
 let stat;
 try{stat=await lstat(file)}catch(e){
  if(e.code==='ENOENT')return {schemaVersion:1,projectKey:key,active:null,history:[],revision:0};
  throw e;
 }
 if(!privateFile(stat))throw Error('unsafe_handoff_file');
 const fd=await open(file,fsConstants.O_RDONLY|fsConstants.O_NOFOLLOW);
 let raw;
 try{
   if(!privateFile(await fd.stat()))throw Error('unsafe_handoff_file');
   raw=await fd.readFile('utf8');
 }finally{await fd.close()}
 if(Buffer.byteLength(raw,'utf8')>MAX)throw Error('unsafe_handoff_file');
 const data=JSON.parse(raw);
 if(!isObject(data)||data.schemaVersion!==1||data.projectKey!==key||
    !Number.isSafeInteger(data.revision)||data.revision<0||
    !Array.isArray(data.history)||data.history.length>32||
    !(data.active===null||isObject(data.active)))throw Error('malformed_handoff_journal');
 if(data.active!==null&&
    (!ID.test(data.active.id??'')||!PHASES.includes(data.active.phase)||
     !['none','press_intent','confirmed'].includes(data.active.sendPhase)))
   throw Error('malformed_handoff_journal');
 return data;
}
async function saveProject(root,key,state){
 const file=join(root,key+'.json');
 const tmp=join(root,key+'.'+randomUUID()+'.tmp');
 const payload=JSON.stringify(state)+'\n';
 if(Buffer.byteLength(payload,'utf8')>MAX)throw Error('handoff_journal_too_large');
 let fd;
 try{
   fd=await open(tmp,'wx',0o600);
   await fd.writeFile(payload);
   await fd.sync();
   await fd.close();
   fd=null;
   await rename(tmp,file);
 }catch(e){
   if(fd)await fd.close().catch(()=>{});
   await unlink(tmp).catch(()=>{});
   throw e;
 }
}
async function exclusive(root,key,handler){
 if(!PROJECT.test(key??''))throw Error('invalid_project_key');
 await ensureRoot(root);
 const lock=join(root,key+'.lock');
 const nonce=randomUUID();
 try{await mkdir(lock,{mode:0o700})}
 catch(e){if(e.code==='EEXIST')throw Error('handoff_lock_busy');throw e}
 const marker=join(lock,'owner.json');
 let own=false;
 try{
  const fd=await open(marker,'wx',0o600);
  own=true;
  try{await fd.writeFile(JSON.stringify({pid:process.pid,nonce}));await fd.sync()}
  finally{await fd.close()}
  return await handler();
 }finally{
  // Never delete an unrecognized/replaced lock.
  if(own){
   try{
    const p=JSON.parse(await readFile(marker,'utf8'));
    if(p.nonce===nonce&&p.pid===process.pid){await unlink(marker);await rmdir(lock)}
   }catch{/* uncertain ownership: preserve for operator review */}
  }
 }
}
function sameFixed(a,b){
 for(const k of ['id','projectKey','projectId','oldConversationId','oldUrl','createdAt','reason']){
  if(a?.[k]!==b?.[k])return false;
 }
 return true;
}
function phaseRecord(current,next,manifest){
 if(!isObject(next)||!sameFixed(current,next)||PHASE_NEXT.get(current.phase)!==next.phase)
   throw Error('unexpected_handoff_transition');
 const bound=validateProjectRoutes(manifest).find(x=>x.key===current.projectKey);
 if(!bound||bound.projectId!==current.projectId||
    bound.conversationId!==current.oldConversationId)
   throw Error('stale_handoff_project_route');
 let expected;
 switch(next.phase){
  case 'handoff_ready':
   expected=recordHandoffText(current,next.handoffText,{confirmedAssistantTurn:true});
   break;
  case 'new_chat_verified':
   expected=verifyNewProjectChat(current,manifest,next.newUrl,{
     operatorApproved:true,domProjectVerified:true});
   break;
  case 'receipt_verified':
   expected=confirmHandoffReceipt(current,{recipientUrl:current.newUrl,
     userRoleReceiptFound:true});
   break;
  case 'agent_acknowledged':
   if(next.agentId!==bound.agentId)throw Error('agent_route_mismatch');
   expected=acknowledgeAgentRouting(current,{agentId:bound.agentId,
     agentAcknowledged:true});
   break;
  default: throw Error('unexpected_handoff_transition');
 }
 if(!isDeepStrictEqual(next,expected))
   throw Error('handoff_transition_content_changed');
}
// One project per journal slot, single active handoff and no overwriting
// unfinished handoff IDs. Caller must use a *trusted* local project manifest.
export async function beginHandoff(manifest,key,{requestId,reason='operator_requested',root}={}){
 const routes=validateProjectRoutes(manifest);
 if(!routes.some(x=>x.key===key))throw Error('unregistered_project');
 const base=rootPath(root);
 return exclusive(base,key,async()=>{
  const data=await loadProject(base,key);
  if(data.active){
   if(data.active.id===requestId&&data.active.phase==='requested'&&
      data.active.reason===reason)return publicStatus(data);
   throw Error('handoff_already_active');
  }
  const request=createHandoffRequest(manifest,key,{requestId,reason});
  data.active={...request,sendPhase:'none'};
  data.revision++;
  await saveProject(base,key,data);
  return publicStatus(data);
 });
}
// Persist a stage only if the caller already proved it using the pure state
// machine and the expected revision; never take browser claims as authority.
export async function advanceHandoff(manifest,key,{expectedRevision,verifiedState,root}={}){
 const base=rootPath(root);
 return exclusive(base,key,async()=>{
  const data=await loadProject(base,key),before=data.active;
  if(!before||data.revision!==expectedRevision)throw Error('handoff_stale_revision');
  phaseRecord(before,verifiedState,manifest);
  if(verifiedState.phase==='receipt_verified'&&before.sendPhase!=='press_intent')
    throw Error('handoff_delivery_not_attempted');
  if(verifiedState.phase==='agent_acknowledged'&&before.sendPhase!=='confirmed')
    throw Error('handoff_receipt_not_confirmed');
  data.active={...verifiedState,sendPhase:verifiedState.phase==='receipt_verified'?'confirmed':before.sendPhase};
  data.revision++;
  await saveProject(base,key,data);
  return publicStatus(data);
 });
}
// Write press intent BEFORE entering the new-chat composer. Ambiguous
// browser send means journal persists press_intent; no automatic resend.
export async function markHandoffPressIntent(key,{expectedRevision,root}={}){
 const base=rootPath(root);
 return exclusive(base,key,async()=>{
  const data=await loadProject(base,key);
  if(data.revision!==expectedRevision||data.active?.phase!=='new_chat_verified'||
     data.active.sendPhase!=='none')throw Error('handoff_press_intent_not_safe');
  data.active.sendPhase='press_intent';
  data.revision++;
  await saveProject(base,key,data);
  return publicStatus(data);
 });
}
// Private internal read for a verified local witness only. NEVER expose this
// (it includes complete handoff text) through the status CLI or web dashboard.
export async function readHandoffPrivate(key,{root}={}){
 if(!PROJECT.test(key??''))throw Error('invalid_project_key');
 const base=rootPath(root);
 const p=await lstat(base);
 if(!privateDir(p)||await realpath(base)!==base)throw Error('unsafe_handoff_root');
 const data=await loadProject(base,key);
 return data.active===null?null:structuredClone(data.active);
}
export async function getHandoffStatus(key,{root}={}){
 if(!PROJECT.test(key??''))throw Error('invalid_project_key');
 const base=rootPath(root);
 try{const p=await lstat(base);
  if(!privateDir(p)||await realpath(base)!==base)throw Error('unsafe_handoff_root')}
 catch(e){
  if(e.code==='ENOENT')
   return publicStatus({projectKey:key,revision:0,active:null,history:[]});
  throw e;
 }
 return publicStatus(await loadProject(base,key));
}
function publicStatus(data){
 const a=data.active;
 return Object.freeze({audit:'IOANT_HANDOFF_JOURNAL',schemaVersion:1,
  projectKey:data.projectKey,revision:data.revision,
  state:a?.phase??'idle',requestId:a?.id??null,
  fromConversationId:a?.oldConversationId??null,
  toConversationId:a?.newConversationId??null,
  sendPhase:a?.sendPhase??'none',historyCount:data.history.length});
}
