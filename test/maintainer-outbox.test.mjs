import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseProjectChatUrl} from '../stage2/project-chat-routing.mjs';
import {enqueueZeroTabNotice,validateMaintainerNotice,maintainerReceipt,
 maintainerNoticeMessage,markMaintainerPressIntent,completeMaintainerNotice,
 pendingMaintainerPhase} from '../stage2/maintainer-outbox.mjs';
const root=resolve(import.meta.dirname,'..');
const manifest=JSON.parse(readFileSync(resolve(root,'config/chat-projects.json'),'utf8'));
const u=parseProjectChatUrl(manifest.projects[0].chatUrl);
const route={projectKey:'openclaw-workflow',conversationId:u.conversationId};
const options={...route,observedAt:'2026-10-25T10:00:00.000Z',id:'maintainer-aabbccddeeff'};
const fresh=()=>enqueueZeroTabNotice({lastTaskId:'old'},options);
test('one zero-tab incident is bound to the exact registered Chat and does not erase other watcher state',()=>{
 const x=fresh();
 assert.equal(x.created,true);
 assert.equal(x.state.lastTaskId,'old');
 assert.equal(x.state.maintainerNotice.id,'maintainer-aabbccddeeff');
 assert.equal(x.state.maintainerNotice.phase,'prepared');
 assert.equal(pendingMaintainerPhase(x.state,route),'prepared');
 assert.deepEqual(validateMaintainerNotice(x.state.maintainerNotice,route),
  x.state.maintainerNotice);
});
test('same incident is idempotent, cannot be overwritten by another Chat',()=>{
 const a=fresh();
 const b=enqueueZeroTabNotice(a.state,{...options,id:'maintainer-112233445566'});
 assert.equal(b.created,false);
 assert.equal(b.state,a.state);
 assert.throws(()=>enqueueZeroTabNotice(a.state,{...options,conversationId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}),/invalid_maintainer_notice/);
 assert.throws(()=>enqueueZeroTabNotice(a.state,{...options,projectKey:'alice-ai'}),/invalid_maintainer_notice/);
});
test('report is bounded and contains only the local outage summary, no unrelated tab content',()=>{
 const n=fresh().state.maintainerNotice;
 const prefix=maintainerReceipt(n,route);
 const body=maintainerNoticeMessage(n,route);
 assert.match(prefix,/^\[IOANT-OPENCLAW MAINTAINER NOTICE maintainer-aabbccddeeff\]$/);
 assert.ok(body.startsWith(prefix));
 assert.ok(body.includes('zero visible tabs'));
 assert.ok(body.length<1400);
 assert.ok(!body.includes('SECRET'));
 assert.ok(!body.includes('https://'));
});
test('pre-press intent persists and forbids a second Enter attempt',()=>{
 const initial=fresh().state;
 const pressed=markMaintainerPressIntent(initial,route);
 assert.equal(pressed.maintainerNotice.phase,'press_intent');
 assert.equal(initial.maintainerNotice.phase,'prepared');
 assert.equal(pendingMaintainerPhase(pressed,route),'press_intent');
 assert.throws(()=>markMaintainerPressIntent(pressed,route),/maintainer_send_uncertain_no_replay/);
});
test('confirmed role receipt safely clears just the Maintainer entry',()=>{
 const first=fresh().state;
 const confirmed=completeMaintainerNotice(markMaintainerPressIntent(first,route),route);
 assert.equal(pendingMaintainerPhase(confirmed,route),'none');
 assert.equal(confirmed.lastTaskId,'old');
 assert.ok(!Object.hasOwn(confirmed,'maintainerNotice'));
});
test('invalid incident, forged phase or changed immutable identity is blocked',()=>{
 const n=fresh().state.maintainerNotice;
 for(const modified of [
  {...n,phase:'sent'}, {...n,id:'bad'}, {...n,reason:'restart_chrome'},
  {...n,secret:'bad'}, {...n,observedAt:'yesterday'},
  {...n,conversationId:'cccccccc-cccc-cccc-cccc-cccccccccccc'}
 ])assert.throws(()=>validateMaintainerNotice(modified,route),/invalid_maintainer_notice/);
 assert.throws(()=>enqueueZeroTabNotice(null,options),/untrusted_maintainer_incident/);
 assert.throws(()=>enqueueZeroTabNotice({}, {...options,id:'bad'}),/invalid_maintainer_notice/);
});
test('watcher source queues only two explicit Chrome zero-tab misses, then uses existing receipt-first sender',()=>{
 const s=readFileSync(resolve(root,'stage2/chatgpt-loop.mjs'),'utf8');
 assert.match(s,/tabs\.length===0&&matches\.length===0&&profile==='chrome'/);
 assert.match(s,/failure\.code='CHROME_RELAY_ZERO_TABS'/);
 assert.match(s,/if\(consecutiveZeroTabs<2\)return/);
 assert.match(s,/state=out\.state;\s*await atomicState\(stateFile,state\)/);
 assert.match(s,/maintainerNoticeMessage\(state\.maintainerNotice,route\)/);
 assert.match(s,/state=markMaintainerPressIntent\(state,route\);\s*await atomicState\(stateFile,state\)/);
 assert.match(s,/page\.users\.some\(msg=>msg\.startsWith\(receipt\)\)/);
 assert.match(s,/phase==='press_intent'/);
 assert.match(s,/await confirmUserReceipt\(opts\.url,receipt\)/);
 assert.doesNotMatch(s,/maintainer.*chrome\.debugger\.attach|maintainer.*browser\('press'/);
});
