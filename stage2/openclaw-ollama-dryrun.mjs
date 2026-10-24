#!/usr/bin/env node
// Read-only local OpenClaw CLI dry-run for three fixed Ollama provider
// candidate shapes. Never config.patch Gateway RPC or mutate config files.
import {spawn} from 'node:child_process';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {probeOpenClaw} from './openclaw-config-preflight.mjs';

const CLI=join(homedir(),'.openclaw','bin','openclaw');
const OLLAMA_ENDPOINT='http://127.0.0.1:11435';
const IDS=['gemma4:26b-a4b','gpt-oss:20b'];
const AUDIT='IOANT_OPENCLAW_OLLAMA_DRYRUN';
const TYPES=['as_authored','official_explicit','minimal_discovery'];
const MAX_TEXT=12000;

export function candidate(id){
  if(!TYPES.includes(id))throw Error('unsupported_candidate');
  const base={baseUrl:OLLAMA_ENDPOINT,apiKey:'ollama-local',api:'ollama'};
  if(id==='as_authored')return {models:{providers:{ollama:{
    ...base,timeoutSeconds:300,
    models:IDS.map(name=>({id:name,name,input:['text'],contextTokens:32768}))
  }}}};
  if(id==='official_explicit')return {models:{providers:{ollama:{
    ...base,timeoutSeconds:300,
    models:IDS.map(name=>({id:name,name,input:['text'],contextWindow:32768,maxTokens:8192}))
  }}}};
  return {models:{providers:{ollama:base}}};
}
export function errorCategory(s){
 const text=String(s??'').slice(-MAX_TEXT);
 if(/(?:state owner|exclusive|gateway.{0,45}(?:stop|running)|resource busy|locked by)/i.test(text))
   return 'offline_owner';
 if(/(?:unknown option|unrecognized option|unknown command|unsupported option)/i.test(text))
   return 'unsupported_dryrun_cli';
 if(/(?:invalid config|validation|schema|unrecognized (?:key|field)|unknown (?:key|field))/i.test(text))
   return 'schema_validation';
 if(/(?:permission denied|forbidden|scope|unauthorized)/i.test(text))return 'permission';
 if(/(?:ENOENT|not found|no such file)/i.test(text))return 'unavailable';
 return 'unclassified_failure';
}
export async function spawnDryRun(patch,{exec=spawn,bin=CLI}={}){
 const input=JSON.stringify(patch);
 if(input.length>6000)throw Error('unexpected_patch_size');
 return new Promise(done=>{
  let finished=false,out='',truncated=false,timer;
  const complete=(r)=>{if(!finished){finished=true;clearTimeout(timer);done(r)}};
  let child;
  try{
    const env={...process.env};
    for(const k of ['OPENCLAW_GATEWAY_TOKEN','OPENCLAW_GATEWAY_PASSWORD','OPENCLAW_GATEWAY_URL',
      'IOANT_LOOP_LOG_FILE','NODE_TEST_CONTEXT'])delete env[k];
    child=exec(bin,['config','patch','--stdin','--dry-run'],
      {env,shell:false,stdio:['pipe','pipe','pipe']});
  }catch{return complete({status:'failed',category:'unavailable'})}
  const accept=b=>{const t=b.toString('utf8');
    if(out.length+t.length>MAX_TEXT){truncated=true;out=(out+t).slice(-MAX_TEXT)}
    else out+=t;
  };
  child.stdout?.on('data',accept);
  child.stderr?.on('data',accept);
  child.on('error',()=>complete({status:'failed',category:'unavailable'}));
  child.on('close',code=>complete(code===0&&!truncated?
    {status:'passed'}:{status:'failed',category:truncated?'output_truncated':errorCategory(out)}));
  child.stdin?.on('error',()=>{});
  child.stdin?.end(input);
  timer=setTimeout(()=>{child.kill('SIGTERM');complete({status:'failed',category:'timed_out'})},20000);
 });
}
export async function diagnoseDryRun({preflight=probeOpenClaw,run=spawnDryRun}={}){
 const p=await preflight();
 if(p?.config!=='regular_private'||p?.ollama!=='reachable'||p?.provider!=='absent'||
   p?.agents!=='absent'||!IDS.every(x=>p.installed?.includes(x))){
   return {audit:AUDIT,schemaVersion:1,readOnly:true,status:'preflight_blocked'};
 }
 const checks=[];
 for(const id of TYPES){
   let tested;
   try{tested=await run(candidate(id))}catch{tested={status:'failed',category:'unclassified_failure'}}
   checks.push({candidate:id,status:tested?.status==='passed'?'passed':'failed',
     ...(tested?.status==='passed'?{}:{category:[
       'offline_owner','unsupported_dryrun_cli','schema_validation','permission','unavailable',
       'unclassified_failure','output_truncated','timed_out'
     ].includes(tested?.category)?tested.category:'unclassified_failure'})});
 }
 return {audit:AUDIT,schemaVersion:1,readOnly:true,status:'observed',checks};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 diagnoseDryRun().then(x=>console.log(JSON.stringify(x))).catch(()=>
   console.log(JSON.stringify({audit:AUDIT,schemaVersion:1,readOnly:true,status:'diagnostic_unavailable'})));
}
