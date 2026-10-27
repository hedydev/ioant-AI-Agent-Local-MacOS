import test from 'node:test';
import assert from 'node:assert/strict';
import {planMainContextPatch,verifyMainContextPatch,patchMainContext}
 from '../stage2/openclaw-main-context-injection.mjs';
const hash='W/"opaque-main-context-revision-2026"';
const base=()=>({agents:{defaults:{thinkingDefault:'high'},entries:{
 main:{model:{primary:'ollama/gemma4:26b-a4b'}},
 'alice-ai':{model:'ollama/gemma4:26b-a4b',tools:{deny:['*']}},
 'openclaw-dev':{model:'ollama/gemma4:26b-a4b'},
 'mac-computer':{model:'ollama/gemma4:26b-a4b'}}},
 gateway:{bind:'loopback'},models:{providers:{ollama:{apiKey:'PRIVATE_TEST_TOKEN'}}}});
const snap=x=>({payload:{valid:true,exists:true,hash,
 sourceConfig:structuredClone(x),parsed:structuredClone(x),
 config:structuredClone(x),resolved:structuredClone(x)}});
test('narrow, main-only patch and strict before/after comparison',()=>{
 const b=base(),p=planMainContextPatch(b,snap(b));
 assert.equal(p.state,'ready');assert.equal(p.hash,hash);
 assert.deepEqual(p.patch,{agents:{entries:{main:{contextInjection:'continuation-skip'}}}});
 const expected=structuredClone(b);expected.agents.entries.main.contextInjection='continuation-skip';
 assert.equal(verifyMainContextPatch(b,expected),true);
 assert.equal(verifyMainContextPatch(b,b),false);
 expected.agents.entries['alice-ai'].tools.deny=[];
 assert.equal(verifyMainContextPatch(b,expected),false);
 assert.doesNotMatch(JSON.stringify(p.patch),/PRIVATE_TEST_TOKEN/);
});
test('already configured, no write',()=>{
 const b=base();b.agents.entries.main.contextInjection='continuation-skip';
 assert.deepEqual(planMainContextPatch(b,snap(b)),{state:'already_configured',hash});
});
test('explicit always or never are not overridden',()=>{
 for(const mode of ['always','never']){
  const b=base();b.agents.entries.main.contextInjection=mode;
  assert.throws(()=>planMainContextPatch(b,snap(b)),/explicit_mode_requires_review/);
 }
});
test('snapshot disagreements and invalid revisions block',()=>{
 const b=base(),x=snap(b);x.payload.parsed.agents.entries.main.contextInjection='never';
 assert.throws(()=>planMainContextPatch(b,x),/snapshot_conflict/);
 const y=snap(b);y.payload.config.agents.entries.main.contextInjection='never';
 assert.throws(()=>planMainContextPatch(b,y),/snapshot_conflict/);
 const z=snap(b);delete z.payload.sourceConfig;
 assert.throws(()=>planMainContextPatch(b,z),/snapshot_unavailable/);
 const w=snap(b);w.payload.hash='bad hash';
 assert.throws(()=>planMainContextPatch(b,w),/revision_unavailable/);
});
function harness({failPatch=false,dryRun=true,mutateOther=false}={}){
 const before=base();let current=structuredClone(before);
 const calls=[],steps=[];
 const read=async()=>({raw:Buffer.from('PRIVATE'),parsed:structuredClone(current)});
 const rpc=async(m,p)=>{
  calls.push({m,p});
  if(m==='config.get')return snap(current);
  if(m==='config.patch'){
   if(failPatch)throw Error('Bearer PRIVATE_TEST_TOKEN transport down');
   current.agents.entries.main.contextInjection=JSON.parse(p.raw).agents.entries.main.contextInjection;
   if(mutateOther)current.agents.entries['alice-ai'].tools.deny=[];
   return {changedPaths:['agents.entries.main.contextInjection']};
  }
  throw Error('unknown_rpc');
 };
 return {before,rpc,read,calls,steps,
  validate:async()=>{steps.push('validate');return dryRun},
  save:async()=>{steps.push('backup')},now:()=>current};
}
test('one guarded patch with backup first; other Agents unchanged',async()=>{
 const h=harness(),out=await patchMainContext(h);
 assert.deepEqual(out,{audit:'IOANT_MAIN_CONTEXT_INJECTION_PATCH',
  schemaVersion:1,state:'applied',note:'main_continuation_skip_enabled',backup:true,verified:true});
 assert.deepEqual(h.steps,['validate','backup']);
 assert.equal(h.calls.filter(x=>x.m==='config.patch').length,1);
 assert.equal(h.calls.find(x=>x.m==='config.patch').p.baseHash,hash);
 assert.equal(verifyMainContextPatch(h.before,h.now()),true);
 assert.deepEqual(h.before.agents.entries['alice-ai'],h.now().agents.entries['alice-ai']);
 assert.doesNotMatch(JSON.stringify(out),/PRIVATE_TEST_TOKEN/);
});
test('dry-run failure forbids patch and backup',async()=>{
 const h=harness({dryRun:false});
 const out=await patchMainContext(h);
 assert.equal(out.state,'blocked');assert.deepEqual(h.steps,['validate']);
 assert.equal(h.calls.filter(x=>x.m==='config.patch').length,0);
});
test('lost receipt is inconclusive, never retried automatically',async()=>{
 const h=harness({failPatch:true}),out=await patchMainContext(h);
 assert.equal(out.state,'inconclusive');assert.equal(out.backup,true);
 assert.equal(h.calls.filter(x=>x.m==='config.patch').length,1);
 assert.doesNotMatch(JSON.stringify(out),/PRIVATE_TEST_TOKEN/);
});
test('unexpected AliceAI mutation fails strict readback',async()=>{
 const h=harness({mutateOther:true}),out=await patchMainContext(h);
 assert.equal(out.state,'inconclusive');
 assert.equal(out.note,'disk_readback_mismatch');
});
