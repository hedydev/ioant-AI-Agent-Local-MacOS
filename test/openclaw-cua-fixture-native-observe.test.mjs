import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {makeReadOnlyNativeArgs,findExactFixtureWindow,findFixtureElement,
 walkNativePayload,nativeCUAFixtureObserve}
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
 assert.match(s,/child=launch\(binary\)/);
 assert.match(s,/if\(child&&child\.exitCode===null&&child\.pid\)child\.kill\('SIGTERM'\)/);
 assert.match(s,/setTimeout|const pause=ms=>new Promise/);
 assert.doesNotMatch(s,/osascript|--browser-profile|CGEventPost|\.activate\(|killall/);
});
test('app lifecycle and reads compare frontmost identity + hardware cursor',()=>{
 assert.match(s,/after\.frontmost===before\.frontmost/);
 assert.match(s,/after\.mouseX===before\.mouseX/);
 assert.match(s,/after\.mouseY===before\.mouseY/);
 assert.match(s,/provider\.generation===generation/);
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
