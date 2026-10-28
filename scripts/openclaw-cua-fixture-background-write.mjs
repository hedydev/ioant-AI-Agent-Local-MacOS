#!/usr/bin/env node
// Deliberate, one-shot macOS CUA BACKGROUND write to our disposable AppKit
// fixture only. No browser, screenshot, OS events, clicks, keys, focus, or
// foreground delivery. Only fresh references supplied by the independently
// attested fixture observer can be used.
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
 nativeCUAFixtureObserve,makeReadOnlyNativeArgs,findFixtureElement,
 walkNativePayload
} from './openclaw-cua-fixture-native-observe.mjs';
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const THIS=fileURLToPath(import.meta.url);
const AUDIT='IOANT_CUA_FIXTURE_BACKGROUND_WRITE';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const nonce=/^[a-f0-9]{24}$/;
const ref=v=>typeof v==='string'&&v.length>=1&&v.length<=1024;
const FIELD='IOANT CUA Fixture Editable';
const PREFIX='IOANT-FIXTURE-BACKGROUND-';
const sameState=(a,b)=>!!a&&!!b&&
 a.frontmost===b.frontmost&&Number.isFinite(a.mouseX)&&
 Number.isFinite(a.mouseY)&&a.mouseX===b.mouseX&&a.mouseY===b.mouseY;
export function makeFixtureBackgroundSetValueArgs(x){
 if(!x||!ref(x.nodeId)||!uuid.test(x.executionId)||
  !ref(x.windowRef)||!ref(x.elementRef)||!ref(x.observationId)||
  !nonce.test(x.token))throw Error('fixture_write_proof_required');
 const params={action:'set_value',executionId:x.executionId,
  windowRef:x.windowRef,elementRef:x.elementRef,
  observationId:x.observationId,
  value:PREFIX+x.token,deliveryMode:'background'};
 return Object.freeze(['nodes','invoke','--node',x.nodeId,
  '--command','computer.act','--params',JSON.stringify(params),'--json']);
}
export function exactFixtureWrittenValue(raw,token,previousObservationId){
 if(!nonce.test(token)||!ref(previousObservationId))return false;
 const identified=findFixtureElement(raw);
 if(identified.state!=='matched'||
    identified.observationId===previousObservationId)return false;
 const elems=walkNativePayload(raw).filter(x=>x&&
  typeof x==='object'&&!Array.isArray(x)&&
  [x.label,x.accessibilityLabel,x.name,x.title].includes(FIELD));
 if(elems.length!==1)return false;
 const v=elems[0];
 const actual=typeof v.value==='string'?v.value:v.stringValue;
 return actual===PREFIX+token;
}
// Callback runs only after the observer verified fresh window/title, child
// PID, independent WindowServer ownership, initial value, provider generation
// and unchanged frontmost/pointer. No external input to choose the target.
export async function verifiedFixtureBackgroundWrite(context){
 const {nodeId,executionId,windowRef,elementRef,observationId,token,
  run,readState,baseline,verifyOwnedWindow,fixtureIsAlive,
  getCurrentNode,markWriteAttempted}=context??{};
 if(typeof run!=='function'||typeof readState!=='function'||
  typeof verifyOwnedWindow!=='function'||typeof fixtureIsAlive!=='function'||
  typeof getCurrentNode!=='function'||typeof markWriteAttempted!=='function')
  throw Error('fixture_write_callback_contract_required');
 // No write when the target/generation/foreground became stale in between
 // original read and mutation.
 const params={nodeId,executionId,windowRef,elementRef,observationId,token};
 const args=makeFixtureBackgroundSetValueArgs(params);
 if(!fixtureIsAlive()||await verifyOwnedWindow()!==true||
    await getCurrentNode()!==true||
    !sameState(baseline,await readState()))
  return {writeIssued:false,nativeReadbackMatched:false,
   fixtureStillOwned:false,providerGenerationStable:false,
   focusAndPointerUnchanged:false};
 // The sole allowed mutation. Record intention BEFORE dispatch. Never retry.
 markWriteAttempted();
 const receipt=await run(args,25000);
 if(receipt?.ok===false||receipt?.result?.ok===false)
  throw Error('fixture_set_value_native_refused');
 // Read back strictly the same owned window, never list other windows here.
 const post=await run(makeReadOnlyNativeArgs(
  nodeId,executionId,'get_window_state',{windowRef}),25000);
 const [owned,provider,after]=await Promise.all([
  verifyOwnedWindow(),getCurrentNode(),readState()
 ]);
 return {
  writeIssued:true,
  nativeReadbackMatched:exactFixtureWrittenValue(post,token,observationId),
  fixtureStillOwned:owned===true&&fixtureIsAlive()===true,
  providerGenerationStable:provider===true,
  focusAndPointerUnchanged:sameState(baseline,after)
 };
}
export async function fixtureBackgroundWriteProof({observe=nativeCUAFixtureObserve,
 challenge=verifiedFixtureBackgroundWrite}={}){
 const result=await observe({verifiedFixtureChallenge:challenge});
 // The caller sees only synthetic booleans / known reason enums. In
 // particular, the native observer does not expose window/element refs.
 return {...result,audit:AUDIT};
}
if(process.argv[1]&&resolve(process.argv[1])===THIS){
 if(process.argv.length!==2){
  process.stdout.write(JSON.stringify({
   audit:AUDIT,state:'blocked',reason:'no_runtime_arguments_allowed',
   performedComputerInput:false})+'\n');
  process.exitCode=1;
 }else{
  try{
   const result=await fixtureBackgroundWriteProof();
   process.stdout.write(JSON.stringify(result)+'\n');
   if(result.state!=='observed')process.exitCode=1;
  }catch{
   process.stdout.write(JSON.stringify({
    audit:AUDIT,state:'inconclusive',reason:'fixture_background_write_runtime_error',
    screenshotTaken:false,browserAccess:false,changedBrowser:false,
    // Unknown exit occurs after callback boundary: never assert no input.
    performedComputerInput:'unknown'
   })+'\n');
   process.exitCode=1;
  }
 }
}
