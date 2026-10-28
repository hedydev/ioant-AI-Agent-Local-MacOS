import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {
 makeFixtureBackgroundSetValueArgs,exactFixtureWrittenValue,
 verifiedFixtureBackgroundWrite,fixtureBackgroundWriteProof
} from '../scripts/openclaw-cua-fixture-background-write.mjs';
const script=readFileSync(resolve(import.meta.dirname,'..',
 'scripts/openclaw-cua-fixture-background-write.mjs'),'utf8');
const observer=readFileSync(resolve(import.meta.dirname,'..',
 'scripts/openclaw-cua-fixture-native-observe.mjs'),'utf8');
const ID='d74d37dd-dcc3-42d0-ab46-70a43cad4a7f';
const TOKEN='0123456789abcdef01234567';
const ORIGINAL='IOANT-FIXTURE-INITIAL';
const EXPECTED='IOANT-FIXTURE-BACKGROUND-'+TOKEN;
const label='IOANT CUA Fixture Editable';
const ctx={
 nodeId:'mac-node-only',executionId:ID,windowRef:'owned-window',
 elementRef:'owned-element',observationId:'obs-before',token:TOKEN
};
const post=(value=EXPECTED,observationId='obs-after')=>({
 result:{data:{observationId,elements:[
  {label,elementRef:'owned-element',value},
  {label:'Some unrelated user field',elementRef:'unrelated',value:'PRIVATE'}
 ]}}
});
function fakeContext(overrides={}){
 let calls=0,marked=0;
 const state=()=>({frontmost:'com.example.current',mouseX:105,mouseY:210});
 const base={...ctx,
  run:async(args)=>{
   calls++;
   const p=JSON.parse(args[7]);
   if(calls===1){
    assert.equal(p.action,'set_value');
    assert.equal(p.value,EXPECTED);
    assert.equal(p.deliveryMode,'background');
    return {ok:true};
   }
   assert.equal(p.action,'get_window_state');
   assert.equal(p.includeScreenshot,false);
   assert.equal(p.windowRef,ctx.windowRef);
   return post();
  },
  baseline:state(),readState:async()=>state(),
  fixtureIsAlive:()=>true,verifyOwnedWindow:async()=>true,
  getCurrentNode:async()=>true,markWriteAttempted:()=>{marked++},
  ...overrides};
 return {base,stats:()=>({calls,marked})};
}
test('only fresh, exact synthetic element can form one background set_value',()=>{
 const args=makeFixtureBackgroundSetValueArgs(ctx);
 assert.deepEqual(args.slice(0,6),
  ['nodes','invoke','--node','mac-node-only','--command','computer.act']);
 const payload=JSON.parse(args[7]);
 assert.deepEqual(payload,{action:'set_value',executionId:ID,
  windowRef:'owned-window',elementRef:'owned-element',
  observationId:'obs-before',value:EXPECTED,deliveryMode:'background'});
 assert.equal(args.includes('--browser-profile'),false);
 assert.equal(JSON.stringify(payload).includes('screenshot'),false);
 assert.equal(Object.isFrozen(args),true);
});
test('reject arbitrary text, missing evidence and malformed execution IDs',()=>{
 for(const patch of [
  {windowRef:''},{elementRef:''},{observationId:''},
  {nodeId:null},{token:'../../secret'},{executionId:'somebody-elses-id'}
 ])assert.throws(()=>makeFixtureBackgroundSetValueArgs({...ctx,...patch}));
 assert.throws(()=>makeFixtureBackgroundSetValueArgs({...ctx,
  value:'private message',action:'type',deliveryMode:'foreground',
  observationId:null}));
});
test('post observation accepts ONLY exact synthetic text with fresh observation',()=>{
 assert.equal(exactFixtureWrittenValue(post(),TOKEN,'obs-before'),true);
 for(const x of [
  post(ORIGINAL),post('incorrect'),post(EXPECTED,'obs-before'),
  {observationId:'obs-after',elements:[]},
  {observationId:'obs-after',elements:[
   {label,elementRef:'e1',value:EXPECTED},
   {label,elementRef:'e2',value:EXPECTED}
  ]},
  {observationId:'obs-after',elements:[
   {label:'foreign label',elementRef:'x',value:EXPECTED}
  ]}
 ])assert.equal(exactFixtureWrittenValue(x,TOKEN,'obs-before'),false);
 assert.equal(exactFixtureWrittenValue(post(),'', 'obs-before'),false);
 assert.equal(JSON.stringify(exactFixtureWrittenValue(post(),TOKEN,'obs-before'))
  .includes('PRIVATE'),false);
});
test('success: one write and one targeted read with unchanged frontmost',async()=>{
 const {base,stats}=fakeContext();
 const report=await verifiedFixtureBackgroundWrite(base);
 assert.deepEqual(report,{writeIssued:true,nativeReadbackMatched:true,
  fixtureStillOwned:true,providerGenerationStable:true,
  focusAndPointerUnchanged:true});
 assert.deepEqual(stats(),{calls:2,marked:1});
});
test('OS target PID lost before mutation => no write or read',async()=>{
 const {base,stats}=fakeContext({verifyOwnedWindow:async()=>false});
 const out=await verifiedFixtureBackgroundWrite(base);
 assert.equal(out.writeIssued,false);
 assert.deepEqual(stats(),{calls:0,marked:0});
});
test('provider generation changed => no write or read',async()=>{
 const {base,stats}=fakeContext({getCurrentNode:async()=>false});
 const out=await verifiedFixtureBackgroundWrite(base);
 assert.equal(out.writeIssued,false);
 assert.deepEqual(stats(),{calls:0,marked:0});
});
test('foreground/pointer changed => no write or read',async()=>{
 const {base,stats}=fakeContext({readState:async()=>({
  frontmost:'different-app',mouseX:105,mouseY:210
 })});
 const out=await verifiedFixtureBackgroundWrite(base);
 assert.equal(out.writeIssued,false);
 assert.deepEqual(stats(),{calls:0,marked:0});
});
test('original fixture process exited => no mutation',async()=>{
 const {base,stats}=fakeContext({fixtureIsAlive:()=>false});
 const out=await verifiedFixtureBackgroundWrite(base);
 assert.equal(out.writeIssued,false);
 assert.deepEqual(stats(),{calls:0,marked:0});
});
test('native write refusal is not retried, intent is recorded',async()=>{
 let calls=0,marked=0;
 const {base}=fakeContext({run:async()=>{
  calls++;return {ok:false};
 },markWriteAttempted:()=>{marked++}});
 await assert.rejects(verifiedFixtureBackgroundWrite(base),
  /fixture_set_value_native_refused/);
 assert.equal(calls,1);
 assert.equal(marked,1);
});
test('post-write readback mismatch is reported unsuccessful without retry',async()=>{
 let calls=0;
 const {base,stats}=fakeContext({run:async args=>{
  calls++;
  return calls===1?{ok:true}:post(ORIGINAL);
 }});
 const out=await verifiedFixtureBackgroundWrite(base);
 assert.equal(out.writeIssued,true);
 assert.equal(out.nativeReadbackMatched,false);
 assert.equal(calls,2);
 assert.equal(stats().marked,1);
});
test('composed proof passes only a callback to the verified observer',async()=>{
 let called=false;
 const result=await fixtureBackgroundWriteProof({
  observe:async arg=>{
   called=true;
   assert.equal(arg.verifiedFixtureChallenge,verifiedFixtureBackgroundWrite);
   return {state:'observed',reason:'fixture_background_write_verified',
    ownExecutionClosure:{attempted:true,acknowledged:true,ownerReleaseVerified:false}};
  }
 });
 assert.equal(called,true);
 assert.equal(result.audit,'IOANT_CUA_FIXTURE_BACKGROUND_WRITE');
 assert.equal(result.ownExecutionClosure.ownerReleaseVerified,false);
});
test('read-only CLI default and fixture-only write path remain separate',()=>{
 assert.match(observer,/verifiedFixtureChallenge=null/);
 assert.match(observer,/if\(typeof verifiedFixtureChallenge==='function'\)/);
 assert.match(observer,/!unchanged\|\|!fresh\|\|!element\.valueMatchesInitial/);
 assert.match(observer,/independentOSPidVerified:true/);
 assert.match(observer,/shouldCloseOwnFixtureExecution/);
 assert.match(observer,/scopedCloseRequest\(leasedNodeId,leasedExecutionId\)/);
 assert.match(observer,/if\(child&&child\.exitCode===null&&child\.pid\)child\.kill\('SIGTERM'\)/);
 assert.doesNotMatch(observer,/action:'set_value'/);
 assert.match(script,/action:'set_value'/);
 assert.match(script,/deliveryMode:'background'/);
 assert.match(script,/markWriteAttempted\(\)/);
 assert.doesNotMatch(script,/osascript|CGEventPost|\.activate\(|killall|--browser-profile|screencapture/);
});
