import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {actionFromJson} from '../stage2/protocol.mjs';
import {verifyFailedPrewriteReport,verifyFailedPrewriteEvents,
 canReconcilePrewrite,reconcilePrewrite} from '../stage2/openclaw-dev-prewrite-reconcile.mjs';

const ID='openclaw-dev-create-20261025-064';
const stamp='2026-10-25T08:00:00.000Z';
const rec=(name,other={})=>({source:'ioant-loop',at:stamp,event:name,...other});
const failure={audit:'IOANT_OPENCLAW_DEV_CREATE',schemaVersion:1,state:'blocked',
 backup:false,workspace:false,note:'unsafe_backup_cache'};
const fence=String.fromCharCode(96).repeat(3);
const report=()=>[
 '# ChatGPT local task — '+ID,'','- Action: openclaw-dev-create',
 '- Status: failed','- Exit code: n/a','- Time: '+stamp,'',
 '## Bounded output','',fence+'text',JSON.stringify(failure),fence,''
].join('\n');
const rows=()=>[
 rec('launcher_start'),rec('worker_start'),
 rec('task_seen',{taskId:ID,action:'openclaw-dev-create'}),
 rec('action_started',{taskId:ID,action:'openclaw-dev-create'}),
 rec('openclaw_dev_create_claimed',{taskId:ID}),
 rec('action_finished',{taskId:ID,action:'openclaw-dev-create',status:'failed'}),
 rec('report_saved',{taskId:ID}),
 rec('feedback_pending',{taskId:ID}),
 rec('feedback_confirmed',{taskId:ID,status:'failed'})
];
const state=()=>({lastTaskId:ID,feedbackPending:null,
 devAgentCreationAttempted:{id:ID,at:stamp},
 devAgentCreationRecovery:{id:'openclaw-dev-create-20261025-062'}});
const ready=()=>({audit:'IOANT_OPENCLAW_DEV_PREFLIGHT',schemaVersion:1,
 readOnly:true,configWrite:false,state:'ready',writeApproved:false});
const url='https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/6add3565-d868-83ec-804e-1e7a00eb0a59';
const cache='/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos';

test('fixed 064 report and completed diagnostic sequence prove blocked before side effects',()=>{
 assert.equal(verifyFailedPrewriteReport(report()),true);
 assert.equal(verifyFailedPrewriteEvents(rows()),true);
 assert.equal(canReconcilePrewrite(state(),ready(),report(),rows()),true);
});
test('wrong or uncertain report and any ambiguous task timeline remain blocked',()=>{
 const data=report();
 for(const altered of [
  data.replace('"backup":false','"backup":true'),
  data.replace('"workspace":false','"workspace":true'),
  data.replace('unsafe_backup_cache','patch_rpc_invalid_params'),
  data.replace('- Status: failed','- Status: passed'),
  data.replace(ID,'openclaw-dev-create-20261025-065'),
  data.replace(fence+'text','not a structured result')
 ])assert.equal(verifyFailedPrewriteReport(altered),false);
 const events=rows();
 for(const change of [
  a=>a.splice(4,1),a=>a.splice(5,1),
  a=>a[5].status='passed',
  a=>a[8].status='unknown',
  a=>a[3].action='different',
  a=>a.push(rec('action_finished',{taskId:ID,status:'passed'}))
 ]){const copy=structuredClone(events);change(copy);
  assert.equal(verifyFailedPrewriteEvents(copy),false);}
});
test('exact handled ID, matching claim, and fresh read-only ready status mandatory',()=>{
 for(const change of [
  x=>{x.lastTaskId='older'},
  x=>{x.feedbackPending={id:ID}},
  x=>{x.devAgentCreationAttempted.id='different'},
  x=>{x.devAgentCreationRecovery064={id:ID}},
  x=>{delete x.devAgentCreationAttempted}
 ]){const v=state();change(v);
  assert.equal(canReconcilePrewrite(v,ready(),report(),rows()),false);}
 for(const change of [
  x=>{x.state='blocked'},x=>{x.writeApproved=true},
  x=>{x.readOnly=false},x=>{x.configWrite=true},
  x=>{delete x.writeApproved}
 ]){const v=ready();change(v);
  assert.equal(canReconcilePrewrite(state(),v,report(),rows()),false);}
});
test('reconciliation prepares a new state only after private proof checks',async()=>{
 const log='run-20261025T000000Z-123-abcdef12.jsonl';
 const file='2026-10-25T00-00-00-000Z-'+ID+'.md';
 let preflights=0;
 const checked=[];
 const input={
  url,cache,checkDir:async path=>{checked.push(path)},
  list:async path=>path.endsWith('/chatgpt-loop')&&
   path.includes('/logs/')?[log]:[file],
  read:async path=>path.endsWith('.md')?report():rows().map(x=>JSON.stringify(x)).join('\n'),
  preflight:async()=>{preflights++;return ready();}
 };
 const before=state();
 const out=await reconcilePrewrite(before,input);
 assert.equal(out.ok,true);
 assert.equal(out.reason,'prior_prewrite_failure_reconciled');
 assert.equal(preflights,1);
 assert.equal(checked.length,2);
 assert.equal(out.state.lastTaskId,ID);
 assert.equal(out.state.devAgentCreationAttempted,undefined);
 assert.equal(out.state.devAgentCreationRecovery064.id,ID);
 assert.deepEqual(before,state());
 const again=await reconcilePrewrite(out.state,input);
 assert.equal(again.ok,false);
 assert.equal(again.reason,'claim_not_exact');
});
test('this limited recovery cannot accept a different URL or scan unbounded evidence',async()=>{
 const input={url,cache,list:async()=>[],checkDir:async()=>{},
  preflight:async()=>ready(),read:async()=>report()};
 assert.equal((await reconcilePrewrite(state(),{...input,url:'https://example.com'})).reason,
  'unsafe_environment');
 assert.equal((await reconcilePrewrite(state(),input)).reason,'report_missing_or_ambiguous');
});
test('watcher routes recovery separately, gated by local create opt-in',()=>{
 const source=readFileSync(resolve(import.meta.dirname,'../stage2/chatgpt-loop.mjs'),'utf8');
 assert.match(source,/task\.action==='openclaw-dev-prewrite-reconcile' && opts\.enableOpenClawDevCreate/);
 assert.match(source,/const recovery=await reconcilePrewrite\(state,\{url:opts\.url\}\)/);
 assert.match(source,/await atomicState\(stateFile,recovery\.state\)/);
 const parsed=actionFromJson(JSON.stringify({protocol:'ioant-mac-ops-v1',
  action:'openclaw-dev-prewrite-reconcile',id:'dev-064-reconcile-001'}));
 assert.equal(parsed.known,true);assert.equal(parsed.authorized,false);
 assert.throws(()=>actionFromJson(JSON.stringify({protocol:'ioant-mac-ops-v1',
  action:'openclaw-dev-prewrite-reconcile',id:'dev-064-reconcile-001',force:true})),/Malformed/);
});
