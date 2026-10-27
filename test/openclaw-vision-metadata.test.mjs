import test from 'node:test';
import assert from 'node:assert/strict';
import {planVisionPatch,verifyVisionPatch,patchGemmaVision} from '../stage2/openclaw-vision-metadata.mjs';
const hash='W/"revision-opaque-2026:abc123xyz"';
const original=()=>({gateway:{bind:'loopback'},agents:{
  entries:{main:{model:{primary:'ollama/gemma4:26b-a4b'}},
    'alice-ai':{model:'ollama/gemma4:26b-a4b',tools:{deny:['*']}}},
  defaults:{thinkingDefault:'high'}},
 models:{providers:{ollama:{api:'ollama',baseUrl:'http://127.0.0.1:11435',
  models:[
   {id:'gemma4:26b-a4b',name:'gemma4:26b-a4b',input:['text'],contextTokens:32768},
   {id:'gpt-oss:20b',name:'gpt-oss:20b',input:['text']},
   {id:'qwen3.6:27b-coding',input:['text']},
   {id:'gemma4:31b-mlx',input:['text','image'],params:{keep_alive:'0s'}},
   {id:'nemotron-3-nano:30b-mlx',input:['text']}],
  apiKey:'dont-emit'}}}});
const envelope=c=>({payload:{hash,valid:true,exists:true,
  sourceConfig:c,config:c,parsed:c,resolved:c}});
test('only fixed Gemma image metadata in provider inventory changes',()=>{
 const before=original(),plan=planVisionPatch(before,envelope(before));
 assert.equal(plan.state,'ready');assert.equal(plan.hash,hash);
 const delta=plan.patch;
 assert.deepEqual(Object.keys(delta),['models']);
 assert.deepEqual(Object.keys(delta.models.providers),['ollama']);
 assert.deepEqual(Object.keys(delta.models.providers.ollama),['models']);
 const after=structuredClone(before);
 after.models.providers.ollama.models[0].input=['text','image'];
 assert.deepEqual(delta.models.providers.ollama.models,after.models.providers.ollama.models);
 assert.equal(verifyVisionPatch(before,after),true);
 assert.equal(verifyVisionPatch(before,original()),false);
 assert.equal(JSON.stringify(delta).includes('dont-emit'),false);
 assert.deepEqual(before.agents.entries['alice-ai'].tools,{deny:['*']});
});
test('already image configured is no-op, no modification',()=>{
 const before=original();before.models.providers.ollama.models[0].input=['text','image'];
 const plan=planVisionPatch(before,envelope(before));
 assert.deepEqual(plan,{state:'already_configured',hash});
});
test('inventory mismatch, stale revision and unsafe endpoint block',()=>{
 const before=original(),remote=original();
 remote.models.providers.ollama.models.pop();
 assert.throws(()=>planVisionPatch(before,envelope(remote)),/snapshot_or_inventory_conflict/);
 assert.throws(()=>planVisionPatch(before,{hash:'bad hash',config:before}),/revision_unavailable/);
 const tampered=original();tampered.models.providers.ollama.baseUrl='http://public.example';
 assert.throws(()=>planVisionPatch(tampered,envelope(tampered)),/provider_mismatch/);
 const dup=original();dup.models.providers.ollama.models[1].id='gemma4:26b-a4b';
 assert.throws(()=>planVisionPatch(dup,envelope(dup)),/model_inventory_mismatch/);
});
function harness({failure=null,dryRunOk=true}={}){
 const files=[],calls=[],before=original();let current=structuredClone(before);
 const read=async()=>({raw:Buffer.from('private-config-token'),parsed:structuredClone(current)});
 const rpc=async(method,params)=>{
  calls.push({method,params});
  if(method==='config.get')return envelope(current);
  if(method==='config.patch'){
   if(failure)throw Error('Connection lost: token=SECRET');
   const patch=JSON.parse(params.raw);
   const proposed=structuredClone(current);
   proposed.models.providers.ollama.models=patch.models.providers.ollama.models;
   current=proposed;
   return {changedPaths:['models.providers.ollama.models']};
  }
  throw Error('unapproved_rpc_method');
 };
 return {read,rpc,files,calls,backup:async bytes=>{files.push(bytes);return true},
  validate:async()=>dryRunOk,before, getCurrent:()=>current};
}
test('one revision-pinned patch after dry run and private backup with safe output',async()=>{
 const h=harness();let order=[];
 const r=await patchGemmaVision({...h,
  validate:async patch=>{order.push('dryrun');return !!patch.models},
  backup:async bytes=>{order.push('backup');h.files.push(bytes)}});
 assert.equal(r.state,'applied');assert.equal(r.backup,true);assert.equal(r.verified,true);
 assert.deepEqual(order,['dryrun','backup']);
 assert.equal(h.files.length,1);
 assert.equal(h.calls.filter(x=>x.method==='config.patch').length,1);
 const p=h.calls.find(x=>x.method==='config.patch').params;
 assert.deepEqual(Object.keys(p),['raw','baseHash','note']);
 assert.equal(p.baseHash,hash);
 assert.equal(verifyVisionPatch(h.before,h.getCurrent()),true);
 assert.equal(JSON.stringify(r).includes('SECRET'),false);
});
test('ambiguous gateway receipt never retries and returns bounded status',async()=>{
 const h=harness({failure:true});
 const r=await patchGemmaVision(h);
 assert.equal(r.state,'inconclusive');
 assert.equal(r.backup,true);
 assert.equal(h.calls.filter(x=>x.method==='config.patch').length,1);
 assert.doesNotMatch(JSON.stringify(r),/SECRET|private-config-token/);
});
test('failed dry run or mismatched provider leads to zero backup and zero patch',async()=>{
 const h=harness({dryRunOk:false});
 const r=await patchGemmaVision(h);
 assert.equal(r.state,'blocked');assert.equal(r.note,'schema_dryrun_failed');
 assert.equal(h.calls.filter(x=>x.method==='config.patch').length,0);
 assert.equal(h.files.length,0);
 const other=harness();
 const rpc=other.rpc;
 other.rpc=async(method,params)=>{
  if(method==='config.get')return {hash:'invalid hash',sourceConfig:other.before};
  return rpc(method,params);
 };
 const blocked=await patchGemmaVision(other);
 assert.equal(blocked.state,'blocked');assert.equal(other.files.length,0);
});
