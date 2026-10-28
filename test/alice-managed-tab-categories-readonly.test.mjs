import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {categoryForTab,summarizeTabCategories,inspectAliceTabCategories}
 from '../scripts/alice-managed-tab-categories-readonly.mjs';
const exact='https://chatgpt.com/g/g-p-6acaef839af081919426a885b3209f54-ai-mc-alice/c/6ade11a5-f0c0-83ec-add1-8a0cff00c938';
const status={profile:'alice-ai',driver:'openclaw',engine:'chromium',
 running:true,headless:false,cdpReady:true,cdpPort:18801,pid:888};
test('exact chat, other chat and wrong project are counted separately',()=>{
 const r=summarizeTabCategories(status,{tabs:[
  {url:exact},{url:exact.replace(/6ade11a5-f0c0-83ec-add1-8a0cff00c938/,'another-chat-123456789')},
  {url:'https://chatgpt.com/c/other-conversation'}, {url:'https://chatgpt.com/g/g-p-6acaef839af081919426a885b3209f54-ai-mc-alice'}]});
 assert.equal(r.state,'observed');assert.equal(r.exactChatUnique,true);
 assert.equal(r.categories.exactAliceChat,1);
 assert.equal(r.categories.otherAliceProject,2);
 assert.equal(r.categories.otherChatGPT,1);
});
test('login and blank pages are distinct; does not infer login success',()=>{
 const r=summarizeTabCategories(status,{tabs:[
  {url:'about:blank'}, {url:'chrome://newtab/'},
  {url:'https://auth.openai.com/authorize?token=private123'},
  {url:'https://chatgpt.com/'}]});
 assert.equal(r.reason,'login_related_page_observed');
 assert.equal(r.categories.loginRelated,1);
 assert.equal(r.categories.blankOrNewTab,2);
 assert.equal(r.categories.chatgptHome,1);
 assert.doesNotMatch(JSON.stringify(r),/private123|authorize|openai.com/);
});
test('exact chat with unknown tracking query does not silently grant exact identity',()=>{
 assert.equal(categoryForTab({url:exact+'?token=private'}),'otherAliceProject');
 assert.equal(categoryForTab({url:exact+'?utm_source=chatgpt.com'}),'exactAliceChat');
});
test('duplicate exact conversation tabs are not unique',()=>{
 const r=summarizeTabCategories(status,{tabs:[{url:exact},{url:exact}]});
 assert.equal(r.categories.exactAliceChat,2);
 assert.equal(r.exactChatUnique,false);
});
test('no exact chat with blank startup page is an observed state, not failure',()=>{
 const r=summarizeTabCategories(status,{tabs:[{url:'about:blank'}]});
 assert.equal(r.reason,'blank_or_new_tab_observed');
 assert.equal(r.exactChatUnique,false);
});
test('foreign domains, invalid rows and plain HTTP cannot become exact chat',()=>{
 for(const url of ['http://chatgpt.com/','https://chatgpt.com.evil.example/',
  'https://other.example/?url='+encodeURIComponent(exact)]){
  assert.notEqual(categoryForTab({url}),'exactAliceChat');
 }
 assert.equal(categoryForTab({url:'not a valid URL'}),'unknown');
 assert.equal(categoryForTab(null),'unknown');
});
test('wrong managed profile and unknown payload shape fail closed',()=>{
 assert.equal(summarizeTabCategories({...status,profile:'chrome'},
  {tabs:[{url:exact}]}).state,'blocked');
 assert.equal(summarizeTabCategories(status,{unexpected:true}).state,'inconclusive');
});
test('mac runtime and CLI failure publish no raw error contents',async()=>{
 const bad=await inspectAliceTabCategories({platform:'linux'});
 assert.equal(bad.reason,'private_macos_runtime_required');
 const failure=await inspectAliceTabCategories({platform:'darwin',
  runtimeCheck:async()=>true,call:async()=>{throw Error('secret token 123')}});
 assert.equal(failure.state,'inconclusive');
 assert.doesNotMatch(JSON.stringify(failure),/secret token|123/);
});
test('live interface only queries exact profile status and tabs',async()=>{
 const calls=[];
 const x=await inspectAliceTabCategories({platform:'darwin',
  runtimeCheck:async()=>true,call:async args=>{
   calls.push(args);return args.includes('status')?status:{tabs:[{url:exact}]};
  }});
 assert.deepEqual(calls,[
  ['browser','--browser-profile','alice-ai','--json','status'],
  ['browser','--browser-profile','alice-ai','tabs','--json']]);
 assert.equal(x.browserTabMetadataRead,true);
 assert.equal(x.exactChatUnique,true);
 assert.equal(x.browserNavigation,false);
 assert.equal(x.chatMessageSent,false);
 assert.equal(x.credentialsEmitted,false);
});
test('source cannot navigate, invoke computer, or emit full tab rows',()=>{
 const s=readFileSync(new URL('../scripts/alice-managed-tab-categories-readonly.mjs',import.meta.url),'utf8');
 assert.match(s,/rawUrlsEmitted:false/);
 assert.match(s,/pageContentRead:false/);
 assert.doesNotMatch(s,/'browser',\s*'open'|['"]nodes['"],\s*['"]invoke['"]|['"]computer.act['"]|['"]config['"],\s*['"]set['"]/);
});
