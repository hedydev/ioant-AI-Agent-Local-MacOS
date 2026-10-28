import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyWindowOwner,inspectManagedWindowOwner} from
 '../scripts/alice-managed-window-owner-readonly.mjs';
const url='https://chatgpt.com/g/g-p-6acaef839af081919426a885b3209f54-ai-mc-alice/c/6ade11a5-f0c0-83ec-add1-8a0cff00c938';
const profile={profile:'alice-ai',driver:'openclaw',engine:'chromium',running:true,
 headless:false,cdpReady:true,cdpPort:18801,pid:4321};
const nodes={result:{nodes:[{connected:true,nodeId:'private-node',
 platform:'macos',computerUse:{contractVersion:2,provider:{id:'cua-computer',
 generation:'test-g'},actions:['list_windows','get_window_state','set_value'],
 deliveryModes:['foreground','background']}}]}};
const wins={normalWindowCount:1,onScreenNormalWindowCount:1};
const run=(t,w=wins,s=profile,n=nodes)=>inspectManagedWindowOwner({
 platform:'darwin',runtimeCheck:async()=>true,windowRead:async pid=>{
 assert.equal(pid,4321);return w;},call:async args=>args[0]==='nodes'?n:
 args.includes('status')?s:t});
test('a running managed browser with an owned GUI window and no target chat requests manual navigation',async()=>{
 const x=await run({tabs:[{url:'about:blank'}]});
 assert.equal(x.state,'await_operator_manual_navigation');
 assert.equal(x.windowOwnerAttested,true);
 assert.equal(x.exactChatTabMatches,0);
 assert.equal(x.nativeComputerActInvoked,false);
 assert.equal(x.browserNavigation,false);
});
test('owned on-screen window, exactly one tab, advertised native read permits next read-only gate',async()=>{
 const x=await run({tabs:[{url}]});
 assert.equal(x.state,'ready_for_native_window_ref_readonly');
 assert.equal(x.nativeReadAdvertised,true);
 assert.equal(x.nativeAXIdentityVerified,false);
 assert.equal(x.chatMessageSent,false);
});
test('an absent GUI window is blocked even with valid Browser and CUA',async()=>{
 const x=await run({tabs:[{url}]},{normalWindowCount:0,onScreenNormalWindowCount:0});
 assert.equal(x.state,'blocked');
 assert.equal(x.reason,'managed_pid_has_no_normal_window');
});
test('a hidden owned window cannot advance native window ref gate',async()=>{
 const x=await run({tabs:[{url}]},{normalWindowCount:1,onScreenNormalWindowCount:0});
 assert.equal(x.state,'blocked');
 assert.equal(x.reason,'owned_window_not_onscreen');
});
test('bogus WindowServer counts fail closed',async()=>{
 for(const w of [{normalWindowCount:1,onScreenNormalWindowCount:2},
  {normalWindowCount:999,onScreenNormalWindowCount:1},{}]){
  const x=await run({tabs:[]},w);
  assert.equal(x.state,'inconclusive');
 }
});
test('different profile or absent browser PID fail before WindowServer observation',async()=>{
 let accessed=false;
 const x=await inspectManagedWindowOwner({platform:'darwin',runtimeCheck:async()=>true,
  call:async()=>({...profile,pid:null}),windowRead:async()=>{accessed=true;}});
 assert.equal(x.state,'blocked');
 assert.equal(accessed,false);
});
test('two matching Alice tabs block native readiness even when window owner is verified',async()=>{
 const x=await run({tabs:[{url},{url}]});
 assert.equal(x.state,'await_operator_manual_navigation');
 assert.equal(x.reason,'exact_chat_tab_not_unique');
 assert.equal(x.exactChatTabMatches,2);
});
test('WindowServer error sanitized with no browser mutation',async()=>{
 const x=await inspectManagedWindowOwner({platform:'darwin',
  runtimeCheck:async()=>true,call:async args=>args[0]==='nodes'?nodes:
  args.includes('status')?profile:{tabs:[{url}]},
  windowRead:async()=>{throw Error('secret window title')}});
 assert.equal(x.reason,'windowserver_read_unavailable');
 assert.doesNotMatch(JSON.stringify(x),/secret window title/);
 assert.equal(x.changedFocus,false);
});
test('source never reads WindowServer titles or pixels or invokes native CUA',()=>{
 const s=readFileSync(new URL('../scripts/alice-managed-window-owner-readonly.mjs',import.meta.url),'utf8');
 assert.match(s,/kCGWindowOwnerPID/);
 assert.match(s,/kCGWindowLayer/);
 assert.doesNotMatch(s,/kCGWindowName|CGWindowListCreateImage|['"]nodes['"],\s*['"]invoke['"]|['"]computer.act['"]/);
});
