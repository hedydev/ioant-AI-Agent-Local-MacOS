#!/usr/bin/env node
// Non-mutating, strictly bounded main-agent response-latency preflight.
// Never read conversations/transcripts or output raw config, account, URL,
// provider credential, session identifier, filesystem path or tool inventory.
import {performance} from 'node:perf_hooks';
import {execNative,rpcEnvelope} from './openclaw-ollama-provision.mjs';

const AUDIT='IOANT_OPENCLAW_MAIN_SPEED';
const ENDPOINT='http://127.0.0.1:11435/api/ps';
const MODELS=new Set(['ollama/gemma4:26b-a4b','ollama/gpt-oss:20b',
 'ollama/qwen3.6:27b-coding','ollama/gemma4:31b-mlx',
 'ollama/nemotron-3-nano:30b-mlx']);
const THINK=new Set(['off','minimal','low','medium','high','xhigh','adaptive','max','ultra']);
const SAFE_MS=n=>Math.min(120000,Math.max(0,Math.round(n)));
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const modelString=x=>typeof x==='string'?x:object(x)?x.primary:null;
const safeModel=x=>MODELS.has(x)?x:(typeof x==='string'?'other':'unknown');
const safeThink=x=>THINK.has(x)?x:(x===false||x==='disabled'?'off':
 x===undefined?'inherited_or_unset':'other');
const boundNum=(x,max)=>Number.isInteger(x)&&x>=0&&x<=max?x:null;

function mainEntry(agents){
 const entries=agents?.entries;
 if(Array.isArray(entries)){
  const m=entries.filter(x=>object(x)&&x.id==='main');
  return m.length===1?m[0]:null;
 }
 return object(entries)&&object(entries.main)?entries.main:null;
}
function configSources(doc){
 if(!object(doc)||doc.valid===false||doc.exists===false)return [];
 return ['resolved','parsed','config','sourceConfig']
   .map(key=>doc[key]).filter(object);
}
export function summarizeMainConfig(raw){
 const doc=rpcEnvelope(raw);
 const candidates=configSources(doc);
 // Prefer the resolved Gateway snapshot; otherwise emit no certainty about
 // derived defaults. Never copy unknown values from an arbitrary config.
 const cfg=candidates[0];
 if(!cfg)return {status:'unavailable'};
 const agents=object(cfg.agents)?cfg.agents:{};
 const defaults=object(agents.defaults)?agents.defaults:{};
 const main=mainEntry(agents);
 const selected=modelString(main?.model)??modelString(defaults.model);
 const knownModel=safeModel(selected);
 const provider=cfg.models?.providers?.ollama;
 const providerEndpoint=provider?.baseUrl===ENDPOINT.replace('/api/ps','')
  ?'expected_local':provider===undefined?'absent':'other_or_unverified';
 const modelName=knownModel.startsWith('ollama/')?knownModel.slice(7):null;
 const entry=Array.isArray(provider?.models)?provider.models.find(x=>
   object(x)&&x.id===modelName):null;
 const window=boundNum(entry?.contextWindow??entry?.contextTokens,1000000);
 const fallbackList=Array.isArray(main?.model?.fallbacks)?main.model.fallbacks:
  Array.isArray(defaults.model?.fallbacks)?defaults.model.fallbacks:null;
 return {
  status:'observed',
  mainEntry:main?'explicit':'inherited_or_missing',
  model:knownModel,
  modelSource:main?.model!==undefined?'main_override':
   defaults.model!==undefined?'global_default':'unresolved',
  fallbackCount:fallbackList&&fallbackList.length<=32?fallbackList.length:'unknown',
  thinkingDefault:{
   main:safeThink(main?.thinkingDefault),
   global:safeThink(defaults.thinkingDefault)
  },
  fastModeDefault:main?.fastModeDefault===true?'on':main?.fastModeDefault===false?'off':
   defaults.fastModeDefault===true?'inherited_on':defaults.fastModeDefault===false?'inherited_off':'unknown',
  maxConcurrent:boundNum(defaults.maxConcurrent,512)??'unknown',
  provider:providerEndpoint,
  contextWindow:window??'unknown',
  // Existing App sessions can override the current agent/model thinking default.
  sessionOverride:'unobserved'
 };
}
async function boundedJson(response){
 if(!response?.ok)return null;
 const n=Number(response.headers?.get('content-length'));
 if(Number.isFinite(n)&&n>65536)return null;
 if(!response.body)return null;
 const reader=response.body.getReader();
 const parts=[];let size=0;
 try{
  while(true){
   const {value,done}=await reader.read();
   if(done)break;
   size+=value.byteLength;
   if(size>65536){await reader.cancel();return null;}
   parts.push(value);
  }
  const buf=new Uint8Array(size);let i=0;
  for(const p of parts){buf.set(p,i);i+=p.length;}
  return JSON.parse(new TextDecoder().decode(buf));
 }catch{return null}
 finally{reader.releaseLock();}
}
export function summarizeOllamaPs(doc,selectedModel){
 if(!object(doc)||!Array.isArray(doc.models)||doc.models.length>64)
  return {status:'unavailable'};
 const want=selectedModel?.startsWith('ollama/')?selectedModel.slice(7):null;
 const selected=doc.models.filter(x=>object(x)&&x.name===want);
 const other=doc.models.filter(x=>object(x)&&x.name!==want);
 return {status:'observed',residentCount:doc.models.length,
  mainModelResident:!want?'unknown':selected.length===1?'yes':
   selected.length===0?'no':'ambiguous',
  otherModelsResident:other.length,
  mainModelContext:boundNum(selected[0]?.context_length,1000000)??'unknown'};
}
export async function inspectMainSpeed({
 rpc=execNative,request=fetch,clock=()=>performance.now(),customProfile=Boolean(
  process.env.OPENCLAW_CONFIG_PATH||process.env.OPENCLAW_STATE_DIR||process.env.OPENCLAW_PROFILE)
}={}){
 const report={audit:AUDIT,schemaVersion:1,readOnly:true,agent:'main',
  configWrite:false,agentInvocation:false,modelGeneration:false};
 if(customProfile)return {...report,status:'custom_profile_review'};
 const start=clock();
 let config={status:'unavailable'},configRpc='unavailable';
 try{
  const raw=await rpc('config.get',{});
  config=summarizeMainConfig(raw);
  configRpc=config.status==='observed'?'observed':'unavailable';
 }catch{/* Never forward raw config, errors, auth profile or URI. */}
 const configElapsedMs=SAFE_MS(clock()-start);
 const psStart=clock();
 let ollama={status:'unavailable'};
 try{
  const response=await request(ENDPOINT,{method:'GET',redirect:'error',
   signal:AbortSignal.timeout(3500)});
  ollama=summarizeOllamaPs(await boundedJson(response),config.model);
 }catch{/* Never echo private Ollama payloads. */}
 const psElapsedMs=SAFE_MS(clock()-psStart);
 return {...report,status:configRpc==='observed'?'observed':'partial',
  configRpc,configElapsedMs,ollamaPsElapsedMs:psElapsedMs,config,ollama};
}
// This explicit fixed argument avoids platform-specific entrypoint path
// equivalence and never runs during node:test imports.
if(process.argv.length===3&&process.argv[2]==='--run'){
 inspectMainSpeed().then(x=>console.log(JSON.stringify(x))).catch(()=>
  console.log(JSON.stringify({audit:AUDIT,schemaVersion:1,readOnly:true,
    agent:'main',configWrite:false,status:'diagnostic_unavailable'})));
}
