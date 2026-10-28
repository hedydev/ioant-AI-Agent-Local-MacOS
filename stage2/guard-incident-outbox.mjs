// 205B: bounded same-conversation Guard incident message outbox.
// This module NEVER touches ChatGPT or invokes Browser/Computer Use.
// Only the existing exact-chat watcher (and its exclusive chat lock)
// may call the browser send routine after an old task receipt is clear.
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {lstat,readFile,realpath} from 'node:fs/promises';
import {parseProjectChatUrl} from './project-chat-routing.mjs';
import {installedPlistBinding} from './ops-supervisor.mjs';

const CODES=new Set(['watcher_stopped','feedback_unconfirmed',
 'recent_watcher_stop','relay_unavailable','service_unverifiable',
 'private_state_unavailable']);
const PROJECT='openclaw-workflow';
const TRUSTED_PROJECTS=new Set([PROJECT,'alice-ai']);
const MAX_SEEN=256,MAX_ROWS=4096,MAX_BYTES=2*1024*1024;
const HOME=homedir();
const JOURNAL=join(HOME,'Library','Application Support',
 'ioant-openclaw-ops','guard','incidents.jsonl');
const MAIN_PLIST=join(HOME,'Library','LaunchAgents',
 'com.ioant.openclaw.safe-watcher.plist');
const TOKEN=/^[a-f0-9]{24}$/;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const keysMatch=(x,items)=>Object.keys(x).sort().join('|')===
 items.slice().sort().join('|');
const validDate=x=>typeof x==='string'&&
 /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x)&&
 Number.isFinite(Date.parse(x));
const day=x=>x.slice(0,10);
function expectedKey(ticket){
 return createHash('sha256').update([ticket.projectKey,
  ticket.conversationId,ticket.code,day(ticket.observedAt)].join('|'))
   .digest('hex').slice(0,24);
}
export function validGuardTicket(x){
 return object(x)&&keysMatch(x,['key','projectKey','conversationId',
  'code','observedAt','delivery','messageSent'])&&
 TOKEN.test(x.key??'')&&TRUSTED_PROJECTS.has(x.projectKey)&&
 /^[A-Za-z0-9-]{15,100}$/.test(x.conversationId??'')&&
 CODES.has(x.code)&&validDate(x.observedAt)&&
 x.delivery==='queued'&&x.messageSent===false&&
 expectedKey(x)===x.key;
}
export const receiptForGuardTicket=ticket=>
 '[IOANT-GUARD-INCIDENT '+ticket.key+']';
export function guardIncidentMessage(ticket){
 if(!validGuardTicket(ticket)||ticket.projectKey!==PROJECT)
  throw Error('invalid_guard_ticket');
 // No raw stack traces, shell output, file paths, chat content or secrets.
 return receiptForGuardTicket(ticket)+'\n'+
  'Audit: IOANT_GUARD_INCIDENT_NOTICE\n'+
  'Project: '+ticket.projectKey+'\n'+
  'Observed: '+ticket.observedAt+'\n'+
  'Incident category: '+ticket.code+'\n'+
  'Status: local Guard detected an incident; root cause not verified.\n'+
  'No task was replayed, no service restarted, and no Chat binding changed by this notice.\n'+
  'Please analyze this category and choose a new uniquely identified read-only diagnostic if needed.';
}
export function validateGuardOutboxState(state){
 if(!object(state))return false;
 const ids=state.guardDeliveredKeys??[];
 if(!Array.isArray(ids)||ids.length>MAX_SEEN||new Set(ids).size!==ids.length||
  ids.some(x=>!TOKEN.test(x)))return false;
 const notice=state.guardNotice;
 if(notice!==null&&notice!==undefined){
  if(!object(notice)||!keysMatch(notice,['ticket','phase'])||
     !['prepared','press_intent'].includes(notice.phase)||
     (!validGuardTicket(notice.ticket)||notice.ticket.projectKey!==PROJECT)||
     ids.includes(notice.ticket.key))
   return false;
 }
 return true;
}
export function selectGuardTicket(rows,{conversationId,state}){
 if(!validateGuardOutboxState(state))throw Error('guard_outbox_state_untrusted');
 if(!Array.isArray(rows)||rows.length>MAX_ROWS)
  throw Error('guard_journal_untrusted');
 if(rows.some(v=>!validGuardTicket(v)))throw Error('guard_journal_untrusted');
 const seen=new Set(state.guardDeliveredKeys??[]);
 const next=rows.find(v=>v.projectKey===PROJECT&&
  v.conversationId===conversationId&&!seen.has(v.key));
 return next??null;
}
export function prepareGuardNotice(state,ticket){
 if(!validateGuardOutboxState(state)||state.guardNotice)
  throw Error('guard_notice_already_pending');
 if(!validGuardTicket(ticket)||ticket.projectKey!==PROJECT)
  throw Error('invalid_guard_ticket');
 return {...state,guardNotice:{ticket,phase:'prepared'}};
}
export function markGuardPressIntent(state){
 if(!validateGuardOutboxState(state)||state.guardNotice?.phase!=='prepared')
  throw Error('guard_notice_not_prepared');
 return {...state,guardNotice:{...state.guardNotice,phase:'press_intent'}};
}
export function completeGuardNotice(state){
 if(!validateGuardOutboxState(state)||!state.guardNotice)
  throw Error('guard_notice_not_pending');
 const seen=state.guardDeliveredKeys??[];
 if(seen.length>=MAX_SEEN)throw Error('guard_delivery_ledger_full');
 const next={...state,guardDeliveredKeys:[...seen,state.guardNotice.ticket.key]};
 delete next.guardNotice;
 return next;
}
async function privateText(file,max){
 const st=await lstat(file);
 if(!st.isFile()||st.isSymbolicLink()||
  st.size>max||(st.mode&0o077)!==0||
  (typeof process.getuid==='function'&&st.uid!==process.getuid())||
  await realpath(file)!==file)throw Error('guard_source_untrusted');
 return readFile(file,'utf8');
}
export async function nextGuardNotice({chatUrl,state,
 readPlist=()=>privateText(MAIN_PLIST,12000),
 readJournal=()=>privateText(JOURNAL,MAX_BYTES)}={}){
 if(!validateGuardOutboxState(state))
  throw Error('guard_outbox_state_untrusted');
 // The source of authority is the installed worker service, not the
 // potentially stale config/chat-projects.json file.
 let chat;
 try{chat=parseProjectChatUrl(chatUrl)}
 catch{throw Error('guard_chat_binding_unverified')}
 const binding=installedPlistBinding(await readPlist());
 if(binding?.kind!=='local'||
  binding.chatUrl!==chat.canonicalUrl||
  binding.conversationId!==chat.conversationId)
  throw Error('guard_chat_binding_unverified');
 let text;
 try{text=await readJournal()}
 catch(e){if(e?.code==='ENOENT')return null;throw e}
 if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>MAX_BYTES)
  throw Error('guard_journal_untrusted');
 const lines=text.trim().split('\n').filter(Boolean);
 if(lines.length>MAX_ROWS)throw Error('guard_journal_untrusted');
 let rows;
 try{rows=lines.map(line=>JSON.parse(line))}
 catch{throw Error('guard_journal_untrusted')}
 return selectGuardTicket(rows,{conversationId:chat.conversationId,state});
}
