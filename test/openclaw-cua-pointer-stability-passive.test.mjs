import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {summarizeStateSamples,inspectPointerStability}
 from '../scripts/openclaw-cua-pointer-stability-passive.mjs';
const sample=(x=1,y=2,frontmost='User App')=>({mouseX:x,mouseY:y,frontmost});
test('unchanged foreground and pointer produce stable passive observation',()=>{
 const r=summarizeStateSamples([sample(),sample(),sample()]);
 assert.equal(r.state,'observed');
 assert.equal(r.strictlyStable,true);
 assert.equal(r.pointerChangeSteps,0);
 assert.equal(r.largestStepBand,'none');
 assert.equal(r.nativeCUAExecutionVerified,false);
});
test('subpixel coordinate variation is reported but not called stable',()=>{
 const r=summarizeStateSamples([sample(),sample(1.2,2)]);
 assert.equal(r.pointerChanged,true);
 assert.equal(r.subpixelChangeSteps,1);
 assert.equal(r.largestStepBand,'subpixel');
 assert.equal(r.strictlyStable,false);
});
test('movement is reported only as coarse bands without raw coordinates',()=>{
 const r=summarizeStateSamples([sample(),sample(1,60)]);
 assert.equal(r.pointerChangeSteps,1);
 assert.equal(r.largestStepBand,'50px_or_more');
 assert.equal(JSON.stringify(r).includes('mouseX'),false);
 assert.equal(JSON.stringify(r).includes('mouseY'),false);
 assert.equal(JSON.stringify(r).includes('User App'),false);
});
test('foreground changes independently of an unchanged pointer',()=>{
 const r=summarizeStateSamples([sample(),sample(1,2,'Other App')]);
 assert.equal(r.frontmostChanged,true);
 assert.equal(r.pointerChanged,false);
 assert.equal(r.strictlyStable,false);
});
test('malformed and too short samples cannot imply readiness',()=>{
 for(const inputs of [[],[sample()],
  [sample(),{...sample(),mouseX:NaN}],
  [sample(),{...sample(),frontmost:''}],
  new Array(33).fill(sample())]){
  const r=summarizeStateSamples(inputs);
  assert.equal(r.state,'inconclusive');
  assert.notEqual(r.strictlyStable,true);
 }
});
test('runtime gate prevents fixture binary resolution and sampling',async()=>{
 let resolved=0,read=0;
 const r=await inspectPointerStability({
  allowedRuntime:async()=>false,
  resolveBinary:async()=>{resolved++;return '/tmp/ignored'},
  read:async()=>{read++;return sample()}
 });
 assert.equal(r.state,'blocked');
 assert.equal(resolved,0);
 assert.equal(read,0);
});
test('injected fake samples prove one-shot reads only and no UI input',async()=>{
 const items=[sample(),sample(),sample(3,2),sample(3,2)];
 let calls=0,waits=0;
 const r=await inspectPointerStability({
  allowedRuntime:async()=>true,resolveBinary:async()=>'/fake/state-helper',
  read:async()=>items[calls++],
  wait:async()=>{waits++},count:4
 });
 assert.equal(r.state,'observed');
 assert.equal(r.pointerChangeSteps,1);
 assert.equal(calls,4);
 assert.equal(waits,3);
 assert.equal(r.invokedComputerAct,false);
 assert.equal(r.fixtureLaunched,false);
 assert.equal(r.desktopInput,false);
});
test('passive source uses only fixture state, not GUI actions',()=>{
 const s=readFileSync(resolve(import.meta.dirname,
  '../scripts/openclaw-cua-pointer-stability-passive.mjs'),'utf8');
 assert.match(s,/\['--state'\]/);
 assert.doesNotMatch(s,/\['--run'/);
 assert.doesNotMatch(s,/['"]computer\.act['"]/);
 assert.doesNotMatch(s,/['"]--screenshot['"]/);
 assert.doesNotMatch(s,/['"]--click['"]/);
 assert.doesNotMatch(s,/['"]--type['"]/);
});
