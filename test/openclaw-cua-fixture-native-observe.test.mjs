import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {makeReadOnlyNativeArgs,findExactFixtureWindow,findFixtureElement,
 walkNativePayload,nativeCUAFixtureObserve,fixtureWindowEvidence,
 shouldCloseOwnFixtureExecution,findOSAttestedFixtureWindow,
 safeFixtureOSDiagnosis,parseOwnFixtureReady,awaitOwnFixtureReady,
 safeNativeCLIExitEvidence,safeGatewayNativeError,safeCliMessageFingerprint,
 focusPointerComparison}
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
 assert.match(s,/before\.frontmost===after\.frontmost/);
 assert.match(s,/before\.mouseX===after\.mouseX/);
 assert.match(s,/before\.mouseY===after\.mouseY/);
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
 assert.match(s,/--prove-owned-window/);
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
 assert.match(s,/nativeReadAttempted:false,fixtureSelfAttested:true,/);
 assert.match(s,/fixtureOSDiagnosis:diagnosis/);
 assert.match(s,/findOSAttestedFixtureWindow\(windows,child\.pid,title/);
 assert.match(s,/scopedCloseRequest\(leasedNodeId,leasedExecutionId\)/);
 assert.doesNotMatch(s,/CGRequestScreenCaptureAccess|screencapture|--browser-profile/);
});

