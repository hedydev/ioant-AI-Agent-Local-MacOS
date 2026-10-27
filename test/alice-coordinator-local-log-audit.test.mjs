import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyLine,summarizeLines} from '../scripts/alice-coordinator-local-log-audit.mjs';

test('Alice missing tab and passive waiting are classified without raw URLs',()=>{
 assert.equal(classifyLine('[loop] Waiting for authorized ChatGPT conversation: Authorized ChatGPT tab unavailable: different_chat_visible (profile=chrome, visible=9, chatgpt=3, sameConversationId=0)'), 'relay_missing_target');
 assert.equal(classifyLine('[loop] Waiting for authorized ChatGPT conversation: no exact tab'),'relay_waiting');
 assert.equal(classifyLine('CHROME_RELAY_ZERO_TABS'),'relay_zero_tabs');
 assert.equal(classifyLine('duplicate_exact'),'relay_duplicate_target');
});
test('Alice page readiness and handshake events remain distinct',()=>{
 assert.equal(classifyLine('[loop] ChatGPT tab not ready: composer missing'), 'page_not_ready');
 assert.equal(classifyLine('[loop] Waiting for a structured ChatGPT task; latest reply contains no executable JSON.'),'page_ready_or_idle');
 assert.equal(classifyLine('[loop] Alice coordinator handshake confirmed in exact Project Chat.'),'handshake_confirmed');
 assert.equal(classifyLine('[loop] Alice coordinator handshake send uncertain; no blind resend.'),'handshake_ambiguous');
 assert.equal(classifyLine('[loop] AliceAI isolated coordinator: read-only UI probe only; all host/task write actions rejected.'),'worker_start');
});
test('never echo raw log content or identities in classifications',()=>{
 const secret='https://chatgpt.com/g/g-p-6acaef839af081919426a885b3209f54-ai-mc-alice/c/6ade11a5-f0c0-83ec-add1-8a0cff00c938';
 const result=summarizeLines([
  '[loop] Waiting for authorized ChatGPT conversation: different_chat_visible '+secret,
  'Private chat message token=secret-value',
  '[loop] Alice coordinator handshake confirmed in exact Project Chat.'
 ]);
 assert.equal(result.counts.relay_missing_target,1);
 assert.equal(result.counts.handshake_confirmed,1);
 assert.equal(result.recent.length,2);
 assert.equal(JSON.stringify(result).includes(secret),false);
 assert.equal(JSON.stringify(result).includes('secret-value'),false);
});
test('missing event remains null and counts are bounded to recent sample',()=>{
 assert.equal(classifyLine('ordinary stdout arbitrary text'),null);
 assert.equal(classifyLine('X'.repeat(4200)),null);
 const lines=Array(400).fill('CHROME_RELAY_ZERO_TABS');
 const result=summarizeLines(lines);
 assert.equal(result.counts.relay_zero_tabs,350);
 assert.equal(result.recent.length,6);
 assert.ok(result.recent.every(x=>x==='relay_zero_tabs'));
});
