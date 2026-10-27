import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {
 exactPidList,classifyAncestryPath,summarizeDriverAncestry,
 inspectCUADriverAncestry
} from '../scripts/openclaw-cua-driver-ancestry-readonly.mjs';
const source=readFileSync(resolve(import.meta.dirname,
 '../scripts/openclaw-cua-driver-ancestry-readonly.mjs'),'utf8');
const node={nodes:[{nodeId:'PRIVATE-NODE-KEY',connected:true,
 platform:'macOS 27.0.1',commands:['screen.snapshot','computer.act'],
 computerUse:{contractVersion:2,provider:{id:'cua-computer',
 generation:'private-generation'}}}]};
test('bounded PID parser is numeric-only and refuses unexpected output',()=>{
 assert.deepEqual(exactPidList('2000\n2001\n2000\n',8),['2000','2001']);
 for(const bad of [null,123,'','  ','0','123a','1 /Users/private',
  '235\nSENSITIVE\n','1'.repeat(4200),Array(9).fill('123').join('\n')])
  assert.equal(exactPidList(bad,8),null);
});
test('one-hop parent maps to direct app child',()=>{
 const a=classifyAncestryPath('2010',new Set(['1000']),
  new Map([['2010','1000']]));
 assert.equal(a,'direct');
});
test('two-hop or longer chain maps to indirect app descendant',()=>{
 const a=classifyAncestryPath('2010',new Set(['1000']),
  new Map([['2010','1999'],['1999','1444'],['1444','1000']]));
 assert.equal(a,'indirect');
});
test('PID 1 chain does not become an orphan or an authorized cleanup',()=>{
 const a=classifyAncestryPath('2010',new Set(['1000']),
  new Map([['2010','4444'],['4444','1']]));
 assert.equal(a,'reached_init_without_app');
 const r=summarizeDriverAncestry(['1000'],['2010'],[a]);
 assert.equal(r.reachedInitWithoutAppCount,1);
 assert.equal(r.orphanedDriverVerified,false);
 assert.equal(r.safeToTerminateProcess,false);
 assert.equal(r.currentExecutionOwnerVerified,false);
});
test('process exit, loop and depth exhaustion fail closed',()=>{
 assert.equal(classifyAncestryPath('2010',new Set(['1000']),
  new Map([['2010',null]])),'unknown');
 assert.equal(classifyAncestryPath('2010',new Set(['1000']),
  new Map([['2010','2999'],['2999','2010']])),'unknown');
 assert.equal(classifyAncestryPath('2010',new Set(['1000']),
  new Map([['2010','2999'],['2999','1000']]),1),'depth_limited');
});
test('summary counts are aggregate, total consistent and PIDs redacted',()=>{
 const r=summarizeDriverAncestry(['1000'],['2010','2020','2030','2040','2050'],
  ['direct','indirect','reached_init_without_app','unknown','depth_limited']);
 assert.equal(r.driverProcessCount,5);
 assert.equal(r.directAppChildCount,1);
 assert.equal(r.indirectAppDescendantCount,1);
 assert.equal(r.reachedInitWithoutAppCount,1);
 assert.equal(r.unknownAncestryCount,1);
 assert.equal(r.depthLimitedCount,1);
 assert.equal(r.allDriversDescendFromObservedOpenClawApp,false);
 assert.equal(r.appNodeIdentityVerified,false);
 assert.equal(r.safeToTerminateProcess,false);
 assert.equal(JSON.stringify(r).includes('2010'),false);
});
test('invalid or excessive candidate sets return inconclusive without PID leak',()=>{
 for(const [apps,drivers,paths] of [
  [[],['2010'],['direct']],
  [['private'],['2010'],['direct']],
  [['1000'],Array(9).fill('2010'),Array(9).fill('direct')],
  [['1000'],['2010'],[]]]){
  const r=summarizeDriverAncestry(apps,drivers,paths);
  assert.equal(r.state,'inconclusive');
  assert.equal(r.currentExecutionOwnerVerified,false);
 }
});
test('live-shaped mixed driver ancestry is counted using only ps parent IDs',async()=>{
 const calls=[];
 const ppid={2010:'1000',2020:'1999',1999:'1000',2030:'3999',3999:'1'};
 const r=await inspectCUADriverAncestry({
  allowedRuntime:async()=>true,
  nodeStatus:async()=>{calls.push('node');return node},
  appPids:async()=>{calls.push('app');return '1000\n'},
  driverPids:async()=>{calls.push('driver');return '2010\n2020\n2030\n'},
  getParent:async pid=>{
   calls.push('ps');return ppid[pid]??null;
  }
 });
 assert.equal(r.state,'observed');
 assert.equal(r.nodeConnected,true);
 assert.equal(r.cuaProviderAdvertised,true);
 assert.equal(r.driverAncestry.driverProcessCount,3);
 assert.equal(r.driverAncestry.directAppChildCount,1);
 assert.equal(r.driverAncestry.indirectAppDescendantCount,1);
 assert.equal(r.driverAncestry.reachedInitWithoutAppCount,1);
 assert.equal(calls.filter(x=>x==='ps').length,5);
 assert.equal(r.computerActInvoked,false);
 assert.equal(r.restartedOpenClawApp,false);
 assert.equal(r.executionReleaseAttempted,false);
 assert.equal(r.safeToRestartOrRelease,false);
 assert.equal(JSON.stringify(r).includes('PRIVATE-NODE-KEY'),false);
 assert.equal(JSON.stringify(r).includes('2010'),false);
});
test('when every driver descends from OpenClaw it still cannot attribute node',async()=>{
 const r=await inspectCUADriverAncestry({
  allowedRuntime:async()=>true,
  nodeStatus:async()=>node,
  appPids:async()=> '1000',
  driverPids:async()=> '2010\n2020',
  getParent:async id=>({2010:'1000',2020:'1999',1999:'1000'})[id]??null
 });
 assert.equal(r.driverAncestry.allDriversDescendFromObservedOpenClawApp,true);
 assert.equal(r.selectedNodeHostAttributionVerified,false);
 assert.equal(r.computerExecutionOwnerIdentified,false);
 assert.equal(r.safeToRestartOrRelease,false);
});
test('unknown process list avoids all parent queries',async()=>{
 let count=0;
 const r=await inspectCUADriverAncestry({
  allowedRuntime:async()=>true,
  nodeStatus:async()=>node,
  appPids:async()=> '1000',
  driverPids:async()=> 'private title /Users/private',
  getParent:async()=>{count++;return '1'}
 });
 assert.equal(r.state,'inconclusive');
 assert.equal(count,0);
 assert.equal(r.safeToRestartOrRelease,false);
 assert.equal(JSON.stringify(r).includes('/Users/private'),false);
});
test('private runtime failure blocks every data read',async()=>{
 let count=0;
 const f=async()=>{count++;throw Error('unwanted')};
 const r=await inspectCUADriverAncestry({
  allowedRuntime:async()=>false,nodeStatus:f,
  appPids:f,driverPids:f,getParent:f
 });
 assert.equal(r.state,'blocked');
 assert.equal(count,0);
 assert.equal(r.executionReleaseAttempted,false);
});
test('bounded script contains only passive status, exact pgrep and ps PPID reads',()=>{
 const executable=source.split('\n')
  .filter(x=>! /^\s*\/\//.test(x)).join('\n');
 assert.match(executable,/'nodes','status','--json'/);
 assert.match(executable,/'\/usr\/bin\/pgrep'/);
 assert.match(executable,/'\/bin\/ps'/);
 assert.match(executable,/MAX_DRIVERS=8,MAX_APPS=16,MAX_DEPTH=8/);
 assert.doesNotMatch(executable,/nodes','invoke|__close_execution|launchctl|kill\(|\.kill\(|SIGTERM|SIGKILL|--browser-profile|computer\.act'|osascript|CGEventPost|screencapture|--params/);
 assert.match(executable,/safeToRestartOrRelease:false/);
 assert.match(executable,/executionReleaseAttempted:false/);
});
