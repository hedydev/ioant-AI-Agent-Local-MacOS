import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 sourcePatternSignals,summarizeOwnerInterfaceScan
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
