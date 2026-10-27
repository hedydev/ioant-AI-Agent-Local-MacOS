#!/usr/bin/env node
// One-shot *observation-only* CUA proof against a disposable own AppKit app.
// It launches ONLY the hash-pinned fixture (auto-quits at 120 seconds);
// native computer actions are restricted to list_windows/get_window_state.
// No keyboard, pointer, browser, screenshot, focus activation or GUI mutation.
// Raw lists of other applications/windows and AX contents are never emitted.
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {realpath,lstat,readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chooseConnectedMacNode} from './openclaw-mac-visual.mjs';
import {classifyNativeFailure} from './openclaw-native-app-inventory-readonly.mjs';
import {scopedCloseRequest} from './openclaw-cua-owned-session-guard.mjs';
const exec=promisify(execFile);
const HOME=homedir();
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(HOME,'Library','Application Support','ioant-openclaw-ops','runtime');
const FIXTURES=join(HOME,'Library','Application Support','ioant-openclaw-ops','fixtures');
const CLI=join(HOME,'.openclaw','bin','openclaw');
const APP='IOANT-CUA-Noninterference-Fixture.app';
const TITLE='IOANT CUA Noninterference Fixture';
const FIELD='IOANT CUA Fixture Editable';
const START='IOANT-FIXTURE-INITIAL';
const AUDIT='IOANT_CUA_FIXTURE_NATIVE_READONLY';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const plainObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const safeRef=x=>typeof x==='string'&&x.length>=1&&x.length<=1024;
// Real node transports can embed the JSON body as content[].text or
// structuredContent, not only as result.details.windows.
const knownKeys=new Set(['result','payload','data','response','output',
 'content','text','structuredContent','body','message','value','details',
 'observation','windows','window','elements','items','accessibilityTree',
 'tree','children']);
