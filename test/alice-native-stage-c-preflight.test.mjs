import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyStageC,inspectStageC} from '../scripts/alice-native-stage-c-preflight.mjs';
import {CHROME_WIRE} from '../scripts/alice-native-browser-readonly.mjs';
const url='https://chatgpt.com/g/g-p-6acaef839af081919426a885b3209f54-ai-mc-alice/c/6ade11a5-f0c0-83ec-add1-8a0cff00c938';
const os=(active='1')=>['1','1',active,'Alice Window',url].join(CHROME_WIRE);
const status=({background=true,read=true}={})=>({result:{nodes:[{
 connected:true,nodeId:'private-mac-node',
 platform:'macos',computerUse:{contractVersion:2,
  provider:{id:'cua-computer',generation:'gen-test'},
  actions:read?['list_windows','get_window_state','set_value']:['set_value'],
  deliveryModes:background?['foreground','background']:['foreground']}
}]}});
test('inactive exact Alice tab blocks native AX without switching tabs',async()=>{
 const x=await inspectStageC({platform:'darwin',runtimeCheck:async()=>true,
  osRead:async()=>os('0'),statusRead:async()=>status()});
 assert.equal(x.state,'blocked');
 assert.equal(x.reason,'alice_tab_inactive_in_own_chrome_window');
 assert.equal(x.nextGate,'select_alice_tab_in_own_window');
 assert.equal(x.aliceTabActive,false);
 assert.equal(x.needsOperatorTabSelection,true);
 assert.equal(x.computerActInvoked,false);
 assert.equal(x.tabSwitched,false);
 assert.equal(x.chatDeliveryAuthorized,false);
 assert.doesNotMatch(JSON.stringify(x),/private-mac-node|Alice Window|chatgpt.com|gen-test/);
});
test('active unique Alice tab and CUA v2 read capabilities permit only read-only AX gate',async()=>{
 const x=await inspectStageC({platform:'darwin',runtimeCheck:async()=>true,
  osRead:async()=>os(),statusRead:async()=>status()});
 assert.equal(x.state,'ready_for_native_ax_readonly');
 assert.equal(x.nextGate,'native_ax_composer_semantics');
 assert.equal(x.providerReadAdvertised,true);
 assert.equal(x.backgroundSetValueAdvertised,true);
 assert.equal(x.providerGenerationStabilityProven,false);
 assert.equal(x.computerActInvoked,false);
 assert.equal(x.chatDeliveryAuthorized,false);
});
test('missing background set_value does not misrepresent native read admission',()=>{
 const x=classifyStageC({target:{targetActive:true},provider:{
  connected:true,id:'cua-computer',contractVersion:2,generation:'g',
  actions:['list_windows','get_window_state'],deliveryModes:['foreground']}});
 assert.equal(x.state,'ready_for_native_ax_readonly');
 assert.equal(x.backgroundSetValueAdvertised,false);
});
test('wrong chat, missing native read actions, and unsupported platform fail closed',async()=>{
 const bad=await inspectStageC({platform:'darwin',runtimeCheck:async()=>true,
  osRead:async()=>['1','1','1','Other','https://chatgpt.com/c/other'].join(CHROME_WIRE),
  statusRead:async()=>status()});
 assert.equal(bad.state,'blocked');
 assert.equal(bad.reason,'exact_alice_tab_not_uniquely_attested');
 const missing=await inspectStageC({platform:'darwin',runtimeCheck:async()=>true,
  osRead:async()=>os(),statusRead:async()=>status({read:false})});
 assert.equal(missing.state,'blocked');
 assert.equal(missing.nextGate,'native_cua_read_capabilities');
 const platform=await inspectStageC({platform:'linux',runtimeCheck:async()=>true});
 assert.equal(platform.reason,'private_macos_runtime_required');
});
test('status/OS failures never request Computer Use or deliver a Chat message',async()=>{
 const statusBad=await inspectStageC({platform:'darwin',runtimeCheck:async()=>true,
  osRead:async()=>os(),statusRead:async()=>{throw Error('private')}}); 
 assert.equal(statusBad.state,'inconclusive');
 assert.equal(statusBad.reason,'native_cua_status_unavailable');
 const osBad=await inspectStageC({platform:'darwin',runtimeCheck:async()=>true,
  osRead:async()=>{throw Error('private')}});
 assert.equal(osBad.reason,'os_tab_attestation_unavailable');
 assert.equal(osBad.computerActInvoked,false);
 assert.doesNotMatch(JSON.stringify(statusBad),/private-mac-node|private/);
});
test('source does not expose input, Chrome MCP, screenshot or browser fallback',()=>{
 const source=readFileSync(new URL('../scripts/alice-native-stage-c-preflight.mjs',import.meta.url),'utf8');
 assert.match(source,/chromeAppleScript\(\)/);
 assert.match(source,/verifyChromeTarget\(await osRead\(\)\)/);
 assert.match(source,/computerActInvoked:false/);
 assert.match(source,/tabSwitched:false/);
 assert.doesNotMatch(source,/['"](?:get_browser_state|browser_prepare|bring_to_front)['"]|\b(?:writeFile|readFile|openSync)\s*\(/);
 assert.doesNotMatch(source,/['"]nodes['"]\s*,\s*['"]invoke['"]|\bcomputer\.act\s*\(/);
});
