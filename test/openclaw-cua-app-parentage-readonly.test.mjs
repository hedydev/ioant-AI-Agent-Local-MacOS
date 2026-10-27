import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseExactPids,parentageEvidence,inspectCUAAppParentage}
 from '../scripts/openclaw-cua-app-parentage-readonly.mjs';
const source=readFileSync(resolve(import.meta.dirname,
 '../scripts/openclaw-cua-app-parentage-readonly.mjs'),'utf8');
const macNode={nodes:[{nodeId:'PRIVATE-NODE-ID',
 platform:'macOS 27.0.1',connected:true,
 commands:['screen.snapshot','computer.act']}]};
test('pid parser accepts numeric exact lines but never reveals process details',()=>{
 assert.deepEqual(parseExactPids('12345\n22223\n12345\n'),['12345','22223']);
 for(const v of [null,'USER /Users/private','1234 /Applications/OpenClaw.app',
  '0','-1','123\nBAD','1'.repeat(6000)])assert.equal(parseExactPids(v),null);
});
test('one CUA driver whose direct parent is the OpenClaw app matches',()=>{
 const r=parentageEvidence({appIds:['1542'],driverIds:['3560'],
  parentByDriver:new Map([['3560','1542']])});
 assert.equal(r.state,'observed');
 assert.equal(r.driverDirectAppChildVerified,true);
 assert.equal(r.allObservedDriversDirectAppChildren,true);
 assert.equal(r.appOwnedProviderExecutionVerified,false);
 assert.equal(r.currentComputerOwnerIdentified,false);
 assert.equal(r.safeToResetDriver,false);
 assert.equal(JSON.stringify(r).includes('3560'),false);
});
test('another parent is not incorrectly attributed to app',()=>{
 const r=parentageEvidence({appIds:['1542'],driverIds:['3560'],
  parentByDriver:new Map([['3560','1']])});
 assert.equal(r.state,'observed');
 assert.equal(r.driverDirectAppChildVerified,false);
 assert.equal(r.allObservedDriversDirectAppChildren,false);
});
test('unknown parent prevents positive host attribution',()=>{
 const r=parentageEvidence({appIds:['1542'],driverIds:['3560'],
  parentByDriver:new Map([['3560',null]])});
 assert.equal(r.state,'inconclusive');
 assert.equal(r.driverDirectAppChildVerified,false);
});
test('multiple driver instances can be mixed, not all app owned',()=>{
 const r=parentageEvidence({appIds:['1542'],
  driverIds:['3560','3670'],
  parentByDriver:new Map([['3560','1542'],['3670','1']])});
 assert.equal(r.driverDirectAppChildVerified,true);
 assert.equal(r.allObservedDriversDirectAppChildren,false);
});
test('multiple PIDs remain identity-only without process owner disclosure',()=>{
 const r=parentageEvidence({appIds:['1542','1544'],
  driverIds:['3560','3561'],
  parentByDriver:new Map([['3560','1542'],['3561','1544']])});
 assert.equal(r.allObservedDriversDirectAppChildren,true);
 assert.equal(JSON.stringify(r).includes('1542'),false);
 assert.equal(JSON.stringify(r).includes('3561'),false);
});
test('only one node-status + two exact-process enumerations + parent lookup',async()=>{
 const calls=[];
 const r=await inspectCUAAppParentage({
  allowedRuntime:async()=>true,
  nodeStatus:async()=>{calls.push('node-status');return macNode},
  apps:async()=>{calls.push('apps');return ['1542']},
  drivers:async()=>{calls.push('drivers');return ['3560']},
  parent:async pid=>{calls.push('parent');assert.equal(pid,'3560');return '1542'}
 });
 assert.deepEqual(calls,['node-status','apps','drivers','parent']);
 assert.equal(r.state,'observed');
 assert.equal(r.nodeConnected,true);
 assert.equal(r.cuaNodeAdvertised,true);
 assert.equal(r.parentage.driverDirectAppChildVerified,true);
 assert.equal(r.selectedNodeHostAttributionVerified,false);
 assert.equal(r.hostRecoveryAuthorized,false);
 assert.equal(r.safeToRestartOrDisconnect,false);
 assert.equal(r.restartedNode,false);
 assert.equal(r.restartedGateway,false);
 assert.equal(r.changedBrowser,false);
 assert.equal(JSON.stringify(r).includes('PRIVATE-NODE-ID'),false);
});
test('process discovery failure fails closed with no parent or restart',async()=>{
 let parents=0;
 const r=await inspectCUAAppParentage({
  allowedRuntime:async()=>true,
  nodeStatus:async()=>macNode,
  apps:async()=>null,drivers:async()=>null,
  parent:async()=>{parents++}
 });
 assert.equal(parents,0);
 assert.equal(r.parentage.state,'inconclusive');
 assert.equal(r.safeToRestartOrDisconnect,false);
});
test('bad process identity stops parent lookup and suppresses sensitive data',async()=>{
 let called=0;
 const r=await inspectCUAAppParentage({
  allowedRuntime:async()=>true,nodeStatus:async()=>macNode,
  apps:async()=>['/Users/private'],drivers:async()=>['3560'],
  parent:async()=>{called++}
 });
 assert.equal(called,0);
 assert.equal(r.parentage.state,'inconclusive');
 assert.equal(JSON.stringify(r).includes('private'),false);
});
test('runtime validation blocks before process or node checks',async()=>{
 let count=0;
 const r=await inspectCUAAppParentage({
  allowedRuntime:async()=>false,
  nodeStatus:async()=>{count++},
  apps:async()=>{count++},
  drivers:async()=>{count++},
  parent:async()=>{count++}
 });
 assert.equal(r.state,'blocked');
 assert.equal(count,0);
});
test('no input, browser, command invoke, process signaling or reconfiguration',()=>{
 const body=source.split('\n').filter(x=>!/^\s*\/\//.test(x)).join('\n');
 assert.doesNotMatch(body,/nodes','invoke|__close_execution|process\.kill|kill\(|SIGTERM|SIGKILL|launchctl|osascript|CGEventPost|--params|--browser-profile|exec\(CLI,\['node','restart'/);
 assert.match(body,/restartedNode:false/);
 assert.match(body,/clearedComputerOwner:false/);
 assert.match(body,/safeToRestartOrDisconnect:false/);
 assert.match(body,/\/usr\/bin\/pgrep/);
 assert.match(body,/\/bin\/ps/);
});
