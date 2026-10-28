import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeManagedTarget,summarizeNativeReadProvider,
 inspectDedicatedNativeReady} from '../scripts/alice-managed-native-readiness.mjs';
const url='https://chatgpt.com/g/g-p-6acaef839af081919426a885b3209f54-ai-mc-alice/c/6ade11a5-f0c0-83ec-add1-8a0cff00c938';
const browser={profile:'alice-ai',driver:'openclaw',engine:'chromium',
 running:true,headless:false,cdpReady:true,cdpPort:18801,pid:222};
const node={result:{nodes:[{connected:true,nodeId:'private-node',
 platform:'macos',computerUse:{contractVersion:2,
 provider:{id:'cua-computer',generation:'g'},
 actions:['list_windows','get_window_state','set_value'],
 deliveryModes:['background','foreground']}}]}};
const run=(tabs,st=browser,ns=node)=>inspectDedicatedNativeReady({
 platform:'darwin',runtimeCheck:async()=>true,
 call:async args=>args[0]==='nodes'?ns:args.includes('status')?st:tabs});
test('unopened dedicated chat requests manual navigation only',async()=>{
 const x=await run({tabs:[{url:'about:blank'}]});
 assert.equal(x.state,'await_operator_manual_navigation');
 assert.equal(x.nativeComputerActInvoked,false);
 assert.equal(x.navigationAttempted,false);
 assert.equal(x.chatMessageSent,false);
});
test('one exact Alice Project Chat enables only next read-only native gate',async()=>{
 const x=await run({tabs:[{url}]});
 assert.equal(x.state,'ready_for_native_window_observation');
 assert.equal(x.nativeReadAdvertised,true);
 assert.equal(x.backgroundSetValueAdvertised,true);
 assert.equal(x.nativeWindowOwnerVerified,false);
 assert.equal(x.chatDeliveryAuthorized,false);
 assert.doesNotMatch(JSON.stringify(x),/private-node|chatgpt.com|g-p-6aca/);
});
test('other ChatGPT conversation and URLs with trackers are not accepted',async()=>{
 const x=await run({tabs:[{url:'https://chatgpt.com/c/other'},
  {url:url+'?invalid=true'}]});
 assert.equal(x.state,'await_operator_manual_navigation');
});
test('duplicate exact chat tabs refuse to guess',async()=>{
 const x=await run({tabs:[{url},{url}]});
 assert.equal(x.state,'blocked');
 assert.equal(x.reason,'duplicate_exact_chat_tabs_in_dedicated_profile');
});
test('wrong profile, missing pid, absent CDP, headless fail closed',()=>{
 for(const st of [{...browser,profile:'user'},{...browser,pid:null},
  {...browser,cdpReady:false},{...browser,headless:true}]){
  assert.equal(summarizeManagedTarget(st,{tabs:[{url}]}).state,'blocked');
 }
});
test('bad tab envelope remains inconclusive, never becomes allowed',()=>{
 assert.equal(summarizeManagedTarget(browser,{unknown:1}).state,'inconclusive');
});
test('native provider permissions are advertised, not asserted as granted',()=>{
 const bad={result:{nodes:[{...node.result.nodes[0],
  computerUse:{contractVersion:2,provider:{id:'other',generation:'g'},
  actions:['list_windows','get_window_state']}}]}};
 assert.equal(summarizeNativeReadProvider(bad).nativeReadAdvertised,false);
});
test('runtime and CLI failure do not use alternate Chrome or output secrets',async()=>{
 const platform=await inspectDedicatedNativeReady({platform:'linux'});
 assert.equal(platform.reason,'private_macos_runtime_required');
 const x=await inspectDedicatedNativeReady({platform:'darwin',
  runtimeCheck:async()=>true,call:async()=>{throw Error('private secret')}});
 assert.equal(x.state,'inconclusive');
 assert.doesNotMatch(JSON.stringify(x),/private secret/);
});
test('readiness source cannot navigate, send, invoke computer or mutate config',()=>{
 const s=readFileSync(new URL('../scripts/alice-managed-native-readiness.mjs',import.meta.url),'utf8');
 assert.match(s,/nativeComputerActInvoked:false/);
 assert.match(s,/chatDeliveryAuthorized:false/);
 assert.doesNotMatch(s,/'browser',\s*'open'|['"]nodes['"],\s*['"]invoke['"]|['"]set['"],|['"]computer.act['"]|['"]browser_prepare['"]/);
});
