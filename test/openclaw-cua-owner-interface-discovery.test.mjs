import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 sourcePatternSignals,sourceOwnerCohesion,summarizeOwnerInterfaceScan
} from '../scripts/openclaw-cua-owner-interface-discovery.mjs';

test('exact owner-related API patterns are only leads, not ownership proof',()=>{
 const s=sourcePatternSignals(
  '__close_execution COMPUTER_HOST_BUSY activeComputerExecution getExecutionStatus');
 assert.deepEqual(s,{
  closeExecution:true,hostBusy:true,activeOwner:true,
  ownerQuery:true,ownerRegistry:false
 });
 const summary=summarizeOwnerInterfaceScan({
  rootsFound:1,filesInspected:4,
  hitCounts:{closeExecution:1,hostBusy:1,activeOwner:1,ownerQuery:1}});
 assert.equal(summary.interfaceVerified,false);
 assert.equal(summary.ownerReleaseVerified,false);
 assert.equal(summary.patternHitFiles.ownerQuery,1);
});
test('unknown and missing source patterns are zero with no invented release',()=>{
 const s=sourcePatternSignals('a standalone accessibility provider');
 assert.ok(Object.values(s).every(v=>v===false));
 const summary=summarizeOwnerInterfaceScan({
  rootsFound:0,filesInspected:0,hitCounts:{}});
 assert.equal(summary.patternHitFiles.ownerRegistry,0);
 assert.equal(summary.patternHitFiles.ownerQuery,0);
 assert.equal(summary.ownerReleaseVerified,false);
 assert.equal(Object.isFrozen(summary),true);
});
test('pattern counts are strictly bounded and never reveal source content',()=>{
 const s=summarizeOwnerInterfaceScan({rootsFound:2,filesInspected:2500,
  hitCounts:{ownerQuery:50000,hostBusy:-4,closeExecution:NaN},
  truncated:true});
 assert.equal(s.patternHitFiles.ownerQuery,2500);
 assert.equal(s.patternHitFiles.hostBusy,0);
 assert.equal(s.patternHitFiles.closeExecution,0);
 assert.equal(s.scanTruncated,true);
 assert.doesNotMatch(JSON.stringify(s),/PRIVATE_URL|TOKEN|127\.0\.0\.1/);
});
test('read-only script has no computer mutation, lock cleanup, or service restart',()=>{
 const s=readFileSync(new URL(
  '../scripts/openclaw-cua-owner-interface-discovery.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(s,/\['nodes','invoke'\]|\['nodes','disconnect'\]|\['gateway','restart'\]/);
 assert.doesNotMatch(s,/execFileSync|spawn\(|writeFileSync|rmSync|unlinkSync/);
 assert.match(s,/ownerReleaseVerified:false/);
 assert.match(s,/invokedComputerAct:false/);
});

test('owner and close symbols in one source are only a co-location hint',()=>{
 const a=sourceOwnerCohesion(
  'ownerRegistry __close_execution COMPUTER_HOST_BUSY releaseExecutionOwner');
 assert.equal(a.registryWithClose,true);
 assert.equal(a.registryWithBusy,true);
 assert.equal(a.closeWithBusy,true);
 assert.equal(a.registryWithMutationWords,true);
 assert.equal(a.candidateStatusAction,false);
 const b=sourceOwnerCohesion('getExecutionOwnerStatus');
 assert.equal(b.candidateStatusAction,true);
 assert.equal(b.registryWithClose,false);
});
test('co-location counts are bounded and do not establish a callable interface',()=>{
 const r=summarizeOwnerInterfaceScan({
  filesInspected:2500,rootsFound:2,hitCounts:{ownerRegistry:2},
  cohortCounts:{registryWithClose:1,closeWithBusy:9000,
   candidateStatusAction:-1}
 });
 assert.equal(r.ownerSourceCoLocation.registryWithClose,1);
 assert.equal(r.ownerSourceCoLocation.closeWithBusy,2500);
 assert.equal(r.ownerSourceCoLocation.candidateStatusAction,0);
 assert.equal(r.interfaceVerified,false);
 assert.equal(r.ownerReleaseVerified,false);
 assert.doesNotMatch(JSON.stringify(r),/ownerRegistry __close_execution|releaseExecutionOwner/);
});
test('unrelated owner text and empty sources never supply ownership proof',()=>{
 for(const input of ['',42,'ownership is pending']){
  const r=sourceOwnerCohesion(input);
  assert.ok(Object.values(r).every(x=>x===false));
 }
});
