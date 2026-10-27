#!/usr/bin/env node
// Local Ollama vision HTTP metadata preflight. No inference, screenshots,
// browser/GUI interaction, model downloads, installs, or service changes.
import {realpath} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(homedir(),'Library','Application Support','ioant-openclaw-ops','runtime');
const BASE='http://127.0.0.1:11435';
const MODELS=Object.freeze(['gemma4:26b-a4b','qwen3.8:27b-mlx',
  'qwen3.6:27b-coding','gemma4:31b-mlx']);
const MAX_BODY=512*1024;
const AUDIT='IOANT_OLLAMA_VISION_HTTP_PREFLIGHT';

export async function boundedJson(route,body,{request=fetch}={}){
  if(!['/api/tags','/api/ps','/api/show'].includes(route)||
    (route==='/api/show'&&(!body||!MODELS.includes(body.model)))||
    (route!=='/api/show'&&body!==undefined))
    return {state:'invalid_request'};
  let response;
  try{
    response=await request(BASE+route,{
      method:body?'POST':'GET',redirect:'error',
      ...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{}),
      signal:AbortSignal.timeout(14000)
    });
  }catch{return {state:'network_or_timeout'};}
  if(!response||typeof response.status!=='number')return {state:'invalid_response'};
  if(!response.ok)return {state:'http_error',httpStatus:response.status};
  if(!String(response.headers?.get('content-type')??'').includes('json'))
    return {state:'not_json'};
  const length=Number(response.headers?.get('content-length'));
  if(Number.isFinite(length)&&length>MAX_BODY)return {state:'oversize'};
  let reader;
  try{reader=response.body?.getReader()}catch{return {state:'invalid_response'};}
  if(!reader)return {state:'invalid_response'};
  const chunks=[];
  let total=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>MAX_BODY){await reader.cancel();return {state:'oversize'};}
      chunks.push(value);
    }
    const data=JSON.parse(Buffer.concat(chunks,total).toString('utf8'));
    return {state:'ok',data};
  }catch{return {state:'invalid_json_or_stream'};}
  finally{try{reader.releaseLock()}catch{}}
}
export async function diagnose({api=boundedJson}={}){
  const out={audit:AUDIT,schemaVersion:1,readOnly:true,loopbackOnly:true,
    invokedInference:false,readScreenshot:false,changedBrowser:false,
    changedConfig:false};
  const tags=await api('/api/tags');
  const ps=await api('/api/ps');
  const safe=x=>({state:x?.state??'invalid_response',
    ...(x?.state==='http_error'&&Number.isInteger(x.httpStatus)?
      {httpStatus:x.httpStatus}:{})});
  const checks={tags:safe(tags),ps:safe(ps)};
  if(tags?.state!=='ok'||!Array.isArray(tags.data?.models))
    return {...out,state:'inconclusive',checks,models:[]};
  const present=new Set(tags.data.models.map(x=>x?.name).filter(x=>typeof x==='string'));
  const models=[];
  for(const name of MODELS){
    if(!present.has(name))continue;
    const shown=await api('/api/show',{model:name});
    const vision=shown?.state==='ok'&&
      Array.isArray(shown.data?.capabilities)?
      shown.data.capabilities.includes('vision'):null;
    models.push({name,show:safe(shown),vision});
  }
  const residency=ps?.state==='ok'&&Array.isArray(ps.data?.models)?
    {state:'observed',count:ps.data.models.length}:
    {state:'unknown'};
  const firstVision=models.find(x=>x.vision===true)?.name??null;
  const anyShowError=models.some(x=>x.show.state!=='ok');
  return {...out,state:ps?.state==='ok'&&!anyShowError?'observed':'inconclusive',
    checks,installedModels:models,residency,firstVisionModel:firstVision,
    inferenceStatus:'not_tested'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  let result;
  try{
    if(process.argv.length!==2||ROOT!==RUNTIME||await realpath(RUNTIME)!==RUNTIME)
      throw Error('invalid_runtime');
    result=await diagnose();
  }catch{
    result={audit:AUDIT,state:'blocked',reason:'invalid_runtime_or_preflight',
      readOnly:true,invokedInference:false,changedBrowser:false};
  }
  console.log(JSON.stringify(result));
  if(result.state!=='observed')process.exitCode=1;
}
