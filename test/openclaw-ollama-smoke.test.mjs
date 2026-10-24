import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyCatalog,gatewayCatalog,residentModels,classifyInferenceResponse,inferOne,runSmoke}
 from '../stage2/openclaw-ollama-smoke.mjs';
import {actionFromJson} from '../stage2/protocol.mjs';
import {actionPlan,runAction} from '../stage2/runner.mjs';

const MODELS=['gemma4:26b-a4b','gpt-oss:20b'];
const READY={config:'regular_private',provider:'target',agents:'absent',ollama:'reachable',installed:MODELS};
const BOTH={status:'observed',models:MODELS.map(name=>({model:name,status:'listed',available:'yes',local:'yes'}))};
function resp(doc,status=200){
 const json=JSON.stringify(doc);
 const bytes=new TextEncoder().encode(json);
 return {ok:status===200,status,headers:{get:()=>String(bytes.length)},
  body:new ReadableStream({start(c){c.enqueue(bytes);c.close();}})};
}

test('non-mutating model smoke is exact allowlisted action without untrusted argv',async()=>{
 const params={protocol:'ioant-mac-ops-v1',id:'ollama-smoke-0001',action:'openclaw-ollama-smoke'};
 const t=actionFromJson(JSON.stringify(params));
 assert.equal(t.authorized,true);
 assert.deepEqual(actionPlan(t.action,'/repo').args,['stage2/openclaw-ollama-smoke.mjs']);
 assert.throws(()=>actionFromJson(JSON.stringify({...params,model:'remote/provider'})),/Malformed/);
 assert.equal((await runAction('ollama-freeform', '/repo')).status,'approval_required');
});

test('Gateway catalog preserves only pinned model identities, availability and local flags',()=>{
 const data={models:[
  {provider:'ollama',id:'gemma4:26b-a4b',available:true,local:true,apiKey:'VERY_PRIVATE'},
  {provider:'ollama',id:'gpt-oss:20b',available:null,local:true,notes:'SECRET'},
  {provider:'private-provider',id:'secret-model',available:true,url:'https://PRIVATE.example'}
 ]};
 const r=classifyCatalog({payload:data});
 assert.equal(r.status,'observed');
 assert.deepEqual(r.models,[{model:MODELS[0],status:'listed',available:'yes',local:'yes'},
  {model:MODELS[1],status:'listed',available:'unknown',local:'yes'}]);
 assert.doesNotMatch(JSON.stringify(r),/VERY_PRIVATE|SECRET|PRIVATE.example/);
 assert.equal(classifyCatalog('not json').status,'invalid_shape');
 assert.equal(classifyCatalog({models:'wrong'}).status,'invalid_shape');
});

test('Gateway model catalog sends a fixed direct read-only RPC without CLI cache fallback',async()=>{
 const calls=[];
 const c=await gatewayCatalog({rpc:async(method,params)=>{
  calls.push([method,params]);
  return {payload:{models:[{provider:'ollama',id:'gemma4:26b-a4b',available:true}]}};
 }});
 assert.equal(c.status,'observed');
 assert.equal(c.models[1].status,'not_listed');
 assert.deepEqual(calls,[['models.list',{view:'all',provider:'ollama',includeDetails:true}]]);
 const failed=await gatewayCatalog({rpc:async()=>{throw Error('Bearer PASSWORD_PRIVATE')}});
 assert.equal(failed.status,'unavailable');
 assert.doesNotMatch(JSON.stringify(failed),/PASSWORD_PRIVATE/);
});

test('idle resident-model guard never reports resident names or allows unknown state',async()=>{
 let url;
 const idle=await residentModels({request:async(u,opts)=>{
  url=u;assert.equal(opts.method,'GET');return resp({models:[]});
 }});
 assert.equal(idle,'idle');assert.equal(url,'http://127.0.0.1:11435/api/ps');
 const busy=await residentModels({request:async()=>resp({models:[{name:'PERSONAL_MODEL_SECRET'}]})});
 assert.equal(busy,'busy');
 const bad=await residentModels({request:async()=>resp({models:'PRIVATE'})});
 assert.equal(bad,'unknown');
});

test('local inference is pinned, sequential, bounded and never returns generated content',async()=>{
 const seen=[];
 const run=async(url,opts)=>{
  seen.push([url,opts]);
  assert.equal(url,'http://127.0.0.1:11435/api/chat');
  return resp({done:true,message:{content:'MY_SECRET_ANSWER_NEVER_LEAKS'}});
 };
 assert.equal(await inferOne(MODELS[0],{request:run}),'reply_received');
 assert.equal(await inferOne('remote-model',{request:run}),'not_allowlisted');
 assert.equal(seen.length,1);
 const req=JSON.parse(seen[0][1].body);
 assert.equal(req.model,MODELS[0]);
 assert.equal(req.stream,false);
 assert.equal(req.keep_alive,0);
 assert.deepEqual(req.messages,[{role:'user',content:'Reply with exactly OK.'}]);
 assert.ok(req.options.num_predict<=100);
 assert.equal(classifyInferenceResponse({done:false,message:{content:'OK'}}),'incomplete');
 assert.equal(classifyInferenceResponse({done:true,message:{content:''}}),'empty_reply');
});

test('smoke requires target provider, both models and no pre-existing Alice agent',async()=>{
 let called=0;
 for(const variant of [{provider:'absent'},{agents:'present'},{installed:['gpt-oss:20b']},
  {ollama:'unavailable'}]){
  const r=await runSmoke({preflight:async()=>({...READY,...variant}),
   catalog:async()=>{called++;return BOTH;}});
  assert.equal(r.status,'preflight_blocked');
 }
 assert.equal(called,0);
});

test('smoke compares Gateway catalog and skips inference when target is not published',async()=>{
 const r=await runSmoke({preflight:async()=>READY,catalog:async()=>({
  status:'observed',models:[{model:MODELS[0],status:'listed',available:'yes'},
   {model:MODELS[1],status:'not_listed'}]
 }),resident:async()=>{throw Error('should not touch model')}});
 assert.equal(r.status,'catalog_not_ready');
});

test('smoke processes both approved models, but skips busy ones and redacts any output',async()=>{
 const seen=[];
 let residentCall=0;
 const r=await runSmoke({preflight:async()=>READY,catalog:async()=>BOTH,
  resident:async()=>++residentCall===1?'idle':'busy',
  infer:async name=>{seen.push(name);return 'reply_received';}
 });
 assert.equal(r.status,'observed');
 assert.deepEqual(seen,[MODELS[0]]);
 assert.deepEqual(r.inference,[{model:MODELS[0],status:'reply_received'},
  {model:MODELS[1],status:'busy_skip'}]);
 assert.equal(r.configWrite,false);
 assert.equal(r.localInference,true);
 assert.doesNotMatch(JSON.stringify(r),/Bearer|apiKey|secret/);
});

test('malformed model replies, service failures and unrecognized states fail safely',async()=>{
 const r=await inferOne(MODELS[0],{request:async()=>resp({error:'PRIVATE_PASSWORD'},503)});
 assert.equal(r,'service_busy');
 const bad=await inferOne(MODELS[0],{request:async()=>resp({done:true,message:{content:''}})});
 assert.equal(bad,'empty_reply');
 const fail=await runSmoke({preflight:async()=>READY,catalog:async()=>BOTH,
  resident:async()=> 'idle',infer:async()=> 'PRIVATE_DATA'});
 assert.equal(fail.inference.length,2);
 assert.equal(fail.inference[0].status,'unclassified');
 assert.doesNotMatch(JSON.stringify(fail),/PRIVATE_DATA/);
});
