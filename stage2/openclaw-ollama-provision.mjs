#!/usr/bin/env node
// Operator-opted-in, single-purpose OpenClaw Ollama provider registration.
// No model supplied text, page-supplied arguments, unknown targets or app installs.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {lstat,readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {homedir} from 'node:os';
import {resolve,join,sep} from 'node:path';
import {randomBytes} from 'node:crypto';
import {parseProvider,probeOpenClaw} from './openclaw-config-preflight.mjs';

const exec=promisify(execFile);
const AUDIT='IOANT_OPENCLAW_OLLAMA_PROVISION';
const TARGET='http://127.0.0.1:11435';
const CLI=join(homedir(),'.openclaw','bin','openclaw');
const CONFIG=join(homedir(),'.openclaw','openclaw.json');
const MAX_OUTPUT=512*1024;
const MODELS=Object.freeze([
 {id:'gemma4:26b-a4b',name:'gemma4:26b-a4b',input:['text'],contextTokens:32768},
 {id:'gpt-oss:20b',name:'gpt-oss:20b',input:['text'],contextTokens:32768}
]);
const ALLOWED_KEY=/^[0-9a-f]{32,128}$/i;
function error(code){throw Error(code)}
function safeStateName(e){return /^[a-z_]{3,64}$/.test(e?.message??'')?e.message:'precondition_or_rpc_failed'}
export function safeAudit(state,more={}) {
 const allowed=new Set(['backup','provider','models','runtimeAcknowledged','note']);
 const result={audit:AUDIT,schemaVersion:1,state};
 for(const [k,v] of Object.entries(more)){
  if(!allowed.has(k))continue;
  if(k==='models'&&Array.isArray(v)&&v.every(s=>['gemma4:26b-a4b','gpt-oss:20b'].includes(s)))result[k]=v;
  else if(['backup','runtimeAcknowledged'].includes(k)&&typeof v==='boolean')result[k]=v;
  else if(k==='provider'&&['target','absent','unknown'].includes(v))result[k]=v;
  else if(k==='note'&&typeof v==='string'&&/^[a-z_]{3,64}$/.test(v))result[k]=v;
 }
 return result;
}
async function execNative(method,params,{cli=CLI,execImpl=exec}={}){
 const args=['gateway','call',method,'--params',JSON.stringify(params),'--json','--timeout','30000'];
 const env={...process.env};
 for(const key of ['OPENCLAW_GATEWAY_TOKEN','OPENCLAW_GATEWAY_PASSWORD','OPENCLAW_GATEWAY_URL','NODE_TEST_CONTEXT','IOANT_LOOP_LOG_FILE'])delete env[key];
 const r=await execImpl(cli,args,{timeout:38000,maxBuffer:MAX_OUTPUT,env});
 if(typeof r.stdout!=='string'||r.stdout.length>MAX_OUTPUT)error('invalid_rpc_response');
 try{return JSON.parse(r.stdout)}catch{error('invalid_rpc_response')}
}
function rpcEnvelope(response){
 if(response&&typeof response==='object'&&response.payload&&typeof response.payload==='object')return response.payload;
 return response;
}
export function validSnapshot(value){
 const doc=rpcEnvelope(value);
 const hash=doc?.hash;
 if(typeof hash!=='string'||hash.length>128||!ALLOWED_KEY.test(hash))return null;
 const resolved=doc?.config??doc?.parsed??doc?.resolved;
 if(!resolved||typeof resolved!=='object'||Array.isArray(resolved))return null;
 if(resolved?.models?.providers?.ollama!==undefined)return null; // no replacement
 return {hash};
}
async function privateFile(path){
 const st=await lstat(path);
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0||
  (typeof process.getuid==='function'&&st.uid!==process.getuid()))error('unsafe_config_file');
 if(st.size>MAX_OUTPUT)error('config_too_large');
 return st;
}
async function privateStage(cache,volume){
 const base=await realpath(volume);
 const root=await realpath(cache);
 if(!root.startsWith(base+sep+'DeveloperCache'+sep))error('unsafe_cache_location');
 const dest=join(root,'openclaw-provision-backups');
 await mkdir(dest,{recursive:true,mode:0o700});
 const actual=await realpath(dest),st=await lstat(dest);
 if(actual!==dest||!st.isDirectory()||(st.mode&0o077)!==0||
 (typeof process.getuid==='function'&&st.uid!==process.getuid()))error('unsafe_backup_directory');
 return dest;
}
export async function provisionOllama({
 preflight=probeOpenClaw,callRpc=execNative,
 fileCheck=privateFile,readConfig=readFile,save=writeFile,
 staging=privateStage,cli=CLI,config=CONFIG,
 cache=process.env.PROJECT_DEV_CACHE,volume=process.env.IOANT_DEV_VOLUME
}={}){
 if(process.env.OPENCLAW_CONFIG_PATH||process.env.OPENCLAW_STATE_DIR||process.env.OPENCLAW_PROFILE)
  return safeAudit('blocked',{note:'custom_profile_review'});
 const status=await preflight();
 if(status.config!=='regular_private'||status.ollama!=='reachable'||status.agents!=='absent')
  return safeAudit('blocked',{note:'preflight_not_eligible'});
 if(status.provider==='target')return safeAudit('already_configured',{provider:'target'});
 if(status.provider!=='absent')return safeAudit('blocked',{note:'provider_not_absent'});
 if(!MODELS.every(m=>status.installed?.includes(m.id)))
  return safeAudit('blocked',{note:'model_inventory_changed'});
 if(!cache||!volume)return safeAudit('blocked',{note:'private_cache_unavailable'});
 await fileCheck(config);
 // Ensure the actual live Gateway agrees on the provider schema before touching disk.
 const schema=rpcEnvelope(await callRpc('config.schema.lookup',{path:'models.providers.ollama'},{cli}));
 if(!schema||typeof schema!=='object'||schema.path!=='models.providers.ollama'||!schema.schema)
  return safeAudit('blocked',{note:'schema_not_verified'});
 const before=await callRpc('config.get',{},{cli});
 const revision=validSnapshot(before);
 if(!revision)return safeAudit('blocked',{note:'config_revision_or_provider_changed'});
 const dir=await staging(cache,volume);
 // Private immutable before-image. Never disclose the bytes or backup path to chat.
 const beforeBytes=await readConfig(config);
 const filename='openclaw-before-ollama-'+randomBytes(8).toString('hex')+'.json';
 const path=join(dir,filename);
 await save(path,beforeBytes,{flag:'wx',mode:0o600});
 const patch={models:{providers:{ollama:{
  baseUrl:TARGET,apiKey:'ollama-local',api:'ollama',timeoutSeconds:300,models:MODELS
 }}}};
 // One mutation, no automatic retries. A lost receipt demands read-only reconciliation.
 let result;
 try{
  result=rpcEnvelope(await callRpc('config.patch',{
   raw:JSON.stringify(patch),baseHash:revision.hash,response:'summary',
   note:'Operator approved local-only Ollama provider registration'
  },{cli}));
 }catch{
  return safeAudit('inconclusive',{backup:true,note:'patch_receipt_unavailable'});
 }
 if(!result||typeof result!=='object'||!Array.isArray(result.changedPaths)||
    !result.changedPaths.every(x=>typeof x==='string')||result.error||result.ok===false)
  return safeAudit('inconclusive',{backup:true,note:'patch_reply_invalid'});
 // Reading config after patch avoids mistaking persistence for model availability.
 const verify=await preflight();
 if(verify.provider!=='target')
  return safeAudit('inconclusive',{backup:true,provider:verify.provider==='absent'?'absent':'unknown',note:'provider_readback_mismatch'});
 return safeAudit('applied',{backup:true,provider:'target',models:MODELS.map(m=>m.id),runtimeAcknowledged:true});
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 provisionOllama().then(result=>console.log(JSON.stringify(result))).catch(e=>
  console.log(JSON.stringify(safeAudit('blocked',{note:safeStateName(e)}))));
}
