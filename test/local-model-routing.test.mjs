import test from 'node:test';
import assert from 'node:assert/strict';
import {OLLAMA_URL,ROUTES,planModelRoute} from '../src/local-model-routing.mjs';
import {parseArgs,buildPlan} from '../scripts/local-model-plan.mjs';
const ids = Object.values(ROUTES).map(r=>r.model);
const provider = () => ({api:'ollama',baseUrl:OLLAMA_URL,models:ids.map(id=>({id}))});
const inputs = () => ({provider:provider(),installed:ids,resident:[]});
test('all four task types deterministically select fixed local models',()=>{
 const expected = {daily:'gemma4:26b-a4b',architecture:'gemma4:31b-mlx',coding:'qwen3.6:27b-coding',planning:'nemotron-3-nano:30b-mlx'};
 for(const [task,id] of Object.entries(expected)) {
   const res=planModelRoute(task,inputs());
   assert.equal(res.model,`ollama/${id}`);
   assert.equal(res.status,'ready_for_separate_operator_run');
   assert.equal(res.execution,'none');
   assert.equal(res.tools,'deny-all');
 }
});
test('unknown tasks and proto keys cannot select a model',()=>{
 for(const task of ['exec','other','__proto__','constructor','DAILY',null,undefined]) {
   const res=planModelRoute(task,inputs());
   assert.equal(res.status,'blocked');
   assert.equal(res.model,null);
 }
});
test('only native Ollama local endpoint is accepted',()=>{
 for(const baseUrl of ['http://127.0.0.1:11434','http://localhost:11435','https://127.0.0.1:11435','http://example.com',null])
   assert.equal(planModelRoute('coding',{...inputs(),provider:{...provider(),baseUrl}}).status,'blocked');
 assert.equal(planModelRoute('coding',{...inputs(),provider:{...provider(),api:'openai-completions'}}).status,'blocked');
});
test('missing, duplicated, or uninstalled selected model fail closed',()=>{
 const row=provider(); row.models = row.models.filter(x=>x.id!=='qwen3.6:27b-coding');
 assert.equal(planModelRoute('coding',{...inputs(),provider:row}).reason,'model_not_uniquely_registered');
 const duplicate=provider();duplicate.models.push({id:'qwen3.6:27b-coding'});
 assert.equal(planModelRoute('coding',{...inputs(),provider:duplicate}).reason,'model_not_uniquely_registered');
 assert.equal(planModelRoute('coding',{...inputs(),installed:[]}).reason,'model_not_installed');
});
test('unknown or nonempty resident state blocks before execution',()=>{
 assert.equal(planModelRoute('coding',{...inputs(),resident:null}).reason,'runtime_state_unverified');
 assert.equal(planModelRoute('coding',{...inputs(),resident:[{name:'gemma4:26b-a4b'}]}).reason,'resident_model_present');
 assert.equal(planModelRoute('coding',{...inputs(),resident:['broken']}).reason,'runtime_state_unverified');
});
test('no supplied config state is mutated or exposed in plan result',()=>{
 const providerWithSecret={...provider(),apiKey:'super_private_key'};
 const copy=structuredClone(providerWithSecret);
 const res=planModelRoute('coding',{provider:providerWithSecret,installed:ids,resident:[]});
 assert.deepEqual(providerWithSecret,copy);
 assert.doesNotMatch(JSON.stringify(res),/super_private_key/);
});
test('argument parser only accepts exact task type and no shell/user model IDs',()=>{
 assert.equal(parseArgs(['--task','coding']),'coding');
 for(const args of [[],['--task'],['--task','coding','--model','other'],['--task','other'],['--task','coding;id']])
   assert.throws(()=>parseArgs(args));
});
test('read-only adapter separates bounded inventory/status from live config',async()=>{
 let hits=0;
 const res=await buildPlan('architecture',{
   readProvider:async()=>{hits++;return provider();},
   readTags:async()=>{hits++;return {models:ids.map(name=>({name}))};},
   readPs:async()=>{hits++;return {models:[]};},
 });
 assert.equal(hits,3);
 assert.equal(res.model,'ollama/gemma4:31b-mlx');
 assert.equal(res.status,'ready_for_separate_operator_run');
});
test('malformed remote status cannot lead to a ready route',async()=>{
 const res=await buildPlan('planning',{
  readProvider:async()=>provider(),readTags:async()=>({models:null}),readPs:async()=>({models:[]}),
 });
 assert.equal(res.reason,'model_not_installed');
});
