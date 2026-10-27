import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedJson,diagnose} from '../scripts/openclaw-mac-vision-http-preflight.mjs';

const json=(body,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{'content-type':'application/json'}
});
test('GET metadata and POST show are loopback only; no inference endpoint',async()=>{
  const hits=[];
  const request=async(url,options)=>{
    hits.push({url,method:options.method,body:options.body});
    return json(url.endsWith('/api/tags')?{models:[]}:{capabilities:['vision']});
  };
  assert.equal((await boundedJson('/api/tags',undefined,{request})).state,'ok');
  assert.equal((await boundedJson('/api/show',{model:'gemma4:26b-a4b'},{request})).state,'ok');
  assert.equal((await boundedJson('/api/chat',undefined,{request})).state,'invalid_request');
  assert.equal((await boundedJson('/api/show',{model:'untrusted'},{request})).state,'invalid_request');
  assert.equal(hits.length,2);
  assert.ok(hits.every(x=>x.url.startsWith('http://127.0.0.1:11435/')));
  assert.deepEqual(hits.map(x=>x.method),['GET','POST']);
});
test('non-2xx exposes only numeric HTTP status, not private error body',async()=>{
  const request=async()=>new Response('secret model failure text',{status:500});
  const out=await boundedJson('/api/tags',undefined,{request});
  assert.deepEqual(out,{state:'http_error',httpStatus:500});
  assert.equal(JSON.stringify(out).includes('secret'),false);
});
test('metadata diagnosis identifies which installed model can receive images',async()=>{
  const observed=[];
  const api=async(route,body)=>{
    observed.push([route,body?.model??null]);
    if(route==='/api/tags')return {state:'ok',data:{models:[
      {name:'gemma4:26b-a4b'},{name:'qwen3.8:27b-mlx'},{name:'unrelated'}]}};
    if(route==='/api/ps')return {state:'ok',data:{models:[]}};
    return {state:'ok',data:{capabilities:
      body.model==='qwen3.8:27b-mlx'?['vision','completion']:['completion']}};
  };
  const r=await diagnose({api});
  assert.equal(r.state,'observed');
  assert.equal(r.firstVisionModel,'qwen3.8:27b-mlx');
  assert.equal(r.residency.count,0);
  assert.equal(r.invokedInference,false);
  assert.equal(r.readScreenshot,false);
  assert.equal(r.installedModels.length,2);
  assert.deepEqual(observed.map(x=>x[0]),[
    '/api/tags','/api/ps','/api/show','/api/show']);
});
test('metadata failure remains inconclusive and never falls through to inference',async()=>{
  const api=async(route)=>route==='/api/tags'?
    {state:'http_error',httpStatus:503}:{state:'ok',data:{models:[]}};
  const r=await diagnose({api});
  assert.equal(r.state,'inconclusive');
  assert.equal(r.checks.tags.httpStatus,503);
  assert.deepEqual(r.models,[]);
  assert.equal(r.invokedInference,false);
});
test('model show 500 is reported per model without sending images',async()=>{
  const api=async(route)=>route==='/api/tags'?
    {state:'ok',data:{models:[{name:'gemma4:26b-a4b'}]}}:
    route==='/api/ps'?{state:'ok',data:{models:[]}}:
    {state:'http_error',httpStatus:500};
  const r=await diagnose({api});
  assert.equal(r.state,'inconclusive');
  assert.equal(r.installedModels[0].show.httpStatus,500);
  assert.equal(r.installedModels[0].vision,null);
});
