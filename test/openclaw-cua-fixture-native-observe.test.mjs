import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {makeReadOnlyNativeArgs,findExactFixtureWindow,findFixtureElement,
 walkNativePayload,nativeCUAFixtureObserve,fixtureWindowEvidence,
 shouldCloseOwnFixtureExecution,findOSAttestedFixtureWindow,
 safeFixtureOSDiagnosis}
 from '../scripts/openclaw-cua-fixture-native-observe.mjs';

const root=resolve(import.meta.dirname,'..');
const s=readFileSync(resolve(root,'scripts/openclaw-cua-fixture-native-observe.mjs'),'utf8');
const UUID='d74d37dd-dcc3-42d0-ab46-70a43cad4a7f';
const pid=46124;
const name='IOANT CUA Noninterference Fixture';
const field='IOANT CUA Fixture Editable';
test('only two exact native actions are creatable; no browser, click or text',()=>{
 for(const action of ['list_windows','get_window_state']){
  const args=makeReadOnlyNativeArgs('paired-node-id',UUID,action,
   {windowRef:'synthetic-win'});
  assert.deepEqual(args.slice(0,6),
   ['nodes','invoke','--node','paired-node-id','--command','computer.act']);
  const payload=JSON.parse(args[7]);
  assert.equal(payload.action,action);
  assert.equal(payload.executionId,UUID);
  if(action==='get_window_state'){
   assert.equal(payload.windowRef,'synthetic-win');
   assert.equal(payload.includeScreenshot,false);
  }
  assert.equal(args.some(v=>v.includes('browser')),false);
 }
 for(const forbidden of ['set_value','type','key','left_click','launch_app',
  'get_browser_state','screenshot','bring_to_front']){
  assert.throws(()=>makeReadOnlyNativeArgs('node',UUID,forbidden));
 }
 assert.throws(()=>makeReadOnlyNativeArgs('node',UUID,'get_window_state'));
});
test('window discovery strictly requires matching fixture title and exact launched pid',()=>{
 const list={result:{payload:{details:{windows:[
  {pid:123,title:'Other sensitive window',windowRef:'private-ref'},
  {pid,title:name,windowRef:'fixture-win'}
 ]}}}};
 const r=findExactFixtureWindow(list,pid);
 assert.deepEqual(r,{state:'matched',matchedWindowCount:1,windowRef:'fixture-win'});
 const json=JSON.stringify(r);
 assert.equal(json.includes('Other sensitive'),false);
 assert.equal(json.includes('private-ref'),false);
});
test('same-title other PID cannot hijack the intended fixture',()=>{
 const r=findExactFixtureWindow({result:{windows:[
  {pid:808,title:name,windowRef:'wrong'}
 ]}},pid);
 assert.equal(r.reason,'fixture_window_not_found');
});
test('ambiguous fixtures always block without choosing first',()=>{
 const r=findExactFixtureWindow({result:{windows:[
  {pid,title:name,windowRef:'a'},
  {pid,title:name,windowRef:'b'}
 ]}},pid);
 assert.equal(r.reason,'ambiguous_fixture_window');
 assert.equal(r.windowRef,undefined);
});
test('unreferenced fixture cannot lead to targeted read',()=>{
 const r=findExactFixtureWindow({windows:[{pid,title:name}]},pid);
 assert.equal(r.reason,'window_reference_missing');
});
test('one exact text element with fresh observation and initial value matches',()=>{
 const raw={result:{data:{observationId:'observation-x',
   elements:[
    {label:'Other content',elementRef:'other-1',value:'secret'},
    {label:field,elementRef:'field-12',value:'IOANT-FIXTURE-INITIAL'}
   ]}}};
 const r=findFixtureElement(raw);
 assert.deepEqual(r,{state:'matched',elementRef:'field-12',
  observationId:'observation-x',valueMatchesInitial:true});
 assert.equal(JSON.stringify(r).includes('secret'),false);
});
test('missing or ambiguous element observation is fail-closed',()=>{
 for(const raw of [
  {result:{elements:[{label:field,elementRef:'e1'}]}},
  {observationId:'o1',elements:[{label:'wrong',elementRef:'e1'}]},
  {observationId:'o1',elements:[{label:field,elementRef:'e1'},
    {label:field,elementRef:'e2'}]}
 ]){
  assert.equal(findFixtureElement(raw).state,'inconclusive');
 }
});
test('nested transport JSON string is parsed but raw content never returned',()=>{
 const doc={result:{content:JSON.stringify({
  details:{windows:[{pid,title:name,windowRef:'encoded-ref'}]}
 })}};
 assert.equal(findExactFixtureWindow(doc,pid).windowRef,'encoded-ref');
 assert.ok(walkNativePayload(doc).length>=4);
});
test('the only UI executable spawned is the private fingerprinted fixture',()=>{
 assert.match(s,/const fingerprint=createHash\('sha256'\)\.update\(code\)/);
 assert.match(s,/const binary=join\(appdir,'Contents','MacOS','ioant-cua-fixture'\)/);
 assert.match(s,/child=launch\(binary,token\)/);
 assert.match(s,/spawn\(bin,\['--run',nonce\]/);
 assert.match(s,/if\(child&&child\.exitCode===null&&child\.pid\)child\.kill\('SIGTERM'\)/);
 assert.match(s,/setTimeout|const pause=ms=>new Promise/);
 assert.doesNotMatch(s,/osascript|--browser-profile|CGEventPost|\.activate\(|killall/);
});
test('app lifecycle and reads compare frontmost identity + hardware cursor',()=>{
 assert.match(s,/after\.frontmost===before\.frontmost/);
 assert.match(s,/after\.mouseX===before\.mouseX/);
 assert.match(s,/after\.mouseY===before\.mouseY/);
 assert.match(s,/provider\?\.generation===generation/);
 assert.match(s,/includeScreenshot=false/);
});
test('read-only script has no input command construction, no screenshot output',()=>{
 assert.match(s,/performedComputerInput:false/);
 assert.match(s,/screenshotTaken:false/);
 assert.match(s,/browserAccess:false/);
 assert.doesNotMatch(s,/action:'(?:set_value|type|left_click|key|browser_navigate)'/);
});
test('on non-mac runtime no child process or computer query is performed',async()=>{
 const r=await nativeCUAFixtureObserve({
  run:async()=>{throw Error('must not touch anything')},
  launch:()=>{throw Error('must not launch')}
 });
 if(process.platform!=='darwin'){
  assert.equal(r.state,'blocked');
  assert.equal(r.launchedFixture,false);
  assert.equal(r.performedComputerInput,false);
 }
});

test('realistic content[].text JSON envelope can preserve exact synthetic PID match',()=>{
 const body={result:{content:[{type:'text',text:JSON.stringify({
  result:{details:{windows:[
   {processId:'46124',windowTitle:name,window_ref:'opaque-owned-win'},
   {processId:'92820',windowTitle:'Personal browser document',window_ref:'secret-ref'}
  ]}}})}]}};
 const hit=findExactFixtureWindow(body,pid);
 assert.deepEqual(hit,{state:'matched',windowRef:'opaque-owned-win',
  matchedWindowCount:1});
 const evidence=fixtureWindowEvidence(body,pid);
 assert.equal(evidence.fixtureExactTitleSeen,true);
 assert.equal(evidence.fixtureProcessIdSeen,true);
 assert.equal(evidence.fixtureTitleAndPidSameRecord,true);
 assert.equal(evidence.fixtureWindowRefSeen,true);
 assert.equal(evidence.textContentEnvelopePresent,true);
 assert.equal(JSON.stringify(evidence).includes('Personal browser'),false);
 assert.equal(JSON.stringify(evidence).includes('secret-ref'),false);
});
test('nested structuredContent envelope and ownerPID accept only exact synthetic identity',()=>{
 const raw={result:{structuredContent:{windows:[
  {ownerPID:pid,window_name:name,windowRef:'native-window-ax'},
  {ownerPID:pid+1,window_name:'Private note',windowRef:'other'}
 ]}}};
 assert.equal(findExactFixtureWindow(raw,pid).windowRef,'native-window-ax');
});
test('title only and PID only cannot be fused to forge a window identity',()=>{
 const raw={result:{windows:[
  {pid,title:'Private foreground window',windowRef:'secret'},
  {pid:999,title:name,windowRef:'fake'}
 ]}};
 const r=findExactFixtureWindow(raw,pid);
 assert.equal(r.reason,'fixture_window_not_found');
 const evidence=fixtureWindowEvidence(raw,pid);
 assert.equal(evidence.fixtureExactTitleSeen,true);
 assert.equal(evidence.fixtureProcessIdSeen,true);
 assert.equal(evidence.fixtureTitleAndPidSameRecord,false);
 assert.equal(evidence.fixtureWindowRefSeen,false);
});
test('freeform transport text is diagnostic only, never guessed as a window reference',()=>{
 const raw={result:{content:[{type:'text',
  text:'IOANT CUA Noninterference Fixture pid=46124 windowRef=GUESS'}]}};
 const evidence=fixtureWindowEvidence(raw,pid);
 assert.equal(evidence.fixtureMentionedInTransportText,true);
 assert.equal(evidence.fixtureWindowRefSeen,false);
 assert.equal(findExactFixtureWindow(raw,pid).state,'inconclusive');
 assert.equal(JSON.stringify(evidence).includes('GUESS'),false);
});
test('native failure envelope classified as a boolean without private messages',()=>{
 const raw={result:{ok:false,reason:'Private runtime approval missing',
  error:{message:'secret document title'}}};
 const evidence=fixtureWindowEvidence(raw,pid);
 assert.equal(evidence.nativeEnvelopeRefused,true);
 assert.equal(JSON.stringify(evidence).includes('secret'),false);
});

test('nested transport fixture row occurs at depth 9 and bounded default reaches it',()=>{
 const wrapped={result:{content:[{type:'text',text:JSON.stringify({
  result:{details:{windows:[{processId:String(pid),
   windowTitle:name,window_ref:'depth-nine-only'}]}}
 })}]}};
 const shallow=walkNativePayload(wrapped,{maxDepth:8});
 assert.equal(shallow.some(x=>x?.window_ref==='depth-nine-only'),false);
 const bounded=walkNativePayload(wrapped);
 assert.equal(bounded.some(x=>x?.window_ref==='depth-nine-only'),true);
 assert.deepEqual(findExactFixtureWindow(wrapped,pid),{
  state:'matched',windowRef:'depth-nine-only',matchedWindowCount:1});
 assert.ok(bounded.length<1800);
});
test('deeply nested arbitrary wrapper cannot bypass finite traversal limit',()=>{
 let data={pid,title:name,windowRef:'should-not-be-reachable'};
 for(let i=0;i<16;i++)data={result:data};
 const found=walkNativePayload(data);
 assert.equal(found.some(x=>x.windowRef==='should-not-be-reachable'),false);
 assert.equal(findExactFixtureWindow(data,pid).state,'inconclusive');
});

test('fixture observation retains exact execution ID for scoped lease cleanup',()=>{
 assert.match(s,/leasedExecutionId=executionId/);
 assert.match(s,/leasedNodeId=chosen\.id/);
 assert.match(s,/nativeReadAttempted=true/);
 assert.match(s,/scopedCloseRequest\(leasedNodeId,leasedExecutionId\)/);
 assert.match(s,/preAdmissionRejected/);
 assert.match(s,/ownerReleaseVerified:false/);
 assert.match(s,/existingComputerOwnerReleased=false/);
 assert.match(s,/own_execution_close_not_acknowledged/);
});

test('first completed list_windows always requires closing this session even if second read is refused',()=>{
 for(const preAdmissionRejected of [false,true]){
  assert.equal(shouldCloseOwnFixtureExecution({
   nativeReadAttempted:true,firstReadReturned:true,preAdmissionRejected
  }),true);
 }
 assert.match(s,/firstReadReturned=true/);
 assert.match(s,/shouldCloseOwnFixtureExecution\(\{nativeReadAttempted,/);
 assert.match(s,/scopedCloseRequest\(leasedNodeId,leasedExecutionId\)/);
});
test('first denied native read does not close an existing unknown execution owner',()=>{
 assert.equal(shouldCloseOwnFixtureExecution({
  nativeReadAttempted:true,firstReadReturned:false,preAdmissionRejected:true
 }),false);
 assert.equal(shouldCloseOwnFixtureExecution({
  nativeReadAttempted:false,firstReadReturned:false,preAdmissionRejected:false
 }),false);
});
test('ambiguous failure of first native read attempts to close only its own UUID',()=>{
 assert.equal(shouldCloseOwnFixtureExecution({
  nativeReadAttempted:true,firstReadReturned:false,preAdmissionRejected:false
 }),true);
 assert.match(s,/ownerReleaseVerified:false/);
});

test('CUA SDK WindowInfo.app.pid matches only the exact fixture window',()=>{
 const raw={result:{payload:{windows:[
  {title:'Personal browser',app:{pid:1234,app_id:'private.browser'},
   windowRef:'do-not-emit'},
  {title:name,app:{pid},windowRef:'fixture-v2-window'}
 ]}}};
 assert.deepEqual(findExactFixtureWindow(raw,pid),{
  state:'matched',windowRef:'fixture-v2-window',matchedWindowCount:1
 });
 const evidence=fixtureWindowEvidence(raw,pid);
 assert.equal(evidence.fixtureTitleHasNestedAppPid,true);
 assert.equal(evidence.fixtureTitleHasDirectPid,false);
 assert.equal(evidence.fixtureTitleNestedPidMatched,true);
 assert.equal(evidence.fixtureTitleHasConflictingPid,false);
 assert.equal(evidence.fixtureTitleAndPidSameRecord,true);
 assert.equal(evidence.fixtureWindowRefSeen,true);
 assert.equal(JSON.stringify(evidence).includes('private.browser'),false);
 assert.equal(JSON.stringify(evidence).includes('do-not-emit'),false);
 assert.equal(JSON.stringify(evidence).includes(String(pid)),false);
});
test('nested SDK process mismatch cannot use matching title alone',()=>{
 const raw={result:{windows:[
  {title:name,app:{pid:pid+1,app_id:'fixture'},windowRef:'wrong'}
 ]}};
 const result=findExactFixtureWindow(raw,pid);
 assert.equal(result.state,'inconclusive');
 assert.equal(result.reason,'fixture_window_not_found');
 assert.equal(result.windowRef,undefined);
 const e=fixtureWindowEvidence(raw,pid);
 assert.equal(e.fixtureTitleHasNestedAppPid,true);
 assert.equal(e.fixtureTitleNestedPidMatched,false);
 assert.equal(e.fixtureWindowRefSeen,false);
});
test('inconsistent nested and direct PID on one titled record fails closed',()=>{
 const raw={result:{windows:[
  {pid,title:name,app:{pid:pid+1},windowRef:'should-never-match'}
 ]}};
 const r=findExactFixtureWindow(raw,pid);
 assert.equal(r.state,'inconclusive');
 assert.equal(r.reason,'fixture_window_not_found');
 const e=fixtureWindowEvidence(raw,pid);
 assert.equal(e.fixtureTitleHasConflictingPid,true);
 assert.equal(e.fixtureTitleAndPidSameRecord,false);
 assert.equal(e.fixtureWindowRefSeen,false);
});
test('consistent flat + SDK nested PID is permitted with exact windowRef',()=>{
 const raw={result:{windows:[
  {pid:String(pid),title:name,app:{pid},windowRef:'fixture-consistent'}
 ]}};
 assert.equal(findExactFixtureWindow(raw,pid).windowRef,'fixture-consistent');
 const e=fixtureWindowEvidence(raw,pid);
 assert.equal(e.fixtureTitleHasConflictingPid,false);
 assert.equal(e.fixtureTitleHasDirectPid,true);
 assert.equal(e.fixtureTitleHasNestedAppPid,true);
});
test('title in one row and app PID in another never become an identity',()=>{
 const raw={result:{windows:[
  {title:name,windowRef:'guessed-from-title'},
  {title:'Someone else',app:{pid},windowRef:'guessed-from-pid'}
 ]}};
 const r=findExactFixtureWindow(raw,pid);
 assert.equal(r.state,'inconclusive');
 assert.equal(r.windowRef,undefined);
 const e=fixtureWindowEvidence(raw,pid);
 assert.equal(e.fixtureExactTitleSeen,true);
 assert.equal(e.fixtureProcessIdSeen,true);
 assert.equal(e.fixtureTitleAndPidSameRecord,false);
});

const uniqueTitle='IOANT CUA Noninterference Fixture [0123456789abcdefabcdefab]';
test('source-pinned CUA projection needs independent OS owner PID',()=>{
 const raw={result:{details:{windows:[
  {windowRef:'only-fixture-ref',
   title:uniqueTitle,appName:'IOANT CUA Fixture',
   bounds:{x:300,y:250,width:440,height:180}},
  {windowRef:'private-other',title:'Other window'}
 ]}}};
 assert.equal(findExactFixtureWindow(raw,pid).state,'inconclusive');
 assert.deepEqual(findOSAttestedFixtureWindow(raw,pid,uniqueTitle,true),{
  state:'matched',windowRef:'only-fixture-ref',
  matchedWindowCount:1,independentOSPidVerified:true
 });
 assert.equal(findOSAttestedFixtureWindow(raw,pid,uniqueTitle,false).state,
  'inconclusive');
});
test('OS-attested matcher disallows missing or malformed nonce',()=>{
 const record={result:{windows:[{title:uniqueTitle,windowRef:'fixture'}]}};
 for(const title of [name,name+' [short]',
  name+' [0123456789abcdefabcdefaZ]',
  name+' [0123456789abcdefabcdefab]extra']){
  assert.equal(findOSAttestedFixtureWindow(record,pid,title,true).state,
   'inconclusive');
 }
});
test('OS proof plus exact title never accepts ambiguous native refs',()=>{
 const raw={result:{windows:[
  {title:uniqueTitle,windowRef:'a'},
  {title:uniqueTitle,windowRef:'b'}
 ]}};
 const r=findOSAttestedFixtureWindow(raw,pid,uniqueTitle,true);
 assert.equal(r.state,'inconclusive');
 assert.equal(r.reason,'ambiguous_fixture_window');
 assert.equal(r.windowRef,undefined);
});
test('OS proof refuses a contradictory native process ID',()=>{
 for(const row of [
  {title:uniqueTitle,pid:pid+1,windowRef:'bad'},
  {title:uniqueTitle,pid,app:{pid:pid+1},windowRef:'bad'}
 ]){
  const r=findOSAttestedFixtureWindow({result:{windows:[row]}},
   pid,uniqueTitle,true);
  assert.equal(r.state,'inconclusive');
  assert.equal(r.windowRef,undefined);
 }
});
test('OS proof does not permit missing CUA windowRef or wrong row title',()=>{
 const missing={result:{windows:[{title:uniqueTitle}]}};
 assert.equal(findOSAttestedFixtureWindow(missing,pid,uniqueTitle,true)
  .reason,'window_reference_missing');
 const other={result:{windows:[{title:'Browser',windowRef:'other'}]}};
 assert.equal(findOSAttestedFixtureWindow(other,pid,uniqueTitle,true)
  .reason,'fixture_window_not_found');
});
test('live native fixture requires independent OS attestation before and after CUA reads',()=>{
 assert.match(s,/randomBytes\(12\)\.toString\('hex'\)/);
 assert.match(s,/--prove-window/);
 assert.match(s,/ownerProof\(binary,child\.pid,token\)/);
 assert.match(s,/findOSAttestedFixtureWindow\(windows,child\.pid,title/);
 assert.match(s,/independentOSPidVerified:true/);
 assert.match(s,/scopedCloseRequest\(leasedNodeId,leasedExecutionId\)/);
 assert.doesNotMatch(s,/osascript|--browser-profile|CGEventPost|killall/);
});

test('strict OS diagnosis emits only approved booleans and bounded count buckets',()=>{
 const raw={
  verified:false,metadataAvailable:true,screenRecordingGranted:false,
  targetPidWindowCount:'one',targetPidNormalWindowSeen:true,
  targetPidWindowNameVisible:false,exactTitleWindowCount:'none',
  exactTitleOwnerMatched:false,exactTitleNormalLayerMatched:false,
  privateWindowTitle:'Top secret note',
  privateOwnerPID:58321,otherAppNames:['Chrome','ChatGPT']
 };
 const out=safeFixtureOSDiagnosis(raw);
 assert.equal(out.available,true);
 assert.equal(out.screenRecordingGranted,false);
 assert.equal(out.targetPidWindowNameVisible,false);
 assert.equal(out.targetPidWindowCount,'one');
 assert.equal(out.exactTitleWindowCount,'none');
 const json=JSON.stringify(out);
 assert.equal(json.includes('Top secret'),false);
 assert.equal(json.includes('58321'),false);
 assert.equal(json.includes('Chrome'),false);
 assert.equal(json.includes('ChatGPT'),false);
 assert.equal(out.privateWindowTitle,undefined);
});
test('untrusted or incomplete OS diagnosis fails closed',()=>{
 for(const raw of [
  null,false,{},'private contents',
  {verified:true,metadataAvailable:true},
  {verified:false,metadataAvailable:true,screenRecordingGranted:false,
   targetPidWindowCount:'123 private',targetPidNormalWindowSeen:true,
   targetPidWindowNameVisible:false,exactTitleWindowCount:'one',
   exactTitleOwnerMatched:false,exactTitleNormalLayerMatched:false}
 ]){
  assert.deepEqual(safeFixtureOSDiagnosis(raw),{available:false});
 }
});
test('first independent WindowServer proof failure never calls CUA or relaxes identity',()=>{
 assert.match(s,/if\(osVerified!==true\)\{/);
 assert.match(s,/ownerDiagnosis\(binary,child\.pid,token\)/);
 assert.match(s,/nativeReadAttempted:false,fixtureOSDiagnosis:diagnosis/);
 assert.match(s,/findOSAttestedFixtureWindow\(windows,child\.pid,title/);
 assert.match(s,/scopedCloseRequest\(leasedNodeId,leasedExecutionId\)/);
 assert.doesNotMatch(s,/CGRequestScreenCaptureAccess|screencapture|--browser-profile/);
});
