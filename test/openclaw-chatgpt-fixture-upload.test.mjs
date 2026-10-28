import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {exactTab,uniqueRef,unpack,pageFunction,run}
 from '../scripts/openclaw-chatgpt-fixture-upload.mjs';
const CHAT='https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/6ae18e93-e2a0-83ec-aac9-88105079f208';
const tab=(url=CHAT)=>({url,suggestedTargetId:'safe-node'});
test('exact project chat must be unique and have safe target reference',()=>{
 assert.equal(exactTab([tab()]),'safe-node');
 assert.equal(exactTab({result:{tabs:[tab()]}}),'safe-node');
 for(const value of [[],[tab(),tab()],[tab(CHAT+'?x=1')],
  [tab('https://chatgpt.com/c/6ae18e93-e2a0-83ec-aac9-88105079f208')],
  [{...tab(),suggestedTargetId:'not safe'}]])
  assert.throws(()=>exactTab(value));
});
test('ARIA controls must be single matching refs',()=>{
 const snapshot='- button "Add files and more" [ref=e17]\n- menuitem "Upload from computer" [ref=e29]';
 assert.equal(uniqueRef(snapshot,/add files and more/i),'e17');
 assert.equal(uniqueRef(snapshot,/upload from computer/i),'e29');
 for(const x of [
  '- button "Add files and more"',
  '- button "Add files and more" [ref=e1]\n- button "Add files and more" [ref=e2]',
  '- button "Add files and more" [ref=../abc]'])
  assert.throws(()=>uniqueRef(x,/add files and more/i));
});
test('bounded UI proof parser strips transport envelopes',()=>{
 const evidence={exact:true,editor:true,attached:false,receipt:false};
 const raw='IOANT_FILE_UI_PROOF:'+JSON.stringify(evidence);
 assert.deepEqual(unpack({result:{content:[{text:raw}]}}),evidence);
 assert.deepEqual(unpack(JSON.stringify({result:raw})),evidence);
 assert.equal(unpack('arbitrary private chat content'),null);
});
test('page-side structural checker compiles and does not return chat content',()=>{
 const code=pageFunction();
 assert.ok(code.startsWith('() => {'));
 assert.equal(typeof new Function('return ('+code+')')(),'function');
 assert.ok(code.includes('IOANT_FILE_UI_PROOF:'));
 assert.ok(code.includes('message-author-role'));
 assert.ok(!code.includes('JSON.stringify(document.body)'));
});
test('private runtime gate blocks before fixture or browser access',async()=>{
 const result=await run({mode:'inspect',allowedRuntime:async()=>false});
 assert.equal(result.state,'blocked');
 assert.equal(result.reason,'private_runtime_required');
 assert.equal(result.invokedComputerAct,false);
 assert.equal(result.screenshotTaken,false);
});
test('unknown mode refuses before any file read',async()=>{
 const result=await run({mode:'delete',allowedRuntime:async()=>true});
 assert.equal(result.state,'blocked');
 assert.equal(result.reason,'unsupported_mode');
});
test('source is exact-fixture scoped, no arbitrary paths or new browser navigation',()=>{
 const s=readFileSync(resolve(import.meta.dirname,
  '../scripts/openclaw-chatgpt-fixture-upload.mjs'),'utf8');
 assert.match(s,/IOANT-ChatGPT-Upload-Fixture-20261028.txt/);
 assert.match(s,/syntheticFixtureOnly:true/);
 assert.match(s,/noAutomaticRetry:true/);
 assert.match(s,/state\('press_intent'\)/);
 assert.doesNotMatch(s,/CGEventPost|osascript|launchctl|browser navigate|browser open|--element|--screenshot/);
});

test('the sender uses scoped user-turn attachment receipt, not global message text',()=>{
 const s=readFileSync(resolve(import.meta.dirname,
  '../scripts/openclaw-chatgpt-fixture-upload.mjs'),'utf8');
 assert.match(s,/buildScopedReceiptProbe/);
 assert.match(s,/classifyScopedReceipt\(raw\)/);
 assert.match(s,/scopedDeliveryReceipt\(id\)/);
 assert.doesNotMatch(s,/if\(\(await proof\(id\)\)\.receipt\)/);
 assert.match(s,/state\('press_intent'\)/);
 assert.match(s,/prior_send_state_exists/);
});
