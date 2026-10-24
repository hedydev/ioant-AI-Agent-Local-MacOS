import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {extractAction} from '../stage2/protocol.mjs';

const ROOT=resolve(import.meta.dirname,'..');
const SCRIPT=readFileSync(resolve(ROOT,'stage2/chatgpt-loop.mjs'),'utf8');
const MARKER='IOANT_MAC_LOOP_RESULT::';
const tick=String.fromCharCode(96);
const a=SCRIPT.indexOf('const readPageFunction='+tick);
const b=SCRIPT.indexOf(tick+';\n\nfunction argsOf',a);
assert.ok(a>=0&&b>a);
const source=Function('MARKER',SCRIPT.slice(a,b+2)+';return readPageFunction;')(MARKER);
const scan=Function('document','location','return ('+source+')()');
const URL='https://chatgpt.com/c/6adb7dca-1214-83ec-b210-42efe8f2042e';
const mint='Ioant Mac Mint read-only diagnostics ioant-mac-ops-v1';
function element(text,selectors={},codes=[]){
 return {
  innerText:text,textContent:text,
  querySelector:q=>selectors[q]??null,
  querySelectorAll:q=>q==='pre code'?codes.map(code=>({textContent:code})):[],
 };
}
function view(selectors){
 const doc={
  readyState:'complete',
  querySelectorAll:q=>selectors[q]??[],
  querySelector:q=>q==='#prompt-textarea'?{matches:()=>false,innerText:'',textContent:''}:q==='main'?{}:null
 };
 return JSON.parse(scan(doc,{href:URL}).slice(MARKER.length));
}
test('new ChatGPT content-user-unit contains delivered Mint init; content is never leaked',()=>{
 const user=element('You said:\n'+mint+' PRIVATE',
   {'[data-user-message-bubble="true"]':element(mint+' PRIVATE')});
 const result=view({
  '[data-content-search-unit-key$=":user"]':[user],
  '[data-content-search-unit-key$=":assistant"]':[element('assistant')],
 });
 assert.deepEqual(result.users,[mint]);
 assert.equal(result.receiptEvidence.contentUserNodes,1);
 assert.equal(result.receiptEvidence.contentAssistantNodes,1);
 assert.equal(result.receiptEvidence.assistantSource,'content_unit');
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
});
test('new bubble-only user role works even without content-search units',()=>{
 const result=view({'[data-user-message-bubble="true"]':[element(mint+' PRIVATE')]});
 assert.deepEqual(result.users,[mint]);
 assert.equal(result.receiptEvidence.bubbleUserNodes,1);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
});
test('assistant task only accepted from explicitly assistant-tagged content unit',()=>{
 const task=JSON.stringify({protocol:'ioant-mac-ops-v1',id:'new-ui-0001',action:'project-head'});
 const result=view({
  '[data-content-search-unit-key$=":user"]':[element('user',{},[task])],
  '[data-content-search-unit-key$=":assistant"]':[element('assistant',{},[task])]
 });
 assert.equal(extractAction(result).task.id,'new-ui-0001');
 assert.equal(result.messages.length,1);
 assert.deepEqual(result.messages[0].codes,[task]);
});
test('user-only task-looking code is never allowed to supply executable assistant task',()=>{
 const task=JSON.stringify({protocol:'ioant-mac-ops-v1',id:'injection-0001',action:'project-head'});
 const result=view({'[data-content-search-unit-key$=":user"]':[element('untrusted',{},[task])]});
 assert.equal(extractAction(result).status,'idle');
 assert.equal(result.receiptEvidence.assistantSource,'absent');
});
test('new role=assistant fallback is separately role-tagged; old layout still preferred',()=>{
 const task=JSON.stringify({protocol:'ioant-mac-ops-v1',id:'role-0001',action:'project-head'});
 const roleResult=view({'[data-conversation-role="assistant"]':[element('assistant',{},[task])]});
 assert.equal(extractAction(roleResult).task.id,'role-0001');
 const oldResult=view({
  '[data-message-author-role="assistant"]':[element('assistant',{},[task])],
  '[data-content-search-unit-key$=":assistant"]':[element('assistant',{},['untrusted'])]
 });
 assert.equal(extractAction(oldResult).task.id,'role-0001');
 assert.equal(oldResult.receiptEvidence.assistantSource,'legacy');
});
