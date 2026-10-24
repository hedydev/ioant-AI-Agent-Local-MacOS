#!/usr/bin/env node
// Read-only OpenClaw provision discovery. Never outputs config values,
// credentials, auth profiles, other agent names or browser state.
import {lstat} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const call=promisify(execFile);
const TARGET='http://127.0.0.1:11435';
const MODELS=new Set(['gemma4:26b-a4b','gpt-oss:20b','granite4:3b','functiongemma:270m','embeddinggemma:latest']);
const BAD_ENV=/^(?:OPENCLAW_GATEWAY_|OPENCLAW_.*(?:KEY|TOKEN|PASSWORD)|OLLAMA_API_KEY)/;
const PROBE_LIMIT=8192;

export function parseProvider(text){
  // CLI exit=0 with a redacted JSON object is the only trustworthy read.
  let value;try{value=JSON.parse(text)}catch{return 'unknown'}
  if(!value||typeof value!=='object'||Array.isArray(value))return 'unknown';
  if(value.api!=='ollama'||typeof value.baseUrl!=='string')return 'different';
  return value.baseUrl===TARGET?'target':'different';
}
export function parseAgents(text){
  let value;try{value=JSON.parse(text)}catch{return 'unknown'}
  // Current CLI can return a list or {agents:[...]}; neither shape is assumed.
  const entries=Array.isArray(value)?value:Array.isArray(value?.agents)?value.agents:null;
  if(!entries||entries.some(a=>!a||typeof a.id!=='string'))return 'unknown';
  return entries.some(a=>a.id==='alice-ai')?'present':'absent';
}
export function planFromEvidence(evidence){
  if(evidence.config!=='regular_private'||evidence.ollama!=='reachable'||
     evidence.provider==='unknown'||evidence.agents==='unknown')
     return 'manual_review';
  if(evidence.provider==='different'||evidence.agents==='present')return 'manual_review';
  return 'eligible_for_separate_write_approval';
}
async function privateFileStatus(path){
  try{
    const s=await lstat(path);
    if(s.isSymbolicLink()||!s.isFile())return 'unsafe';
    if((s.mode&0o077)!==0)return 'permission_review';
    if(typeof process.getuid==='function'&&s.uid!==process.getuid())return 'unsafe';
    return 'regular_private';
  }catch(e){return e?.code==='ENOENT'?'missing':'unavailable'}
}
async function defaultExec(bin,args){
  // Never proxy CLI values verbatim into ChatGPT.
  const env={...process.env};
  for(const k of Object.keys(env))if(BAD_ENV.test(k))delete env[k];
  const r=await call(bin,args,{timeout:12000,maxBuffer:PROBE_LIMIT,env});
  return r.stdout;
}
async function defaultFetch(url){
  const r=await fetch(url,{signal:AbortSignal.timeout(2400),redirect:'manual'});
  if(!r.ok)return null;
  const t=await r.text();
  if(t.length>PROBE_LIMIT)return null;
  return JSON.parse(t);
}
export async function probeOpenClaw({
  home=homedir(),
  execImpl=defaultExec,
  fetchImpl=defaultFetch,
  configFileStatus=privateFileStatus
}={}){
  const file=resolve(home,'.openclaw','openclaw.json');
  const cli=join(home,'.openclaw','bin','openclaw');
  let ollama='unknown',installed=[],provider='unknown',agents='unknown';
  // A custom state dir/profile could make CLI reads refer to a different
  // OpenClaw identity than ~/.openclaw; do not infer eligibility in that case.
  const customProfile=Boolean(process.env.OPENCLAW_CONFIG_PATH||process.env.OPENCLAW_STATE_DIR||process.env.OPENCLAW_PROFILE);
  const config=customProfile?'custom_profile_review':await configFileStatus(file);
  try{
    const tags=await fetchImpl(TARGET+'/api/tags');
    if(Array.isArray(tags?.models)){
      ollama='reachable';
      installed=[...new Set(tags.models.map(m=>m?.name).filter(x=>MODELS.has(x)))].sort();
    }else ollama='unavailable';
  }catch{ollama='unavailable'}
  if(config==='regular_private'){
    try{provider=parseProvider(await execImpl(cli,['config','get','models.providers.ollama','--json']))}
    catch(e){provider=e?.exitCode===1||e?.code===1?'absent':'unknown'}
    try{agents=parseAgents(await execImpl(cli,['agents','list','--json']))}catch{agents='unknown'}
  }
  const evidence={audit:'IOANT_OPENCLAW_CONFIG_PREFLIGHT',schemaVersion:1,readOnly:true,
    config,ollama,installed,provider,agents};
  return {...evidence,next:planFromEvidence(evidence)};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
  probeOpenClaw().then(r=>console.log(JSON.stringify(r))).catch(()=>console.log(JSON.stringify({
    audit:'IOANT_OPENCLAW_CONFIG_PREFLIGHT',schemaVersion:1,readOnly:true,next:'manual_review',reason:'probe_error'
  })));
}