test('in-process readiness requires exact own nonce, PID and verified window',()=>{
 const token='0123456789abcdefabcdefab',p=46124;
 assert.equal(parseOwnFixtureReady(
  'IOANT_FIXTURE_READY_V1 '+token+' '+p+' 1',token,p),true);
 for(const line of [
  'IOANT_FIXTURE_READY_V1 '+token+' '+p+' 0',
  'IOANT_FIXTURE_READY_V1 '+token+' '+(p+1)+' 1',
  'IOANT_FIXTURE_READY_V1 '+'f'.repeat(24)+' '+p+' 1',
  'IOANT_FIXTURE_READY_V1 '+token+' '+p+' 1 extra',
  'IOANT_FIXTURE_READY_V1 '+token+' '+p+' 1\nprivate window',
  'fake/other_window', '',null
 ]){
  assert.equal(parseOwnFixtureReady(line,token,p),false);
 }
 assert.equal(parseOwnFixtureReady(
  'IOANT_FIXTURE_READY_V1 '+token+' '+p+' 1','bad-token',p),false);
});
test('only the exact spawned child stdout can provide readiness',async()=>{
 const {EventEmitter}=await import('node:events');
 const child=new EventEmitter();
 child.pid=46124;
 child.stdout=new EventEmitter();
 const token='0123456789abcdefabcdefab';
 const ready=awaitOwnFixtureReady(child,token,{timeoutMs:1000});
 child.stdout.emit('data',Buffer.from(
  'IOANT_FIXTURE_READY_V1 '+token+' 46124 1\n'));
 assert.equal(await ready,true);
 const other=awaitOwnFixtureReady(child,token,{timeoutMs:1000});
 child.stdout.emit('data',Buffer.from(
  'IOANT_FIXTURE_READY_V1 '+token+' 46125 1\n'));
 assert.equal(await other,false);
});
test('readiness fails closed for missing child stream and early exit',async()=>{
 const {EventEmitter}=await import('node:events');
 assert.equal(await awaitOwnFixtureReady({pid:46124},'f'.repeat(24)),false);
 const child=new EventEmitter();
 child.pid=46124;
 child.stdout=new EventEmitter();
 const promise=awaitOwnFixtureReady(child,'f'.repeat(24),{timeoutMs:1000});
 child.emit('exit',1);
 assert.equal(await promise,false);
});
test('fixture requires process self-window proof and non-TCC owner metadata before CUA',()=>{
 assert.match(s,/await awaitOwnFixtureReady\(child,token\)/);
 assert.match(s,/if\(!selfAttested\|\|child\.exitCode!==null\)/);
 assert.match(s,/--prove-owned-window/);
 assert.match(s,/findOSAttestedFixtureWindow\(windows,child\.pid,title/);
 assert.match(s,/postListOSVerified===true&&child\.exitCode===null/);
 assert.match(s,/fixtureSelfAttested:true,independentOSPidVerified:true/);
 assert.match(s,/scopedCloseRequest\(leasedNodeId,leasedExecutionId\)/);
 assert.doesNotMatch(s,/CGRequestScreenCaptureAccess|screencapture|osascript|killall/);
});

test('opaque OpenClaw exit 1 exposes only coarse CLI channel and envelope shape',()=>{
 const privateError=Object.assign(Error('Private notes secret'),{
  code:1,
  stdout:JSON.stringify({ok:false,error:{message:'private ChatGPT Chrome window',
   token:'secret-user-token'},windows:[{title:'private chat'}]}),
  stderr:'Error: private runtime output with embedded access-token'
 });
 const out=safeNativeCLIExitEvidence(privateError);
 assert.deepEqual(out,{
  stdoutKind:'json',stderrKind:'text',
  stdoutErrorEnvelope:true,stderrErrorEnvelope:false,
  hint:'none_recognized',localProcessFault:'none',stderrErrorPrefix:true
 });
 const json=JSON.stringify(out);
 for(const secret of ['secret-user-token','ChatGPT','Chrome','private','access-token'])
  assert.equal(json.includes(secret),false);
});
test('native CLI evidence only emits fixed enums for known busy and denial',()=>{
 for(const [snippet,hint] of [
  ['COMPUTER_HOST_BUSY another owner','owner_busy'],
  ['approval required; forbidden','policy_denied'],
  ['COMPUTER_UNSUPPORTED_ACTION','invalid_native_action'],
  ['invalid executionId','invalid_request'],
  ['COMPUTER_DRIVER_UNAVAILABLE','driver_unavailable'],
  ['NODE_DISCONNECTED','node_unavailable'],
  ['Error: websocket closed','transport_error'],
  ['Error: deadline exceeded','timeout'],
  ['unknown command for nodes','cli_usage']
 ]){
  const r=safeNativeCLIExitEvidence({code:1,stderr:snippet});
  assert.equal(r.hint,hint);
  assert.equal(r.stdoutKind,'empty');
 }
});
test('CLI failure evidence never leaks a structured nested native error payload',()=>{
 const r=safeNativeCLIExitEvidence({code:1,
  stdout:JSON.stringify({result:{ok:false,error:{
   code:'unknown-private-code',message:'my diary title and api password'
  }}}),
  stderr:JSON.stringify({error:{message:'other private text'}})
 });
 assert.equal(r.stdoutKind,'json');
 assert.equal(r.stderrKind,'json');
 assert.equal(r.stdoutErrorEnvelope,true);
 assert.equal(r.stderrErrorEnvelope,true);
 assert.equal(r.hint,'none_recognized');
 assert.equal(JSON.stringify(r).includes('diary'),false);
 assert.equal(JSON.stringify(r).includes('password'),false);
});
test('native failure local subprocess size and binary errors remain bounded',()=>{
 const maxed=safeNativeCLIExitEvidence({
  code:'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',stdout:'x'.repeat(525000)});
 assert.equal(maxed.localProcessFault,'output_size');
 assert.equal(maxed.stdoutKind,'large_text');
 assert.equal(safeNativeCLIExitEvidence({code:'ENOENT'}).localProcessFault,
  'executable_missing');
 assert.equal(safeNativeCLIExitEvidence({code:'EACCES'}).localProcessFault,
  'executable_access');
});
test('only native read failure reports safe CLI evidence, not raw error strings',()=>{
 assert.match(s,/safeNativeCLIExitEvidence\(error\):null/);
 assert.match(s,/nativeFailure:failed,nativeCliEvidence:cliEvidence/);
 assert.match(s,/phase==='window_list'\|\|phase==='window_state'/);
 assert.doesNotMatch(s,/console\.log\(error\)|console\.error\(error\)|nativeCliEvidence:error/);
 assert.match(s,/scopedCloseRequest\(leasedNodeId,leasedExecutionId\)/);
 assert.match(s,/performedComputerInput:false/);
});

test('Gateway INVALID_REQUEST error is typed without leaking opaque error values',()=>{
 const obj=safeGatewayNativeError({stdout:JSON.stringify({error:{
  code:'INVALID_REQUEST',message:'secret user window password'}})});
 assert.deepEqual(obj,{available:true,origin:'top',errorForm:'object',
  codePresent:true,codeFamily:'invalid_request',messageFamily:'none',
  typeFamily:'unknown',transportKind:'unknown',codeKind:'string',
  detailForm:'absent',messageIndicators:[],retryableKnown:false,
  cliMessageFingerprint:{state:'present',lengthBand:'short',technicalTerms:['window'],
   nestedErrorForm:'none',nestedCodeFamily:'unknown'},
  rootOriginMarker:'absent',dispatchKnown:false});
 assert.equal(JSON.stringify(obj).includes('secret'),false);
 assert.equal(JSON.stringify(obj).includes('password'),false);
});
test('Gateway plugin policy denial identifies pre-dispatch refusal',()=>{
 const obj=safeGatewayNativeError({stdout:JSON.stringify({
  result:{ok:false,error:{code:'PLUGIN_POLICY_RISK_CLASSIFICATION_FAILED',
   message:'node.invoke computer.act arguments could not be classified'},
   details:{nodeCommandDispatched:false}}
 })});
 assert.equal(obj.available,true);
 assert.equal(obj.origin,'result');
 assert.equal(obj.codeFamily,'invalid_request');
 assert.equal(obj.messageFamily,'authorization');
 assert.equal(obj.dispatchKnown,true);
 assert.equal(obj.nodeCommandDispatched,false);
});
test('Gateway node error nested under details is categorized without nested disclosure',()=>{
 const obj=safeGatewayNativeError({stdout:JSON.stringify({
  result:{ok:false,details:{nodeError:{
   code:'COMPUTER_DRIVER_UNAVAILABLE',message:'sensitive title'},
   nodeCommandDispatched:true}}
 })});
 assert.equal(obj.available,true);
 assert.equal(obj.origin,'result_node_error');
 assert.equal(obj.codeFamily,'provider_unavailable');
 assert.equal(obj.nodeCommandDispatched,true);
 assert.equal(JSON.stringify(obj).includes('sensitive'),false);
});
test('Gateway plain-text error and unknown code remain redacted',()=>{
 const r=safeGatewayNativeError({stdout:JSON.stringify({
  error:'operator.write required to invoke node command; private token'
 })});
 assert.equal(r.errorForm,'string');
 assert.equal(r.messageFamily,'authorization');
 assert.equal(r.codePresent,false);
 const unknown=safeGatewayNativeError({stdout:JSON.stringify({
  error:{code:'SECRET_API_PASSWORD',message:'do not reveal me'}
 })});
 assert.equal(unknown.codePresent,true);
 assert.equal(unknown.codeFamily,'unknown');
 for(const token of ['SECRET_API_PASSWORD','do not reveal me','private token'])
  assert.equal(JSON.stringify({r,unknown}).includes(token),false);
});
test('Gateway failure parser refuses unstructured and oversized stderr',()=>{
 for(const x of [null,{stderr:'secret'}, {stdout:'not a json blob'},
  {stdout:'[]'}, {stdout:'x'.repeat(300000)}]){
  assert.deepEqual(safeGatewayNativeError(x),{available:false});
 }
});
test('CLI observer only reports Gateway bounded refusal; own UUID only',()=>{
 assert.match(s,/safeGatewayNativeError\(error\):null/);
 assert.match(s,/gatewayErrorEvidence/);
 assert.match(s,/gatewayErrorEvidence\?\.nodeCommandDispatched===false/);
 assert.match(s,/scopedCloseRequest\(leasedNodeId,leasedExecutionId\)/);
 assert.match(s,/performedComputerInput:false/);
 assert.doesNotMatch(s,/console\.log\(error\)|console\.error\(error\)|rawFailure:error/);
});

test('canonical OpenClaw 2026.10.7 CLI failure has type cli_error and no code',()=>{
 const output=safeGatewayNativeError({code:1,stdout:JSON.stringify({
  ok:false,error:{
   type:'cli_error',
   message:'nodes invoke failed: node.invoke Computer provider unavailable. PRIVATE WINDOW'
  }
 })});
 assert.equal(output.available,true);
 assert.equal(output.typeFamily,'cli_error');
 assert.equal(output.codePresent,false);
 assert.equal(output.codeKind,'absent');
 assert.deepEqual(output.messageIndicators,
  ['cli_invoke','computer','driver','node']);
 assert.equal(output.rootOriginMarker,'absent');
 const flat=JSON.stringify(output);
 assert.equal(flat.includes('PRIVATE WINDOW'),false);
 assert.equal(flat.includes('nodes invoke failed'),false);
});
test('canonical Gateway transport error identifies kind even for numeric code',()=>{
 const output=safeGatewayNativeError({stdout:JSON.stringify({
  ok:false,error:{type:'gateway_transport_error',kind:'timeout',code:504,
   message:'Sensitive URL https://internal.local/password'
  }
 })});
 assert.equal(output.typeFamily,'gateway_transport_error');
 assert.equal(output.transportKind,'timeout');
 assert.equal(output.codeKind,'number');
 assert.equal(output.codePresent,false);
 assert.equal(JSON.stringify(output).includes('504'),false);
 assert.equal(JSON.stringify(output).includes('internal.local'),false);
});
test('gateway request and credentials error types are recognized without private details',()=>{
 for(const kind of ['gateway_request_error','gateway_credentials_required']){
  const out=safeGatewayNativeError({stdout:JSON.stringify({
   origin:'gateway',
   error:{type:kind,message:'token secret',details:{password:'private'},
    retryable:false}
  })});
  assert.equal(out.typeFamily,kind);
  assert.equal(out.detailForm,'object');
  assert.equal(out.retryableKnown,true);
  assert.equal(out.retryable,false);
  assert.equal(out.rootOriginMarker,'gateway');
  assert.equal(JSON.stringify(out).includes('password'),false);
 }
});
test('unknown error type, kind and message are never reflected',()=>{
 const out=safeGatewayNativeError({stdout:JSON.stringify({
  error:{type:'user secret nickname',kind:'private code 1',
   message:'my secret browser account title',
   code:'custom-very-sensitive-value'}
 })});
 assert.equal(out.typeFamily,'unknown');
 assert.equal(out.transportKind,'unknown');
 assert.equal(out.codeFamily,'unknown');
 assert.equal(out.messageFamily,'none');
 assert.deepEqual(out.messageIndicators,[]);
 for(const secret of ['secret nickname','private code','browser account','custom-very-sensitive'])
  assert.equal(JSON.stringify(out).includes(secret),false);
});
test('gateway structural classifier remains readonly and bounded on code-free CLI error',()=>{
 assert.match(s,/type='cli_error'/);
 assert.match(s,/typeFamily,transportKind,codeKind,detailForm,messageIndicators/);
 assert.match(s,/gatewayErrorEvidence/);
 assert.match(s,/scopedCloseRequest\(leasedNodeId,leasedExecutionId\)/);
 assert.doesNotMatch(s,/console\.log\(error\)|console\.error\(error\)|rawFailure:error/);
});

test('CLI code-free error fingerprint returns bounded technical vocabulary only',()=>{
 const e='Operation failed: native window backend unavailable; '+
  'user profile secret private document is never returned';
 const o=safeCliMessageFingerprint(e);
 assert.equal(o.state,'present');
 assert.equal(o.lengthBand,'medium');
 assert.deepEqual(o.technicalTerms,
  ['failed','native','window','backend','unavailable']);
 assert.equal(o.nestedErrorForm,'none');
 for(const forbidden of ['user profile','secret','private document','never returned']){
  assert.equal(JSON.stringify(o).includes(forbidden),false);
 }
 assert.equal(Object.isFrozen(o),true);
 assert.equal(Object.isFrozen(o.technicalTerms),true);
});
test('empty/nonstring error messages cannot be mistaken for useful error evidence',()=>{
 assert.deepEqual(safeCliMessageFingerprint(undefined),{
  state:'missing',lengthBand:'none',technicalTerms:[],
  nestedErrorForm:'none',nestedCodeFamily:'unknown'
 });
 assert.deepEqual(safeCliMessageFingerprint(''),{
  state:'empty',lengthBand:'empty',technicalTerms:[],
  nestedErrorForm:'none',nestedCodeFamily:'unknown'
 });
});
test('nested code in message recognized only if complete message is bounded JSON',()=>{
 const e=JSON.stringify({error:{code:'MISSING_SCOPE',
  message:'private user browser password'},meta:{password:'secret'}});
 const out=safeCliMessageFingerprint(e);
 assert.equal(out.nestedErrorForm,'object');
 assert.equal(out.nestedCodeFamily,'authorization');
 assert.equal(JSON.stringify(out).includes('secret'),false);
 assert.equal(JSON.stringify(out).includes('private'),false);
 const other=safeCliMessageFingerprint('prefix '+e);
 assert.equal(other.nestedErrorForm,'none');
 assert.equal(other.nestedCodeFamily,'unknown');
});
test('fingerprint limits terms and buckets even for maliciously long messages',()=>{
 const raw='version config process backend service window owner execution '+
  'native driver provider gateway policy scope permission denied invalid '+
  'state session computer launch username private ';
 const result=safeCliMessageFingerprint(raw.repeat(10000));
 assert.equal(result.lengthBand,'very_long');
 assert.equal(result.technicalTerms.length,16);
 assert.equal(JSON.stringify(result).includes('username'),false);
 assert.equal(JSON.stringify(result).length<900,true);
});
test('native CLI diagnostic retains strict one-shot and no user desktop input',()=>{
 assert.match(s,/cliMessageFingerprint=safeCliMessageFingerprint\(message\)/);
 assert.match(s,/cliMessageFingerprint,/);
 assert.match(s,/nativeReadAttempted=true/);
 assert.match(s,/scopedCloseRequest\(leasedNodeId,leasedExecutionId\)/);
 assert.doesNotMatch(s,/console\.log\(error\)|console\.error\(error\)|private_document_name/);
});

test('background fixture observer separates frontmost from pointer changes',()=>{
 const original={frontmost:'com.example.foreground',mouseX:25,mouseY:33};
 assert.deepEqual(focusPointerComparison(original,{...original}),{
  frontmostUnchanged:true,pointerUnchanged:true});
 assert.deepEqual(focusPointerComparison(original,{
  ...original,frontmost:'com.example.second'}),{
  frontmostUnchanged:false,pointerUnchanged:true});
 assert.deepEqual(focusPointerComparison(original,{
  ...original,mouseY:34}),{
  frontmostUnchanged:true,pointerUnchanged:false});
});
test('malformed foreground or cursor snapshots fail closed and never reflect raw IDs',()=>{
 const before={frontmost:'PRIVATE_BUNDLE_ID',mouseX:0,mouseY:0};
 const signals=focusPointerComparison(before,{
  frontmost:'PRIVATE_BUNDLE_ID',mouseX:Number.NaN,mouseY:0});
 assert.deepEqual(signals,{frontmostUnchanged:true,pointerUnchanged:false});
 assert.equal(Object.isFrozen(signals),true);
 assert.deepEqual(focusPointerComparison(null,null),{
  frontmostUnchanged:false,pointerUnchanged:false});
 assert.doesNotMatch(JSON.stringify(signals),/PRIVATE|BUNDLE_ID/);
});
test('write-only fixture gate reports separate launch / post-read signals, never overrides them',()=>{
 assert.match(s,/interferenceStage:'fixture_launch'/);
 assert.match(s,/interferenceStage:'post_native_read'/);
 assert.match(s,/interferenceSignals:postReadSignals/);
 assert.match(s,/interferenceSignals:launchSignals/);
 assert.match(s,/mutatingActionAttempted:false,fixtureWindowMatched:true/);
 assert.match(s,/unchanged=postReadSignals.frontmostUnchanged&&postReadSignals.pointerUnchanged/);
 assert.doesNotMatch(s,/CGEventPost|osascript|--browser-profile|\.activate\(/);
});
