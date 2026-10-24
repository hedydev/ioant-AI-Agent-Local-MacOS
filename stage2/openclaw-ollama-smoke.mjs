#!/usr/bin/env node
// Operator-pinned OpenClaw model catalog + loopback Ollama inference smoke.
// No agent invocation/tools, remote host, config mutation, user prompt or output text.
import {resolve} from 'node:path';
import {probeOpenClaw} from './openclaw-config-preflight.mjs';
import {execNative,rpcEnvelope} from './openclaw-ollama-provision.mjs';
const ENDPOINT='http://127.0.0.1:11435';
const MODELS=Object.freeze(['gemma4:26b-a4b','gpt-oss:20b']);
const AUDIT='IOANT_OPENCLAW_OLLAMA_SMOKE';
const OUTPUT_MAX=131072;
function safeModelResult(name,status,extras={}){
 const obj={model:name,status};
 if(typeof extras.available==='string'&&['yes','no','unknown'].includes(extras.available))
  obj.available=extras.available;
 if(typeof extras.local==='string'&&['yes','no','unknown'].includes(extras.local))
  obj.local=extras.local;
 return obj;
}
export function classifyCatalog(output){
 const obj=rpcEnvelope(output);
 if(!obj||typeof obj!=='object'||Array.isArray(obj)||!Array.isArray(obj.models)||
   obj.models.length>200||obj.models.some(row=>!row||typeof row!=='object'))
   return {status:'invalid_shape'};
 const models=MODELS.map(name=>{
  const rows=obj.models.filter(row=>row.provider==='ollama'&&row.id===name);
  if(rows.length===0)return safeModelResult(name,'not_listed');
  if(rows.length>1)return safeModelResult(name,'ambiguous');
  const row=rows[0];
  return safeModelResult(name,'listed',{
   available:row.available===true?'yes':row.available===false?'no':'unknown',
   local:row.local===true?'yes':row.local===false?'no':'unknown'
  });
 });
 return {status:'observed',models};
}
// Read the running Gateway directly: the CLI can otherwise fall back to a
// local cached catalog when Gateway is offline, which is not acceptance proof.
export async function gatewayCatalog({rpc=execNative}={}){
 try{
  const result=await rpc('models.list',{view:'all',provider:'ollama',includeDetails:true});
  return classifyCatalog(result);
 }catch{return {status:'unavailable'}}
}
async function boundedJson(response){
 const length=Number(response.headers?.get('content-length'));
 if(Number.isFinite(length)&&length>OUTPUT_MAX)return null;
 if(!response.body)return null;
 let byteCount=0;
 const reader=response.body.getReader();
 const chunks=[];
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   byteCount+=value.byteLength;
   if(byteCount>OUTPUT_MAX){await reader.cancel();return null;}
   chunks.push(value);
  }
  let offset=0;
  const result=new Uint8Array(byteCount);
  for(const part of chunks){result.set(part,offset);offset+=part.length;}
  return JSON.parse(new TextDecoder().decode(result));
 }catch{return null}
 finally{reader.releaseLock();}
}
export async function residentModels({request=fetch}={}){
 try{
  const r=await request(ENDPOINT+'/api/ps',{method:'GET',redirect:'error',
   signal:AbortSignal.timeout(4000)});
  if(!r.ok)return 'unknown';
  const doc=await boundedJson(r);
  if(!doc||!Array.isArray(doc.models)||doc.models.length>100)return 'unknown';
  return doc.models.length===0?'idle':'busy';
 }catch{return 'unknown'}
}
export function classifyInferenceResponse(doc){
 if(!doc||typeof doc!=='object'||Array.isArray(doc))return 'invalid_response';
 if(doc.done!==true)return 'incomplete';
 if(typeof doc.message?.content!=='string'||!doc.message.content.trim())return 'empty_reply';
 return 'reply_received';
}
export async function inferOne(name,{request=fetch}={}){
 if(!MODELS.includes(name))return 'not_allowlisted';
 try{
  const payload={model:name,messages:[{role:'user',content:'Reply with exactly OK.'}],
   stream:false,think:false,keep_alive:0,
   options:{num_ctx:2048,num_predict:80,temperature:0}};
  const r=await request(ENDPOINT+'/api/chat',{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(105000),
   headers:{'content-type':'application/json'},body:JSON.stringify(payload)
  });
  if(!r.ok)return r.status===404?'model_not_found':r.status===503?'service_busy':'http_error';
  return classifyInferenceResponse(await boundedJson(r));
 }catch{return 'timeout_or_unavailable'}
}
export async function runSmoke({preflight=probeOpenClaw,catalog=gatewayCatalog,
  resident=residentModels,infer=inferOne}={}){
 const report={audit:AUDIT,schemaVersion:1,configWrite:false,localInference:true};
 try{
  if(process.env.OPENCLAW_CONFIG_PATH||process.env.OPENCLAW_STATE_DIR||process.env.OPENCLAW_PROFILE)
   return {...report,status:'custom_profile_review'};
  const p=await preflight();
  if(p?.config!=='regular_private'||p.provider!=='target'||p.agents!=='absent'||
    p.ollama!=='reachable'||!MODELS.every(name=>p.installed?.includes(name)))
   return {...report,status:'preflight_blocked'};
  const modelCatalog=await catalog();
  if(modelCatalog.status!=='observed')
   return {...report,status:'catalog_unavailable',catalog:{status:modelCatalog.status}};
  const available=modelCatalog.models.every(r=>r.status==='listed'&&r.available!=='no');
  if(!available)return {...report,status:'catalog_not_ready',catalog:modelCatalog};
  const inference=[];
  for(const name of MODELS){
   const state=await resident();
   if(state!=='idle'){
    inference.push({model:name,status:state==='busy'?'busy_skip':'residency_unknown_skip'});
    continue;
   }
   let status;
   try{status=await infer(name);}catch{status='timeout_or_unavailable';}
   const options=['reply_received','invalid_response','incomplete','empty_reply',
     'model_not_found','service_busy','http_error','timeout_or_unavailable'];
   inference.push({model:name,status:options.includes(status)?status:'unclassified'});
  }
  return {...report,status:'observed',catalog:modelCatalog,inference};
 }catch{return {...report,status:'diagnostic_unavailable'}}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 runSmoke().then(r=>console.log(JSON.stringify(r))).catch(()=>
  console.log(JSON.stringify({audit:AUDIT,schemaVersion:1,configWrite:false,localInference:true,
   status:'diagnostic_unavailable'})));
}
