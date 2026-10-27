import test from 'node:test';
import assert from 'node:assert/strict';
import {planReasoningPatch,verifyReasoningPatch,patchGemmaReasoning}
 from '../stage2/openclaw-reasoning-metadata.mjs';
const hash='W/"opaque-snapshot-revision-2026"';
const base=()=>({agents:{defaults:{thinkingDefault:'high'},
 entries:{main:{model:{primary:'ollama/gemma4:26b-a4b'}},
 'alice-ai':{model:'ollama/gemma4:26b-a4b',tools:{deny:['*']}},
 'openclaw-dev':{model:'ollama/gemma4:26b-a4b'},
 'mac-computer':{model:'ollama/gemma4:26b-a4b'}}},
 gateway:{bind:'loopback'},
 models:{providers:{ollama:{api:'ollama',baseUrl:'http://127.0.0.1:11435',
 apiKey:'PRIVATE_KEY_DO_NOT_RETURN',
 models:[
 {id:'gemma4:26b-a4b',input:['text','image'],contextTokens:32768},
 {id:'gpt-oss:20b',input:['text']},
 {id:'qwen3.6:27b-coding',input:['text']},
 {id:'gemma4:31b-mlx',input:['text','image'],reasoning:true,params:{keep_alive:'0s'}},
 {id:'nemotron-3-nano:30b-mlx',input:['text']}]
 }}}});
const snapshot=doc=>{
 const cfg=structuredClone(doc);
 if(cfg.models.providers.ollama.models[0].reasoning===undefined)
  cfg.models.providers.ollama.models[0].reasoning=false;
 return {payload:{hash,valid:true,exists:true,
  sourceConfig:structuredClone(doc),parsed:structuredClone(doc),
  resolved:structuredClone(doc),config:cfg}};
};
test('raw missing reasoning and effective false are consistent; only Gemma gets true',()=>{
 const source=base(),p=planReasoningPatch(source,snapshot(source));
 assert.equal(p.state,'ready');assert.equal(p.hash,hash);
 assert.deepEqual(Object.keys(p.patch),['models']);
 assert.deepEqual(Object.keys(p.patch.models.providers.ollama),['models']);
 const before=structuredClone(source);
 before.models.providers.ollama.models[0].reasoning=true;
 assert.deepEqual(p.patch.models.providers.ollama.models,
  before.models.providers.ollama.models);
 assert.equal(verifyReasoningPatch(source,before),true);
 assert.equal(verifyReasoningPatch(source,source),false);
 assert.deepEqual(before.models.providers.ollama.models[0].input,['text','image']);
 assert.deepEqual(source.agents.entries['alice-ai'].tools,{deny:['*']});
 assert.doesNotMatch(JSON.stringify(p.patch),/PRIVATE_KEY_DO_NOT_RETURN/);
});
test('already true on disk and Gateway is no-op',()=>{
 const source=base();source.models.providers.ollama.models[0].reasoning=true;
 assert.deepEqual(planReasoningPatch(source,snapshot(source)),
  {state:'already_configured',hash});
});
test('explicit reasoning false, degraded vision, and thought override block',()=>{
 for(const mutate of [
  v=>{v.models.providers.ollama.models[0].reasoning=false;},
  v=>{v.models.providers.ollama.models[0].input=['text'];},
  v=>{v.models.providers.ollama.models[0].params={thinking:false};}
 ]){
  const source=base();mutate(source);
  assert.throws(()=>planReasoningPatch(source,snapshot(source)));
 }
});
test('stale hash, inconsistent root, changed model inventory and endpoint block',()=>{
 const before=base(),remote=base();
 remote.models.providers.ollama.models[2].id='different';
 assert.throws(()=>planReasoningPatch(before,snapshot(remote)),/model_inventory_mismatch/);
 const conflicted=snapshot(before);
 conflicted.payload.config.models.providers.ollama.models[0].reasoning=true;
 assert.throws(()=>planReasoningPatch(before,conflicted),/snapshot_reasoning_conflict/);
 assert.throws(()=>planReasoningPatch(before,{hash:'invalid hash',config:before}),/revision_unavailable/);
 const missing=snapshot(before);delete missing.payload.sourceConfig;
 assert.throws(()=>planReasoningPatch(before,missing),/snapshot_unavailable/);
 const remoteHost=base();remoteHost.models.providers.ollama.baseUrl='http://public.test';
 assert.throws(()=>planReasoningPatch(remoteHost,snapshot(remoteHost)),/provider_mismatch/);
});
function harness({failPatch=false,dryRun=true,readbackMismatch=false}={}){
 const before=base();let current=structuredClone(before);
 const events=[],calls=[];
 const read=async()=>({parsed:structuredClone(current),raw:Buffer.from('PRIVATE')});
 const rpc=async(name,params)=>{
  calls.push({name,params});
  if(name==='config.get')return snapshot(current);
  if(name==='config.patch'){
   if(failPatch)throw Error('Gateway disconnected with Bearer SECRET');
   current.models.providers.ollama.models=
    JSON.parse(params.raw).models.providers.ollama.models;
   if(readbackMismatch)current.agents.entries.main.tools={profile:'full'};
   return {changedPaths:['models.providers.ollama.models']};
  }
  throw Error('unrecognized_method');
 };
 return {read,rpc,calls,events,before,
  validate:async p=>{events.push('dryrun');return dryRun&&!!p.models},
  backup:async()=>{events.push('backup')},
  current:()=>current};
}
test('one guarded patch, backup first, readbacks, no Agent modification',async()=>{
 const h=harness();const result=await patchGemmaReasoning(h);
 assert.deepEqual(result,{audit:'IOANT_GEMMA_REASONING_PATCH',schemaVersion:1,
  state:'applied',note:'reasoning_enabled',backup:true,verified:true});
 assert.deepEqual(h.events,['dryrun','backup']);
 assert.equal(h.calls.filter(x=>x.name==='config.patch').length,1);
 const p=h.calls.find(x=>x.name==='config.patch').params;
 assert.deepEqual(Object.keys(p),['raw','baseHash','note']);
 assert.equal(p.baseHash,hash);
 assert.equal(verifyReasoningPatch(h.before,h.current()),true);
 assert.deepEqual(h.current().agents,h.before.agents);
 assert.doesNotMatch(JSON.stringify(result),/SECRET|PRIVATE/);
});
test('lost patch receipt is inconclusive and is never automatically retried',async()=>{
 const h=harness({failPatch:true});
 const out=await patchGemmaReasoning(h);
 assert.equal(out.state,'inconclusive');
 assert.equal(out.backup,true);
 assert.equal(h.calls.filter(x=>x.name==='config.patch').length,1);
 assert.doesNotMatch(JSON.stringify(out),/SECRET|PRIVATE/);
});
test('schema dry-run fail blocks before any write; extra config mutation fails strict readback',async()=>{
 const h=harness({dryRun:false});
 const result=await patchGemmaReasoning(h);
 assert.equal(result.state,'blocked');
 assert.deepEqual(h.events,['dryrun']);
 assert.equal(h.calls.filter(x=>x.name==='config.patch').length,0);
 const x=harness({readbackMismatch:true});
 assert.equal((await patchGemmaReasoning(x)).state,'inconclusive');
});
