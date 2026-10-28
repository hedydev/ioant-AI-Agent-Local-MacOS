import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {strictStatus,summarizeCdpEvidence,inspectCdpNativeWindow} from
 '../scripts/alice-managed-cdp-window-readonly.mjs';
const url='https://chatgpt.com/g/g-p-6acaef839af081919426a885b3209f54-ai-mc-alice/c/6ade11a5-f0c0-83ec-add1-8a0cff00c938';
const status={profile:'alice-ai',driver:'openclaw',engine:'chromium',
 running:true,headless:false,cdpReady:true,cdpPort:18801,pid:9321};
const cli={tabs:[{url:''}]};
const cdp=[{type:'page',url:'about:blank'}, {type:'page',url},
 {type:'service_worker',url:'https://chatgpt.com/some-worker'},
 {type:'iframe',url:'https://chatgpt.com/assets'}];
const owner={state:'ready_for_native_window_ref_readonly',windowOwnerAttested:true,
 exactChatTabMatches:1,nativeReadAdvertised:true,backgroundSetValueAdvertised:true,
 ownedNormalWindowCount:3,ownedOnScreenWindowCount:1};
const run=(overrides={})=>inspectCdpNativeWindow({
 platform:'darwin',runtimeCheck:async()=>true,
 call:async args=>args[0]==='nodes'?{result:{nodes:[]}}:
 args[0]==='browser'&&args.includes('tabs')?cli:status,
 processRead:async()=>'/Applications/Chromium --remote-debugging-port=18801 --user-data-dir=/private',
 cdpRead:async()=>cdp,windowOwnerRead:async()=>owner,...overrides
});
test('profile owner status must match registered headed managed CDP process',()=>{
 assert.equal(strictStatus(status),true);
 for(const x of [{...status,pid:null},{...status,profile:'chrome'},
  {...status,driver:'extension'},{...status,cdpPort:9222},
  {...status,cdpReady:false},{...status,headless:true}])
  assert.equal(strictStatus(x),false);
});
test('CLI blank tab versus owned CDP page yields a single exact target',()=>{
 const r=summarizeCdpEvidence(status,cli,cdp);
 assert.equal(r.state,'cdp_exact_page_attested');
 assert.equal(r.cdpExactPageMatches,1);
 assert.equal(r.cliExactTabMatches,0);
 assert.equal(r.cliCdpDisagree,true);
 assert.equal(r.cdpPageTargetCount,2);
});
test('non-page CDP target matching exact chat cannot satisfy page gate',()=>{
 const r=summarizeCdpEvidence(status,cli,[{type:'service_worker',url}]);
 assert.equal(r.state,'blocked');
 assert.equal(r.reason,'cdp_exact_chat_page_absent');
});
test('duplicate exact CDP page targets fail closed',()=>{
 const r=summarizeCdpEvidence(status,cli,
 [{type:'page',url},{type:'page',url}]);
 assert.equal(r.reason,'cdp_exact_chat_page_not_unique');
});
test('invalid CDP target and malformed URL fail closed',()=>{
 assert.equal(summarizeCdpEvidence(status,cli,[{}]).state,'inconclusive');
 assert.equal(summarizeCdpEvidence(status,cli,[{type:'page'}]).state,'inconclusive');
 assert.equal(summarizeCdpEvidence(status,cli,[]).state,'inconclusive');
 assert.equal(summarizeCdpEvidence(status,cli,
  Array.from({length:129},()=>({type:'page',url:'about:blank'}))).state,'inconclusive');
});
test('native window owner and CDP exact page together permit read-only windowRef gate',async()=>{
 const r=await run();
 assert.equal(r.state,'ready_for_native_window_ref_readonly');
 assert.equal(r.windowOwnerAttested,true);
 assert.equal(r.nativeReadAdvertised,true);
 assert.equal(r.targetPageInOwnedWindowVerified,false);
 assert.equal(r.loginVerified,false);
 assert.equal(r.chatDeliveryAuthorized,false);
 assert.equal(r.nativeComputerActInvoked,false);
 assert.doesNotMatch(JSON.stringify(r),/chatgpt\.com|g-p-|private|18801|9321|some-worker/);
});
test('uncorrelated process cannot attest localhost CDP inventory',async()=>{
 const r=await run({processRead:async()=>'/Applications/Chromium --remote-debugging-port=9222'});
 assert.equal(r.reason,'cdp_port_owner_not_attested');
 assert.equal(r.windowOwnerAttested,undefined);
});
test('page visible but window ownership missing cannot advance',async()=>{
 const r=await run({windowOwnerRead:async()=>({...owner,
  windowOwnerAttested:false,state:'blocked'})});
 assert.equal(r.state,'blocked');
 assert.equal(r.chatDeliveryAuthorized,false);
});
test('provider unavailable or window hidden fail read-only gate',async()=>{
 const r=await run({windowOwnerRead:async()=>({...owner,
  nativeReadAdvertised:false,state:'blocked'})});
 assert.equal(r.state,'blocked');
});
test('PID changes during observation never count as verified',async()=>{
 let statusCalls=0;
 const r=await run({call:async args=>{
  if(args.includes('tabs'))return cli;
  statusCalls++;
  return statusCalls===1?status:{...status,pid:9322};
 }});
 assert.equal(r.reason,'managed_browser_pid_changed');
});
test('permission errors and source URLs are sanitized',async()=>{
 const x=await run({cdpRead:async()=>{throw Error('https://chatgpt.com/private')}}); 
 assert.equal(x.state,'inconclusive');
 assert.doesNotMatch(JSON.stringify(x),/chatgpt\.com\/private/);
});
test('unrelated runtime cannot inspect CDP or WindowServer',async()=>{
 let invoked=false;
 const x=await run({platform:'linux',cdpRead:async()=>{invoked=true;}});
 assert.equal(x.reason,'private_macos_runtime_required');
 assert.equal(invoked,false);
});
test('source uses local HTTP metadata only, never sends CDP commands or native input',()=>{
 const src=readFileSync(new URL('../scripts/alice-managed-cdp-window-readonly.mjs',
 import.meta.url),'utf8');
 assert.match(src,/path:'\/json\/list'/);
 assert.match(src,/--remote-debugging-port=18801/);
 assert.doesNotMatch(src,/WebSocket\(|\/json\/new|\/json\/activate|Page\.navigate|Runtime\.evaluate|['"]nodes['"],\s*['"]invoke['"]|['"]computer\.act['"]/);
});