// content[].text may encode result.details.windows in a second JSON
// document. Traversal must allow its ninth-level window rows while staying
// bounded by the existing node cap and a finite maximum depth.
export function walkNativePayload(raw,{maxDepth=12,maxNodes=1800}={}){
 const found=[];const queue=[{obj:raw,depth:0}];const seen=new Set();
 while(queue.length&&found.length<maxNodes){
  const {obj,depth}=queue.shift();
  if(depth>maxDepth||obj===null||obj===undefined)continue;
  if(typeof obj==='string'){
   if(obj.length<=524288&&/^\s*[\[{]/.test(obj)){
    try{queue.push({obj:JSON.parse(obj),depth:depth+1})}catch{}
   }
   continue;
  }
  if(typeof obj!=='object'||seen.has(obj))continue;
  seen.add(obj);found.push(obj);
  if(Array.isArray(obj)){
   for(const item of obj.slice(0,2000))queue.push({obj:item,depth:depth+1});
  }else{
   for(const key of knownKeys){
    if(Object.hasOwn(obj,key))queue.push({obj:obj[key],depth:depth+1});
   }
  }
 }
 return found;
}
const pick=x=>typeof x==='string'?x:'';
const processId=x=>{
 for(const v of [x.pid,x.processId,x.processID,x.process_id,
   x.ownerPid,x.ownerPID,x.kCGWindowOwnerPID]){
  if(Number.isSafeInteger(v)&&v>0)return v;
  if(typeof v==='string'&&/^[1-9][0-9]{0,9}$/.test(v))
   return Number(v);
 }
 return null;
};
const windowTitle=x=>[x.title,x.windowTitle,x.windowName,x.window_name,
 x.name,x.kCGWindowName].some(t=>t===TITLE);
const windowRef=x=>pick(x.windowRef)||pick(x.ref)||pick(x.window_ref);
const fixtureWindowRows=raw=>walkNativePayload(raw)
 .filter(x=>plainObj(x)&&!Array.isArray(x));
export function fixtureWindowEvidence(raw,pid){
 const rows=fixtureWindowRows(raw);
 const titled=rows.filter(windowTitle);
 const owned=rows.filter(x=>processId(x)===pid);
 const joint=titled.filter(x=>processId(x)===pid);
 // Only synthetic target predicates. Do not return other app or window
 // inventories, raw text, opaque refs, identifiers or counts.
 const nodeTexts=rows.flatMap(x=>Array.isArray(x.content)?
   x.content.filter(c=>plainObj(c)&&typeof c.text==='string')
    .map(c=>c.text):[]);
 return Object.freeze({
  fixtureExactTitleSeen:titled.length>0,
  fixtureProcessIdSeen:owned.length>0,
  fixtureTitleAndPidSameRecord:joint.length>0,
  fixtureWindowRefSeen:joint.some(x=>safeRef(windowRef(x))),
  fixtureMentionedInTransportText:nodeTexts.some(x=>x.includes(TITLE)),
  textContentEnvelopePresent:nodeTexts.length>0,
  nativeEnvelopeRefused:rows.some(x=>x.ok===false&&
   (plainObj(x.error)||plainObj(x.details)||typeof x.reason==='string'))
 });
}
export function findExactFixtureWindow(raw,pid){
 const objects=fixtureWindowRows(raw);
 // Native window reference is never accepted on title alone.
 // Only the just-launched fixture PID and exact synthetic title together
 // may authorize the next read-only action.
 const hits=objects.filter(x=>processId(x)===pid&&windowTitle(x));
 const candidates=hits.filter(x=>safeRef(windowRef(x)));
 if(hits.length!==1||candidates.length!==1)
  return {state:'inconclusive',reason:hits.length===0?
   'fixture_window_not_found':hits.length>1?'ambiguous_fixture_window':'window_reference_missing',
   matchedWindowCount:hits.length};
 return {state:'matched',windowRef:windowRef(candidates[0]),
   matchedWindowCount:1};
}
export function findFixtureElement(raw){
 const objects=walkNativePayload(raw);
 const observations=objects.filter(x=>plainObj(x)&&safeRef(x.observationId));
 const obs=[...new Set(observations.map(x=>x.observationId))];
 const hits=objects.filter(x=>plainObj(x)&&
  [x.label,x.accessibilityLabel,x.name,x.title].includes(FIELD)&&
  (safeRef(x.elementRef)||safeRef(x.ref)));
 if(hits.length!==1||obs.length!==1)
  return {state:'inconclusive',
   reason:hits.length===0?'fixture_element_not_found':
    hits.length!==1?'ambiguous_fixture_element':'observation_reference_missing',
   matchedElementCount:hits.length,observationCount:obs.length};
 return {state:'matched',elementRef:pick(hits[0].elementRef)||pick(hits[0].ref),
  observationId:obs[0],
  valueMatchesInitial:hits[0].value===START||hits[0].stringValue===START};
}
async function nativeCli(args,ms){
 const {stdout}=await exec(CLI,args,{cwd:RUNTIME,timeout:ms,maxBuffer:1024*1024,shell:false});
 if(stdout.length>1024*1024)throw Error('oversize');
 return JSON.parse(stdout);
}
export function makeReadOnlyNativeArgs(nodeId,executionId,action,params={}){
 if(!safeRef(nodeId)||!safeRef(executionId)||
    !['list_windows','get_window_state'].includes(action))throw Error('unsafe_native_read');
 const payload={action,executionId};
 if(action==='get_window_state'){
  if(!safeRef(params.windowRef))throw Error('window_ref_required');
  payload.windowRef=params.windowRef;
  payload.includeScreenshot=false;
 }
 return ['nodes','invoke','--node',nodeId,'--command','computer.act',
  '--params',JSON.stringify(payload),'--json'];
}
// A completed first computer.act read may already own a persistent lease.
// A later action refusal must never suppress closing that same own UUID.
export function shouldCloseOwnFixtureExecution({nativeReadAttempted,
 firstReadReturned,preAdmissionRejected}){
 return nativeReadAttempted===true&&
  (firstReadReturned===true||preAdmissionRejected!==true);
}
export async function nativeCUAFixtureObserve({run=nativeCli,
 launch=(bin)=>spawn(bin,[],{stdio:'ignore',windowsHide:true}),
 uuid=randomUUID,wait=pause}={}){
 const base={audit:AUDIT,schemaVersion:1,
  browserAccess:false,chatContentRead:false,changedBrowser:false,
  performedPointerOrKeyboardInput:false,performedComputerInput:false,
  screenshotTaken:false,launchedFixture:false};
 let child=null,phase='preflight',launched=false;
 let before=null,after=null,unchanged=null;
 let nativeReadAttempted=false,preAdmissionRejected=false;
 let firstReadReturned=false;
 let leasedExecutionId=null,leasedNodeId=null;
 let returnRef=null;
 const finish=report=>{returnRef=report;return report;};
 try{
  if(process.platform!=='darwin'||ROOT!==RUNTIME||await realpath(RUNTIME)!==RUNTIME)
   return {...base,state:'blocked',reason:'private_runtime_required'};
  const code=await readFile(join(ROOT,'fixtures','cua-noninterference','Fixture.swift'),'utf8');
  const fingerprint=createHash('sha256').update(code).digest('hex').slice(0,16);
  const dir=join(FIXTURES,'cua-fixture-'+fingerprint);
  const appdir=join(dir,APP);
  const binary=join(appdir,'Contents','MacOS','ioant-cua-fixture');
  const bundle=join(appdir,'Contents','Info.plist');
  for(const p of [FIXTURES,dir,appdir,join(appdir,'Contents'),join(appdir,'Contents','MacOS')]){
   const st=await lstat(p);
   if(!st.isDirectory()||st.isSymbolicLink())throw Error('unsafe_fixture_directory');
  }
  const [exe,plist]=await Promise.all([lstat(binary),readFile(bundle,'utf8')]);
  if(!exe.isFile()||exe.isSymbolicLink()||(exe.mode&0o111)===0||
     !plist.includes('ai.ioant.cua.noninterference.fixture'))
   return {...base,state:'blocked',reason:'fixture_binary_not_verified'};
  phase='native_provider_preflight';
  const doc=await run(['nodes','status','--json'],18000);
  const chosen=chooseConnectedMacNode(doc);
  const node=(doc.result??doc).nodes.find(x=>x&&(x.nodeId===chosen.id||x.id===chosen.id));
  const caps=node?.computerUse;
  if(!chosen.computerActAdvertised||caps?.contractVersion!==2||
     caps?.provider?.id!=='cua-computer'||
     typeof caps.provider.generation!=='string'||!caps.provider.generation||
     !Array.isArray(caps.actions)||
     !['list_windows','get_window_state'].every(a=>caps.actions.includes(a))||
     !Array.isArray(caps.deliveryModes)||!caps.deliveryModes.includes('background'))
   return {...base,state:'blocked',reason:'verified_cua_window_capabilities_required'};
  const generation=caps.provider.generation;
  phase='baseline_read';
  const state=async()=>JSON.parse((await exec(binary,['--state'],{
   timeout:8000,maxBuffer:4096,shell:false})).stdout);
  before=await state();
  if(typeof before.frontmost!=='string'||
     !Number.isFinite(before.mouseX)||!Number.isFinite(before.mouseY))
   return {...base,state:'inconclusive',reason:'baseline_unavailable'};
  phase='fixture_launch';
  child=launch(binary);
  if(!child||!Number.isInteger(child.pid)||child.pid<1)
   return {...base,state:'inconclusive',reason:'fixture_launch_failed'};
  launched=true;
  await wait(1200);
  if(child.exitCode!==null)
   return {...base,launchedFixture:true,state:'inconclusive',reason:'fixture_exited_early'};
  after=await state();
  unchanged=after.frontmost===before.frontmost&&
    after.mouseX===before.mouseX&&after.mouseY===before.mouseY;
  if(!unchanged)return {...base,launchedFixture:true,state:'blocked',
   reason:'foreground_or_pointer_changed_on_launch',
   focusAndPointerUnchanged:false};
  const executionId=uuid();
  leasedExecutionId=executionId;
  leasedNodeId=chosen.id;
  phase='window_list';
  nativeReadAttempted=true;
  const windows=await run(makeReadOnlyNativeArgs(chosen.id,executionId,'list_windows'),25000);
  firstReadReturned=true;
  const match=findExactFixtureWindow(windows,child.pid);
  if(match.state!=='matched')return finish({...base,launchedFixture:true,
   state:'inconclusive',phase:'window_list',
   reason:match.reason,matchedWindowCount:match.matchedWindowCount,
   fixtureEvidence:fixtureWindowEvidence(windows,child.pid)});
  phase='window_state';
  const windowState=await run(makeReadOnlyNativeArgs(chosen.id,executionId,
   'get_window_state',{windowRef:match.windowRef}),25000);
  const element=findFixtureElement(windowState);
  // Never emit raw observations or opaque native references.
  if(element.state!=='matched')return finish({...base,launchedFixture:true,
   state:'inconclusive',phase:'window_state',reason:element.reason,
   matchedElementCount:element.matchedElementCount});
  const refresh=await run(['nodes','status','--json'],18000);
  const current=chooseConnectedMacNode(refresh);
  const node2=(refresh.result??refresh).nodes.find(x=>x&&(x.nodeId===current.id||x.id===current.id));
  const fresh=current.id===chosen.id&&node2?.computerUse?.provider?.generation===generation;
  after=await state();
  unchanged=after.frontmost===before.frontmost&&after.mouseX===before.mouseX&&
    after.mouseY===before.mouseY;
  return finish({...base,launchedFixture:true,state:unchanged&&fresh&&element.valueMatchesInitial?
   'observed':'inconclusive',
   reason:!fresh?'provider_generation_changed':
    !unchanged?'foreground_or_pointer_changed':
    !element.valueMatchesInitial?'initial_field_value_not_confirmed':
    'fixture_background_observation_passed',
   providerGenerationStable:fresh,focusAndPointerUnchanged:unchanged,
   fixtureWindowMatched:true,fixtureElementMatched:true,
   currentObservationVerified:true,mutatingActionAttempted:false});
 }catch(error){
  const failed=classifyNativeFailure(error);
  preAdmissionRejected=[
   'computer_execution_occupied','unsupported_action','control_disabled',
   'permission_or_policy_denied','node_unavailable'
  ].includes(failed.errorClass);
  return finish({...base,launchedFixture:launched,state:'inconclusive',
   phase:['native_provider_preflight','baseline_read','fixture_launch','window_list','window_state'].includes(phase)?phase:'preflight',
   reason:phase==='window_list'||phase==='window_state'?
    'native_read_refused_or_unavailable':'native_fixture_preflight_failed',
   ...(phase==='window_list'||phase==='window_state'?
     {nativeFailure:failed}:{})});
 }finally{
  // A read-only native computer.act still acquires a persistent execution.
  // Release only the UUID issued within this invocation, never an unknown
  // pre-existing owner. Acknowledgement is not proof of effective release.
  if(shouldCloseOwnFixtureExecution({nativeReadAttempted,
      firstReadReturned,preAdmissionRejected})&&
     leasedNodeId&&leasedExecutionId){
   const release={attempted:true,acknowledged:false,
    ownerReleaseVerified:false};
   try{
    const receipt=await run(
     scopedCloseRequest(leasedNodeId,leasedExecutionId),15000);
    release.acknowledged=receipt?.ok===true||receipt?.result?.ok===true;
   }catch{}
   if(returnRef){
    returnRef.ownExecutionClosure=release;
    returnRef.existingComputerOwnerReleased=false;
    if(!release.acknowledged&&returnRef.state==='observed'){
     returnRef.state='inconclusive';
     returnRef.reason='own_execution_close_not_acknowledged';
    }
   }
  }
  // Kill only the child launched and still owned by this script, not any
  // other application/PID. Fixture itself has a 120-second auto-quit.
  if(child&&child.exitCode===null&&child.pid)child.kill('SIGTERM');
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=process.argv.length===2?await nativeCUAFixtureObserve():
  {audit:AUDIT,state:'blocked',reason:'unsupported_arguments'};
 console.log(JSON.stringify(report));
 if(report.state!=='observed')process.exitCode=1;
}
