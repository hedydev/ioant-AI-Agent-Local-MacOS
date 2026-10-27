import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {summarizeNodeRecovery,summarizeSessions,summarizeGateway,
 summarizeWatcher,inspectOwnerRecovery}
 from '../scripts/openclaw-cua-owner-recovery-readiness.mjs';
const source=readFileSync(resolve(import.meta.dirname,
 '../scripts/openclaw-cua-owner-recovery-readiness.mjs'),'utf8');
const status=()=>({nodes:[{nodeId:'private-mac',platform:'macOS 27.0.1',
 connected:true,commands:['screen.snapshot','computer.act'],
 computerUse:{provider:{id:'cua-computer',generation:'token-secret'}}}]});
test('connected Mac node metadata cannot authorize lock release',()=>{
 const s=summarizeNodeRecovery(status());
 assert.equal(s.selectedMacConnected,true);
 assert.equal(s.nativeComputerAdvertised,true);
 assert.equal(s.computerOwnerVerified,false);
 assert.equal(s.nodeCanBeSafelyRestarted,false);
 assert.equal(JSON.stringify(s).includes('private-mac'),false);
 assert.equal(JSON.stringify(s).includes('token-secret'),false);
});
test('a zero recent-session count is never proof of no active Computer work',()=>{
 const r=summarizeSessions({sessions:[],count:0,limitApplied:50,
  hasMore:false});
 assert.equal(r.available,true);
 assert.equal(r.recentSessionCount,0);
 assert.equal(r.provesNoActiveAgentWork,false);
 assert.equal(r.snapshotLimited,true);
});
test('session metadata yields only bounded counts, not identities',()=>{
 const r=summarizeSessions({result:{sessions:[
  {key:'agent:main:PRIVATE_CHAT',text:'token private'},
  {key:'agent:alice-ai:PRIVATE_CHAT',text:'hidden'}
 ],hasMore:true}});
 assert.equal(r.recentSessionCount,2);
 assert.equal(r.snapshotLimited,true);
 assert.equal(JSON.stringify(r).includes('PRIVATE_CHAT'),false);
 assert.equal(JSON.stringify(r).includes('token private'),false);
});
test('malformed session responses stay unknown without idle assumptions',()=>{
 const r=summarizeSessions({error:{message:'private chat'}});
 assert.equal(r.available,false);
 assert.equal(r.recentSessionCount,null);
 assert.equal(r.provesNoActiveAgentWork,false);
});
test('gateway RPC status cannot expose or certify owner',()=>{
 const r=summarizeGateway({result:{rpc:{connected:true,token:'SECRET'},
  computer:{currentExecutionId:'private-exec'}}});
 assert.equal(r.gatewayRpcConnected,true);
 assert.equal(r.gatewayOwnerRegistryVerified,false);
 assert.equal(r.computerOwnerReleased,false);
 assert.equal(JSON.stringify(r).includes('private-exec'),false);
});
test('watcher status emits only fixed state and never proves idle',()=>{
 const r=summarizeWatcher({state:'running',pid:78435,
  stdout:'secret browser content'});
 assert.equal(r.watcherState,'running');
 assert.equal(r.watcherActiveTaskVerified,false);
 assert.equal(r.watcherSafeToRestart,false);
 assert.equal(JSON.stringify(r).includes('secret browser'),false);
});
test('passive recovery survey makes four read-only calls at most',async()=>{
 const calls=[];
 const r=await inspectOwnerRecovery({
  allowedRuntime:async()=>true,
  nodeStatus:async()=>{calls.push('node');return status()},
  sessions:async()=>{calls.push('sessions');return {sessions:[]}},
  gateway:async()=>{calls.push('gateway');return {rpc:{connected:true}}},
  watcher:async()=>{calls.push('watcher');return {state:'running'}}
 });
 assert.deepEqual(calls,['node','sessions','gateway','watcher']);
 assert.equal(r.state,'observed');
 assert.equal(r.node.selectedMacConnected,true);
 assert.equal(r.session.recentSessionCount,0);
 assert.equal(r.restartedNode,false);
 assert.equal(r.restartedGateway,false);
 assert.equal(r.attemptedOwnerRelease,false);
 assert.equal(r.safeToDisconnectOrRestartNode,false);
 assert.equal(r.activeOwnerIdentityKnown,false);
 assert.equal(r.changedBrowser,false);
 assert.equal(r.invokedComputerAct,false);
});
test('each missing metadata source degrades only that check',async()=>{
 const r=await inspectOwnerRecovery({
  allowedRuntime:async()=>true,
  nodeStatus:async()=>{throw Error('private token')},
  sessions:async()=>{throw Error('private tokens')},
  gateway:async()=>{throw Error('private gateway')},
  watcher:async()=>{throw Error('private watcher')}
 });
 assert.equal(r.state,'observed');
 assert.equal(r.node.available,false);
 assert.equal(r.session.available,false);
 assert.equal(r.gateway.available,false);
 assert.equal(r.watcher.available,false);
 assert.equal(JSON.stringify(r).includes('private token'),false);
 assert.equal(r.safeToDisconnectOrRestartNode,false);
});
test('private runtime check prevents any metadata query',async()=>{
 let n=0;
 const r=await inspectOwnerRecovery({
  allowedRuntime:async()=>false,
  nodeStatus:async()=>{n++},sessions:async()=>{n++},
  gateway:async()=>{n++},watcher:async()=>{n++}
 });
 assert.equal(r.state,'blocked');
 assert.equal(n,0);
});
test('source has no computer act, release, restart or browser invocation',()=>{
 assert.match(source,/invokedComputerAct:false/);
 assert.match(source,/attemptedOwnerRelease:false/);
 assert.match(source,/safeToDisconnectOrRestartNode:false/);
 assert.doesNotMatch(source,/nodes','invoke|__close_execution|--params|--browser-profile|osascript|launchctl kickstart|launchctl bootout|CGEventPost|process\.kill/);
});
