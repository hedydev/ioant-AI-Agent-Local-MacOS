import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseProjectChatUrl} from '../stage2/project-chat-routing.mjs';
import {UI_MARKER,inspectProjectChatUi,uiEvaluateFunction,
 observeProjectChatUi} from '../stage2/project-chat-ui-observer.mjs';

const ROOT=resolve(import.meta.dirname,'..');
const manifest=JSON.parse(readFileSync(resolve(ROOT,'config/chat-projects.json'),'utf8'));
const url=manifest.projects[0].chatUrl;
const parsed=parseProjectChatUrl(url);
const sameDifferentLabel='https://chatgpt.com/g/'+parsed.projectId+'-renamed/c/'+parsed.conversationId;
const other='https://chatgpt.com/g/'+parsed.projectId+'/c/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function elem({tag='BUTTON',aria=null,title=null,text='',closest=null}={}){
 return {getAttribute:k=>k==='aria-label'?aria:k==='title'?title:null,
  tagName:tag,textContent:text,closest:()=>closest};
}
function fixture({href=url,buttons=[],alerts=[],composer=true,hasMain=true}={}){
 const doc={
  querySelector:selector=>{
   if(selector==='main')return hasMain?{}:null;
   if(selector==='#prompt-textarea')return composer?{}:null;
   return null;
  },
  querySelectorAll:selector=>
   selector.startsWith('button,')?buttons:
   selector==='[role="alert"],[role="status"]'?alerts:[]
 };
 return inspectProjectChatUi(doc,{href});
}
const output=v=>JSON.parse(v.slice(UI_MARKER.length));

test('read-only page collector exposes no chat or input text, only allowlisted control counts',()=>{
 const secret='SECRET-USER-CHAT-BODY-NEVER-RETURNED';
 const out=fixture({buttons:[
  elem({aria:'New chat'}),elem({title:'新建对话'}),
  elem({aria:secret,text:secret}),elem({text:'New chat',closest:{}}),
  elem({aria:'Save',text:'my password'})],
  alerts:[elem({text:secret})]});
 assert.ok(out.startsWith(UI_MARKER));
 assert.doesNotMatch(out,/SECRET|password|my password/);
 const data=output(out);
 assert.equal(data.url,url);
 assert.equal(data.newChatUiCandidates,2);
 assert.equal(data.explicitContextLimit,'unknown');
 assert.equal(data.composerPresent,true);
 assert.equal(data.hasMain,true);
 assert.equal(data.examinedControls,5);
 assert.ok(uiEvaluateFunction.startsWith('() => '));
 assert.doesNotMatch(uiEvaluateFunction,/\.click\(|\.focus\(|\.value\s*=|fetch\(|localStorage|sessionStorage|XMLHttpRequest/);
});

test('explicit conversation limit requires known app-level banner and does not inspect assistant content',()=>{
 const wording='This conversation has reached its maximum length';
 const unknown=fixture({alerts:[elem({text:'Context 99% exhausted!'})]});
 assert.equal(output(unknown).explicitContextLimit,'unknown');
 const roleQuoted=fixture({alerts:[elem({text:wording,closest:{}})]});
 assert.equal(output(roleQuoted).explicitContextLimit,'unknown');
 const known=fixture({alerts:[elem({text:wording})]});
 assert.equal(output(known).explicitContextLimit,'explicit_limit_banner');
 const long=fixture({alerts:[elem({text:wording+' '.repeat(230)})]});
 assert.equal(output(long).explicitContextLimit,'unknown');
});

test('browser observer reads exactly one validated current conversation, no other page data',async()=>{
 const calls=[];
 const response=fixture({href:sameDifferentLabel,buttons:[elem({aria:'New chat'})]});
 const result=await observeProjectChatUi({manifest,projectKey:'openclaw-workflow',
  browser:async(...args)=>{
   calls.push(args);
   if(args.at(-1)==='tabs')return JSON.stringify({tabs:[
    {url:other,suggestedTargetId:'not-selected'},
    {url:sameDifferentLabel+'?utm_source=chatgpt.com',suggestedTargetId:'target_one'},
    {url:'https://example.com/',suggestedTargetId:'unrelated'}
   ]});
   return JSON.stringify({result:{value:response}});
  }});
 assert.equal(result.state,'observed');
 assert.equal(result.projectId,parsed.projectId);
 assert.equal(result.conversationId,parsed.conversationId);
 assert.equal(result.visibleTabs,3);
 assert.equal(result.matchingConversationTabs,1);
 assert.equal(result.newChatUiCandidates,1);
 assert.equal(result.explicitContextLimit,'unknown');
 assert.equal(result.readOnly,true);
 assert.equal(result.createsChat,false);
 assert.equal(result.sendsMessages,false);
 assert.equal(result.changesAgent,false);
 assert.deepEqual(calls.map(a=>a[1]),['tabs','evaluate']);
 assert.deepEqual(calls[1].slice(0,4),['--json','evaluate','--target-id']);
 assert.equal(calls[1][4],'--fn');
 assert.equal(calls[1][3],'target_one');
 assert.ok(!JSON.stringify(result).includes(sameDifferentLabel));
});

test('zero match and duplicated target are denied before any evaluate',async()=>{
 const run=async(tabs)=>{
  let calls=0;
  const r=await observeProjectChatUi({manifest,projectKey:'openclaw-workflow',
   browser:async(...args)=>{calls++;if(args.includes('evaluate'))throw Error('must not evaluate');
    return JSON.stringify({tabs})}});
  return {r,calls};
 };
 const missing=await run([{url:other,suggestedTargetId:'t1'}]);
 assert.equal(missing.r.state,'target_unavailable');
 assert.equal(missing.calls,1);
 const duplicate=await run([{url:url,suggestedTargetId:'t1'},
  {url:sameDifferentLabel,suggestedTargetId:'t2'}]);
 assert.equal(duplicate.r.state,'blocked');
 assert.equal(duplicate.r.reason,'duplicate_conversation_tabs');
 assert.equal(duplicate.calls,1);
 const foreign=await run([{url:'https://evil.example/g/'+parsed.projectId+'/c/'+parsed.conversationId,suggestedTargetId:'x'}]);
 assert.equal(foreign.r.state,'target_unavailable');
 const rejected=await observeProjectChatUi({manifest,projectKey:'unregistered',
  browser:async()=>{throw Error('no calls')}});
 assert.equal(rejected.state,'blocked');
});

test('unexpected target handles, changed DOM conversation, malformed and oversized browser data are rejected',async()=>{
 const check=async(tabs,answer)=>{
  return observeProjectChatUi({manifest,projectKey:'openclaw-workflow',
   browser:async(...args)=>args.includes('tabs')?JSON.stringify({tabs}):answer});
 };
 assert.equal((await check([{url,suggestedTargetId:'unsafe;rm'}],'no matter')).state,'blocked');
 assert.equal((await check([{url,suggestedTargetId:'t1'}],
  JSON.stringify({result:{value:fixture({href:other})}}))).reason,'page_changed_during_observation');
 assert.equal((await check([{url,suggestedTargetId:'t1'}],
  JSON.stringify({value:UI_MARKER+JSON.stringify({...output(fixture()),data:'private'})}))).reason,'unsafe_browser_result');
 assert.equal((await check([{url,suggestedTargetId:'t1'}],'X'.repeat(150000))).reason,'browser_read_unavailable');
 assert.equal((await observeProjectChatUi({manifest,projectKey:'openclaw-workflow',
  browser:async()=>'{not json'})).state,'inconclusive');
});
