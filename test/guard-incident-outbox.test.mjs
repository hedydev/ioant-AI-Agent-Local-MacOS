import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {renderPlist} from '../stage2/ops-supervisor.mjs';
import {validGuardTicket,receiptForGuardTicket,guardIncidentMessage,
 validateGuardOutboxState,selectGuardTicket,prepareGuardNotice,
 markGuardPressIntent,completeGuardNotice,nextGuardNotice}
 from '../stage2/guard-incident-outbox.mjs';

const chat='https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/6ae18e93-e2a0-83ec-aac9-88105079f208';
const chat2='https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/6adfdfb9-65b0-83ec-b6ac-155e7852c6af';
const id=chat.split('/').at(-1);
const fixture=(patch={})=>{
 const v={projectKey:'openclaw-workflow',conversationId:id,
  code:'watcher_stopped',observedAt:'2026-10-28T08:18:39.000Z',
  delivery:'queued',messageSent:false,...patch};
 v.key=createHash('sha256').update([v.projectKey,v.conversationId,
  v.code,v.observedAt.slice(0,10)].join('|')).digest('hex').slice(0,24);
 return v;
};
const plist=renderPlist('/opt/homebrew/bin',{chatUrl:chat});

test('guard ticket authenticity requires exact fixed fields and digest',()=>{
 const t=fixture();
 assert.equal(validGuardTicket(t),true);
 assert.equal(validGuardTicket({...t,key:'a'.repeat(24)}),false);
 assert.equal(validGuardTicket({...t,secret:'do-not-forward'}),false);
 assert.equal(validGuardTicket({...t,delivery:'sent'}),false);
 assert.equal(validGuardTicket({...t,messageSent:true}),false);
 assert.equal(validGuardTicket({...t,code:'arbitrary log text'}),false);
});
test('notification text is fixed and contains no raw log content',()=>{
 const t=fixture();
 const message=guardIncidentMessage(t);
 assert.ok(message.startsWith(receiptForGuardTicket(t)));
 assert.match(message,/Incident category: watcher_stopped/);
 assert.doesNotMatch(message,/\.log|\.sqlite|token=|command=|password=/);
 assert.throws(()=>guardIncidentMessage({...t,code:'password=abc'}));
});
test('only local exact-chat tickets are selectable',()=>{
 const a=fixture(),b=fixture({conversationId:chat2.split('/').at(-1)});
 const x=selectGuardTicket([b,a],{conversationId:id,state:{}});
 assert.equal(x.key,a.key);
 assert.equal(selectGuardTicket([b],{conversationId:id,state:{}}),null);
});
test('malformed journal row fails closed even beside valid incident',()=>{
 assert.throws(()=>selectGuardTicket([fixture(),{bad:true}],{conversationId:id,state:{}}));
 assert.throws(()=>selectGuardTicket('unsafe',{conversationId:id,state:{}}));
});
test('one queued notice must be durable before browser send',()=>{
 const t=fixture(),prepared=prepareGuardNotice({},t);
 assert.equal(prepared.guardNotice.phase,'prepared');
 assert.equal(validateGuardOutboxState(prepared),true);
 assert.throws(()=>prepareGuardNotice(prepared,t));
});
test('press intent and acknowledgement are one-way transitions',()=>{
 const t=fixture();
 const prepared=prepareGuardNotice({},t);
 const intent=markGuardPressIntent(prepared);
 assert.equal(intent.guardNotice.phase,'press_intent');
 assert.throws(()=>markGuardPressIntent(intent));
 const delivered=completeGuardNotice(intent);
 assert.equal(delivered.guardNotice,undefined);
 assert.deepEqual(delivered.guardDeliveredKeys,[t.key]);
 assert.equal(selectGuardTicket([t],{conversationId:id,state:delivered}),null);
});
test('untrusted sent-ID list blocks notices, does not reset ledger',()=>{
 const t=fixture();
 for(const state of [{guardDeliveredKeys:['nothex']},
  {guardDeliveredKeys:[t.key,t.key]},
  {guardNotice:{ticket:t,phase:'unknown'}},
  {guardNotice:{ticket:t,phase:'prepared'},guardDeliveredKeys:[t.key]}]){
  assert.equal(validateGuardOutboxState(state),false);
  assert.throws(()=>prepareGuardNotice(state,t));
 }
});
test('ledger exhaustion fails closed rather than recycling identifiers',()=>{
 const t=fixture();
 const keys=Array.from({length:256},(_,i)=>i.toString(16).padStart(24,'0'));
 const state={guardDeliveredKeys:keys,guardNotice:{ticket:t,phase:'press_intent'}};
 assert.equal(validateGuardOutboxState(state),true);
 assert.throws(()=>completeGuardNotice(state),/guard_delivery_ledger_full/);
});
test('next notice requires validated live installed chat identity',async()=>{
 let journalReads=0;
 const t=fixture();
 const chosen=await nextGuardNotice({chatUrl:chat,state:{},
  readPlist:async()=>plist,
  readJournal:async()=>{journalReads++;return JSON.stringify(t)+'\n'}});
 assert.equal(chosen.key,t.key);
 assert.equal(journalReads,1);
});
test('different or altered service binding blocks before reading journal',async()=>{
 let called=0;
 await assert.rejects(()=>nextGuardNotice({chatUrl:chat2,state:{},
  readPlist:async()=>plist,
  readJournal:async()=>{called++;return ''}}),/guard_chat_binding_unverified/);
 assert.equal(called,0);
});
test('unexpected plist is never trusted as project membership proof',async()=>{
 await assert.rejects(()=>nextGuardNotice({chatUrl:chat,state:{},
  readPlist:async()=>plist.replace('safe-watcher','unsafe-watcher'),
  readJournal:async()=>JSON.stringify(fixture())}),/guard_chat_binding_unverified/);
});
test('missing incident file produces no notification',async()=>{
 const r=await nextGuardNotice({chatUrl:chat,state:{},readPlist:async()=>plist,
  readJournal:async()=>{throw Object.assign(Error('missing'),{code:'ENOENT'})}});
 assert.equal(r,null);
});
test('oversized journal cannot become a browser message',async()=>{
 await assert.rejects(()=>nextGuardNotice({chatUrl:chat,state:{},
  readPlist:async()=>plist,
  readJournal:async()=> 'x'.repeat(2*1024*1024+1)}),/guard_journal_untrusted/);
});
test('no browser execution path exists inside standalone outbox module',()=>{
 const source=readFileSync(resolve(import.meta.dirname,
  '../stage2/guard-incident-outbox.mjs'),'utf8');
 assert.doesNotMatch(source,/browser\(|sendToChat\(|computer\.act|child_process|spawn\(/);
 assert.match(source,/guard_delivery_ledger_full/);
});
test('Watcher adds receipt prefix and preserves one-writer proof',()=>{
 const s=readFileSync(resolve(import.meta.dirname,'../stage2/chatgpt-loop.mjs'),'utf8');
 assert.match(s,/IOANT-GUARD-INCIDENT/);
 assert.match(s,/await nextGuardNotice\(\{chatUrl:opts\.url,state\}\)/);
 assert.match(s,/await sendToChat\(nowTarget,opts\.url,/);
 assert.match(s,/state=markGuardPressIntent\(state\)/);
 assert.match(s,/await atomicState\(stateFile,state\)/);
 assert.match(s,/state\.feedbackPending\)\{/);
 assert.match(s,/const unlock=await acquireConversationLock\(workDir\)/);
});
