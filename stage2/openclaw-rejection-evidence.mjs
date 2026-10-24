#!/usr/bin/env node
// Read-only evidence: private rejected-file metadata and live Gateway schema.
// Never disclose raw config, rejected contents, paths, secrets or RPC payloads.
import {lstat,readdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {execNative,rpcEnvelope} from './openclaw-ollama-provision.mjs';
import {probeOpenClaw} from './openclaw-config-preflight.mjs';

const AUDIT='IOANT_OPENCLAW_REJECTION_EVIDENCE';
const FAMILIES=Object.freeze([['rejected','openclaw.json.rejected.'],['clobbered','openclaw.json.clobbered.']]);
const LOOKUPS=Object.freeze([
 ['provider','models.providers.ollama'],
 ['timeout','models.providers.ollama.timeoutSeconds'],
 ['models','models.providers.ollama.models'],
 ['model_context','models.providers.ollama.models[].contextTokens'],
 ['model_id','models.providers.ollama.models[].id']
]);
const TYPES=new Set(['object','array','string','number','integer','boolean','null']);
function flag(v){return typeof v==='boolean'?v?'true':'false':'unspecified'}
function ownPrivateFile(st){return !!st&&st.isFile()&&!st.isSymbolicLink()&&
 (st.mode&0o077)===0&&(typeof process.getuid!=='function'||st.uid===process.getuid())}
function safeDirectory(st){return !!st&&st.isDirectory()&&!st.isSymbolicLink()&&
 (st.mode&0o022)===0&&(typeof process.getuid!=='function'||st.uid===process.getuid())}
function latestBucket(t,now){const delta=now-t;
 if(!Number.isFinite(t)||delta<0)return 'unknown';
 return delta<=3600000?'last_hour':delta<=86400000?'last_day':'older';
}
export async function inspectRejectionMarkers({home=homedir(),fs={readdir,lstat},now=Date.now()}={}){
 const dir=join(home,'.openclaw');
 try{
  const st=await fs.lstat(dir);
  if(!safeDirectory(st))return {state:'unsafe_config_directory'};
  const names=await fs.readdir(dir);
  if(!Array.isArray(names)||names.length>2000)return {state:'directory_too_large'};
  const counts={rejected:0,clobbered:0};
  let newest=-1;
  for(const name of names){
   if(typeof name!=='string')continue;
   const family=FAMILIES.find(([,prefix])=>name.startsWith(prefix));
   if(!family)continue;
   const suffix=name.slice(family[1].length);
   if(!/^[A-Za-z0-9._-]{1,100}$/.test(suffix))return {state:'unsupported_marker_name'};
   const file=await fs.lstat(join(dir,name));
   if(!ownPrivateFile(file))return {state:'unsafe_marker_file'};
   if(file.size>2*1024*1024)return {state:'marker_too_large'};
   counts[family[0]]++;
   if(Number.isFinite(file.mtimeMs)&&file.mtimeMs>newest)newest=file.mtimeMs;
  }
  return {state:'observed',rejected:Math.min(counts.rejected,20),
   clobbered:Math.min(counts.clobbered,20),countsCapped:counts.rejected>20||counts.clobbered>20,
   latestAge:newest<0?'none':latestBucket(newest,now)};
 }catch{return {state:'metadata_unavailable'}}
}
export function classifyLiveSchema(key,response){
 if(!LOOKUPS.some(([id])=>id===key))return null;
 const doc=rpcEnvelope(response);
 if(!doc||typeof doc!=='object'||Array.isArray(doc)||doc.error||doc.ok===false)
  return {key,state:'rpc_error'};
 const found=doc.schema;
 if(doc.path!==LOOKUPS.find(([id])=>id===key)[1]||!found||typeof found!=='object'||Array.isArray(found))
  return {key,state:'unresolved'};
 const kind=typeof found.type==='string'&&TYPES.has(found.type)?found.type:'unspecified';
 return {key,state:'recognized',type:kind,
  required:flag(found.required===true?true:found.required===false?false:undefined)};
}
export async function inspectRejectionEvidence({preflight=probeOpenClaw,
 files=inspectRejectionMarkers,rpc=execNative}={}){
 const report={audit:AUDIT,schemaVersion:1,readOnly:true};
 try{
  if(process.env.OPENCLAW_CONFIG_PATH||process.env.OPENCLAW_STATE_DIR||process.env.OPENCLAW_PROFILE)
   return {...report,status:'custom_profile_review'};
  const p=await preflight();
  if(p?.config!=='regular_private'||p.provider!=='absent'||p.agents!=='absent')
   return {...report,status:'preflight_blocked'};
  const markers=await files();
  const lookups=[];
  for(const [key,path] of LOOKUPS){
   try{lookups.push(classifyLiveSchema(key,await rpc('config.schema.lookup',{path})))}
   catch{lookups.push({key,state:'rpc_unavailable'})}
  }
  return {...report,status:'observed',markers,lookups};
 }catch{return {...report,status:'diagnostic_unavailable'}}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 inspectRejectionEvidence().then(r=>console.log(JSON.stringify(r))).catch(()=>
  console.log(JSON.stringify({audit:AUDIT,schemaVersion:1,readOnly:true,status:'diagnostic_unavailable'})));
}
