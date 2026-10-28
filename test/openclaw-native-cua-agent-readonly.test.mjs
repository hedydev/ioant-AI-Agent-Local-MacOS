import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {actionFromJson} from '../stage2/protocol.mjs';
import {actionPlan,runAction} from '../stage2/runner.mjs';
import {validCuaProvider,validNativeCursorRead,inspectNativeCuaAgent}
 from '../scripts/openclaw-native-cua-agent-readonly.mjs';

const action='openclaw-native-cua-readonly';
const task={protocol:'ioant-mac-ops-v1',id:'native-cua-readonly-001',action};
const provider={state:'observed',readOnly:true,descriptorSchemaValid:true,
 providerIndependentlyConfirmed:true,canonicalProviderId:'cua-computer',
 computerAdvertised:true};
const native={state:'observed',reason:'native_read_completed',
 readOnly:true,invokedComputerAct:true,requestedAction:'get_cursor_position',
 mutatedDesktop:false,browserAccess:false,chatContentRead:false,
 ownExecutionClosure:{attempted:true,acknowledged:true,ownerReleaseVerified:false}};
test('new structured action needs no shell or arbitrary params',()=>{
 const parsed=actionFromJson(JSON.stringify(task));
 assert.equal(parsed.known,true);
 assert.equal(parsed.authorized,false);
 assert.equal(parsed.action,action);
 for(const extra of [{command:'echo open'}, {cwd:'workspace'},
  {nodeId:'untrusted'},{params:{action:'set_value'}},{windowRef:'other'},
  {targetApp:'OtherApp'},{text:'payload'}])
  assert.throws(()=>actionFromJson(JSON.stringify({...task,...extra})),/Malformed/);
});
test('unapproved native CUA action cannot execute in runner',async()=>{
 const r=await runAction(action,'/tmp',{enableGuiReadonly:false});
 assert.equal(r.status,'approval_required');
 assert.match(r.reason,/enable-gui-readonly/);
 assert.equal(actionPlan(action,'/tmp'),null);
});
test('CUA-only provider identity accepted, not arbitrary computer.act',()=>{
 assert.equal(validCuaProvider(provider),true);
 for(const patch of [
  {canonicalProviderId:'peekaboo-computer'},
  {canonicalProviderId:'cua-driver'},
  {descriptorSchemaValid:false},
  {providerIndependentlyConfirmed:false},
  {computerAdvertised:false},
  {readOnly:false},{state:'inconclusive'}
 ])assert.equal(validCuaProvider({...provider,...patch}),false);
});
test('read-only CUA result needs a verified native effect envelope',()=>{
 assert.equal(validNativeCursorRead(native),true);
 for(const patch of [
  {state:'inconclusive'},{reason:'node_status_unavailable'},
  {invokedComputerAct:false},{requestedAction:'set_value'},
  {mutatedDesktop:true},{browserAccess:true},{chatContentRead:true},
  {readOnly:false}
 ])assert.equal(validNativeCursorRead({...native,...patch}),false);
});
test('runtime denial blocks before provider or native reads',async()=>{
 let providers=0,reads=0;
 const r=await inspectNativeCuaAgent({
  runtimeAllowed:async()=>false,
  provider:async()=>{providers++;return provider},
  native:async()=>{reads++;return native}
 });
 assert.equal(r.state,'blocked');assert.equal(r.nativeAttempted,false);
 assert.equal(providers,0);assert.equal(reads,0);
});
test('unknown provider fails closed without native invocation',async()=>{
 let reads=0;
 const r=await inspectNativeCuaAgent({
  runtimeAllowed:async()=>true,
  provider:async()=>({...provider,canonicalProviderId:'peekaboo-computer'}),
  native:async()=>{reads++;return native}
 });
 assert.equal(r.state,'blocked');assert.equal(reads,0);
});
test('one native read is followed by a separate provider check',async()=>{
 let providers=0,reads=0;
 const r=await inspectNativeCuaAgent({
  runtimeAllowed:async()=>true,
  provider:async()=>{providers++;return provider},
  native:async()=>{reads++;return native}
 });
 assert.equal(r.state,'observed');
 assert.equal(r.reason,'native_cua_readonly_completed');
 assert.equal(r.readOnly,true);
 assert.equal(r.desktopInput,false);
 assert.equal(r.browserAccess,false);
 assert.equal(r.backgroundWriteRequested,false);
 assert.equal(r.computerOwnerReleasedVerified,false);
 assert.equal(r.providerGenerationVerified,false);
 assert.equal(r.ownExecutionCloseAcknowledged,true);
 assert.equal(providers,2);assert.equal(reads,1);
});
test('a native refusal is inconclusive, never retried',async()=>{
 let reads=0,providers=0;
 const r=await inspectNativeCuaAgent({
  runtimeAllowed:async()=>true,
  provider:async()=>{providers++;return provider},
  native:async()=>{reads++;return {...native,state:'inconclusive'}}
 });
 assert.equal(r.state,'inconclusive');assert.equal(r.noAutomaticRetry,true);
 assert.equal(reads,1);assert.equal(providers,1);
});
test('provider identity changing after read is inconclusive',async()=>{
 let providers=0;
 const r=await inspectNativeCuaAgent({
  runtimeAllowed:async()=>true,
  provider:async()=>{providers++;return providers===1?provider:
   {...provider,canonicalProviderId:'peekaboo-computer'}},
  native:async()=>native
 });
 assert.equal(r.state,'inconclusive');
 assert.equal(r.reason,'postread_provider_identity_changed');
});
test('native errors do not trigger fallback action or retry',async()=>{
 let calls=0;
 const r=await inspectNativeCuaAgent({
  runtimeAllowed:async()=>true,provider:async()=>provider,
  native:async()=>{calls++;throw Error('no credentials to disclose')}
 });
 assert.equal(r.state,'inconclusive');
 assert.equal(r.reason,'native_read_unavailable');
 assert.equal(calls,1);
 assert.doesNotMatch(JSON.stringify(r),/credentials/);
});
test('watcher opt-in and fixed runner contract are source enforced',()=>{
 const root=resolve(import.meta.dirname,'..');
 const watcher=readFileSync(resolve(root,'stage2/chatgpt-loop.mjs'),'utf8');
 const runner=readFileSync(resolve(root,'stage2/runner.mjs'),'utf8');
 assert.match(watcher,/task\.action==='openclaw-native-cua-readonly' && opts\.enableGuiReadonly/);
 assert.match(watcher,/enableGuiReadonly:opts\.enableGuiReadonly/);
 assert.match(runner,/if\(options\.enableGuiReadonly!==true\)/);
 assert.match(runner,/openclaw-native-cua-agent-readonly\.mjs/);
 assert.match(runner,/IOANT_NATIVE_CUA_AGENT_READONLY/);
});
