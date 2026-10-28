import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeProfileCatalog,summarizeProfileStatus,
 inspectAliceManagedBrowser} from '../scripts/alice-managed-browser-preflight.mjs';
const opts=(catalog,stat)=>({platform:'darwin',runtimeCheck:async()=>true,
 call:async args=>args.includes('profiles')?catalog:stat});
test('a missing dedicated profile is only an inspect result, not a launch',async()=>{
 const x=await inspectAliceManagedBrowser(opts({profiles:[
  {name:'openclaw',driver:'managed'},{name:'user',driver:'existing-session'}]}));
 assert.equal(x.state,'profile_not_registered');
 assert.equal(x.namedProfileFound,false);
 assert.equal(x.browserStarted,false);
 assert.equal(x.profileCreated,false);
 assert.equal(x.chatMessageSent,false);
});
test('a managed dedicated profile and headed process are recognized without touching tabs',async()=>{
 const x=await inspectAliceManagedBrowser(opts({profiles:[
  {name:'alice-ai',driver:'managed'}]},{
   running:true,headless:false,headlessSource:'profile'}));
 assert.equal(x.state,'headed_profile_exists');
 assert.equal(x.driverClass,'managed');
 assert.equal(x.visibleWindowMode,true);
 assert.equal(x.browserRunning,true);
 assert.equal(x.nativeCUAAuthorizationVerified,false);
 assert.equal(x.browserTabsRead,false);
});
test('headless, stopped, unknown status never claims a visible login window',async()=>{
 for(const stat of [{running:true,headless:true},{running:false,headless:false},{}]){
  const x=await inspectAliceManagedBrowser(opts({profiles:[
   {name:'alice-ai',driver:'managed'}]},stat));
  assert.equal(x.state,'headed_profile_not_ready');
  assert.equal(x.browserWindowOpened,false);
 }
});
test('existing-session or extension collision blocks profile reuse',()=>{
 for(const driver of ['existing-session','extension','remote']){
  const x=summarizeProfileCatalog({profiles:[{name:'alice-ai',driver}]});
  assert.equal(x.state,'blocked');
  assert.equal(x.driverClass,'non_managed');
 }
});
test('missing driver metadata and unknown catalog are inconclusive',async()=>{
 const unclear=await inspectAliceManagedBrowser(opts({profiles:[{name:'alice-ai'}]}));
 assert.equal(unclear.state,'inconclusive');
 assert.equal(unclear.reason,'profile_driver_unverified');
 assert.equal(summarizeProfileCatalog({something:'other'}).state,'inconclusive');
 assert.equal(summarizeProfileCatalog({profiles:[{name:'alice-ai'},{name:'alice-ai'}]}).state,'blocked');
});
test('OS/runtime and CLI refusal fail closed without profile mutation',async()=>{
 const blocked=await inspectAliceManagedBrowser({platform:'linux',runtimeCheck:async()=>true});
 assert.equal(blocked.reason,'private_macos_runtime_required');
 const failed=await inspectAliceManagedBrowser({platform:'darwin',runtimeCheck:async()=>true,
  call:async()=>{throw Error('private browser state')}});
 assert.equal(failed.reason,'browser_profiles_unavailable');
 assert.equal(failed.browserStarted,false);
 assert.doesNotMatch(JSON.stringify(failed),/private browser state/);
});
test('status contains only fixed enums and does not surface profile data',()=>{
 const x=summarizeProfileStatus({running:true,headless:false,
  headlessSource:'confidential',title:'private AliceAI',userDataDir:'/secret'});
 assert.equal(x.headlessSource,'unreported');
 assert.doesNotMatch(JSON.stringify(x),/confidential|AliceAI|secret/);
});
test('source cannot install browser, open URL, use CUA or import credentials',()=>{
 const s=readFileSync(new URL('../scripts/alice-managed-browser-preflight.mjs',import.meta.url),'utf8');
 assert.match(s,/browserStarted:false/);
 assert.match(s,/nativeComputerActInvoked:false/);
 assert.match(s,/importedCookies:false/);
 assert.doesNotMatch(s,/'create-profile'|'start'|'open'|'import-profile'|'reset-profile'|'delete-profile'/);
 assert.doesNotMatch(s,/'nodes','invoke'|browser_prepare|get_browser_state/);
});
