import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyOllamaFailure,ollama} from '../scripts/openclaw-mac-vision-audit.mjs';

const errorResponse=(error,status=400)=>
 new Response(JSON.stringify({error}),{status,headers:{'content-type':'application/json'}});
test('local HTTP error classification never includes arbitrary Ollama error text',()=>{
 const x=classifyOllamaFailure('/api/chat',400,
  JSON.stringify({error:'format json not supported SECRET_123'}));
 assert.deepEqual(x,{phase:'chat',httpStatus:400,errorClass:'format_rejected'});
 assert.equal(JSON.stringify(x).includes('SECRET'),false);
});
test('classify OOM and image capability failure without leaking their raw bodies',()=>{
 assert.equal(classifyOllamaFailure('/api/chat',500,
  JSON.stringify({error:'insufficient memory: private/file/name'})).errorClass,
  'resource_pressure');
 assert.equal(classifyOllamaFailure('/api/chat',400,
  JSON.stringify({error:'image decoding not supported: private URL'})).errorClass,
  'image_request_rejected');
 assert.equal(classifyOllamaFailure('/api/show',404,'some raw user data').errorClass,'unknown');
});
test('failing real request reports just endpoint, HTTP status and category',async()=>{
 const request=async(url,opts)=>{
  assert.equal(url,'http://127.0.0.1:11435/api/chat');
  assert.equal(opts.method,'POST');
  return errorResponse('format json cannot be combined with this model; user secrets',400);
 };
 await assert.rejects(ollama('/api/chat',{model:'mock'},1000,{request}),e=>{
  assert.equal(e.message,'ollama_request_failed');
  assert.equal(e.phase,'chat');
  assert.equal(e.httpStatus,400);
  assert.equal(e.errorClass,'format_rejected');
  assert.equal(String(e).includes('secrets'),false);
  return true;
 });
});
test('HTTP 500 without recognized body does not print arbitrary diagnostic text',async()=>{
 const request=async()=>errorResponse('opaque private server diagnostics',500);
 await assert.rejects(ollama('/api/chat',{},1000,{request}),e=>{
  assert.equal(e.phase,'chat');
  assert.equal(e.httpStatus,500);
  assert.equal(e.errorClass,'unknown');
  assert.equal(JSON.stringify(e).includes('opaque'),false);
  return true;
 });
});
test('network errors identify metadata phase and do not invent HTTP status',async()=>{
 const request=async()=>{throw Error('proxy detail SECRET')};
 await assert.rejects(ollama('/api/tags',undefined,1000,{request}),e=>{
  assert.equal(e.message,'ollama_unreachable_or_timed_out');
  assert.equal(e.phase,'tags');
  assert.equal(e.httpStatus,undefined);
  assert.equal(String(e).includes('SECRET'),false);
  return true;
 });
});
test('metadata success remains unchanged',async()=>{
 const request=async()=>new Response(JSON.stringify({models:[]}),{
  status:200,headers:{'content-type':'application/json'}});
 assert.deepEqual(await ollama('/api/tags',undefined,1000,{request}),{models:[]});
});
test('large untrusted error bodies are discarded, never reported',async()=>{
 const request=async()=>errorResponse('private info '.repeat(600),400);
 await assert.rejects(ollama('/api/show',{model:'x'},1000,{request}),e=>{
  assert.equal(e.phase,'show');
  assert.equal(e.httpStatus,400);
  assert.equal(e.errorClass,'unknown');
  return true;
 });
});
