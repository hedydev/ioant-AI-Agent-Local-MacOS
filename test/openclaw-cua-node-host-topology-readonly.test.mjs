import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {
 summarizeNodeHost,summarizeHeadlessNodeStatus,summarizeExactProcess,
 inspectMacNodeHostTopology
} from '../scripts/openclaw-cua-node-host-topology-readonly.mjs';
const source=readFileSync(resolve(import.meta.dirname,
 '../scripts/openclaw-cua-node-host-topology-readonly.mjs'),'utf8');
const selected={nodes:[{connected:true,platform:'macOS 27.0.1',
 nodeId:'private-node-ID',
 computerUse:{contractVersion:2,provider:{id:'cua-computer',
 generation:'private-generation'}},
 commands:['screen.snapshot','computer.act']}]};
test('known paired macOS descriptor reports capabilities without identity',()=>{
 const r=summarizeNodeHost(selected);
 assert.equal(r.connectedMacNode,true);
 assert.equal(r.cuaProviderV2Advertised,true);
 assert.equal(r.computerActAdvertised,true);
 assert.equal(r.nodeHostProcessIdentityReported,false);
 assert.equal(r.executionOwnerReported,false);
 assert.equal(JSON.stringify(r).includes('private-node-ID'),false);
});
test('headless node installed flag does not attribute the current Mac node',()=>{
 const r=summarizeHeadlessNodeStatus({result:{service:{
  installed:true,state:'running',pid:87827,path:'/Users/private'}}});
 assert.equal(r.managedServiceInstalled,true);
 assert.equal(r.headlessServiceState,'running');
 assert.equal(r.selectedMacNodeIsThisServiceVerified,false);
 assert.equal(JSON.stringify(r).includes('87827'),false);
 assert.equal(JSON.stringify(r).includes('/Users/private'),false);
});
test('unknown headless status is not assumed installed or absent',()=>{
 const r=summarizeHeadlessNodeStatus({result:{strange:true}});
 assert.equal(r.managedServiceInstalled,null);
 assert.equal(r.headlessServiceState,'unknown');
 assert.equal(r.selectedMacNodeIsThisServiceVerified,false);
});
test('real pgrep process presence does not emit PIDs or prove identity',()=>{
 const r=summarizeExactProcess({stdout:'27271\n81817\n'});
 assert.equal(r.observed,true);
 assert.equal(r.querySucceeded,true);
 assert.equal(r.absenceProven,false);
 assert.equal(JSON.stringify(r).includes('27271'),false);
});
test('pgrep exit 1 cannot prove the process is permanently absent',()=>{
 const r=summarizeExactProcess({error:{code:1}});
 assert.equal(r.observed,false);
 assert.equal(r.querySucceeded,true);
 assert.equal(r.absenceProven,false);
});
test('other process query errors remain unverified',()=>{
 const r=summarizeExactProcess({error:{code:9}});
 assert.equal(r.querySucceeded,false);
 assert.equal(r.absenceProven,false);
});
test('four bounded passive sources never authorize restart or host cleanup',async()=>{
 const calls=[];
 const r=await inspectMacNodeHostTopology({
  allowedRuntime:async()=>true,
  selected:async()=>{calls.push('node');return selected},
  headless:async()=>{calls.push('service');return {service:{
   installed:false,state:'stopped'}}},
  app:async()=>{calls.push('app');return {stdout:'27271\n'}},
  driver:async()=>{calls.push('driver');return {stdout:'81817\n'}}
 });
 assert.deepEqual(calls,['node','service','app','driver']);
 assert.equal(r.state,'observed');
 assert.equal(r.appOwnedHostPossible,true);
 assert.equal(r.headlessHostPossible,false);
 assert.equal(r.hostKindIndependentlyVerified,false);
 assert.equal(r.currentComputerOwnerVerified,false);
 assert.equal(r.safeToRestartNode,false);
 assert.equal(r.restartedGateway,false);
 assert.equal(r.restartedNode,false);
 assert.equal(r.ownerReleased,false);
 assert.equal(r.recoveryRequiresSeparateOperatorApproval,true);
 assert.equal(JSON.stringify(r).includes('27271'),false);
});
test('unavailable CLI and processes are inconclusive not safe to restart',async()=>{
 const r=await inspectMacNodeHostTopology({
  allowedRuntime:async()=>true,
  selected:async()=>{throw Error('private identity')},
  headless:async()=>{throw Error('private path')},
  app:async()=>{throw Error('private PID')},
  driver:async()=>{throw Error('private provider')}
 });
 assert.equal(r.state,'observed');
 assert.equal(r.node.available,false);
 assert.equal(r.service.managedServiceInstalled,null);
 assert.equal(r.safeToRestartNode,false);
 assert.equal(r.appOwnedHostPossible,false);
 assert.equal(JSON.stringify(r).includes('private path'),false);
});
test('private runtime failure blocks all passive queries',async()=>{
 let n=0;
 const r=await inspectMacNodeHostTopology({
  allowedRuntime:async()=>false,
  selected:async()=>{n++},
  headless:async()=>{n++},app:async()=>{n++},driver:async()=>{n++}
 });
 assert.equal(r.state,'blocked');
 assert.equal(n,0);
});
test('no native invocation, UI, CLI restart, launchctl or raw process reporting',()=>{
 assert.doesNotMatch(source,/nodes','invoke|__close_execution|launchctl|computer\.act'|--params|osascript|CGEventPost|exec\(CLI,\['node','restart'/);
 assert.match(source,/restartedNode:false/);
 assert.match(source,/ownerReleased:false/);
 assert.match(source,/safeToRestartNode:false/);
 assert.match(source,/\/usr\/bin\/pgrep/);
});
