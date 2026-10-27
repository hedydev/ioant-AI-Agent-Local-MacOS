#!/usr/bin/env node
// Narrow, one-shot OpenClaw Gemma vision metadata correction.
// Not a generic config editor. No arguments, agent changes, model selection,
// remote hosts, password output or automatic retry on ambiguous RPC outcomes.
import {lstat,readFile,mkdir,open,realpath} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {spawn} from 'node:child_process';
import {execNative,rpcEnvelope,patchFailureLabel} from './openclaw-ollama-provision.mjs';

const CONFIG=join(homedir(),'.openclaw','openclaw.json');
const DIR=join(homedir(),'.openclaw','vision-metadata-backups');
const CLI=join(homedir(),'.openclaw','bin','openclaw');
const MODEL='gemma4:26b-a4b';
const INPUT=['text','image'];
const OPAQUE=/^[\x21-\x7e]{8,256}$/;
const MAX=512*1024;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const owned=s=>!s.isSymbolicLink()&&(s.mode&0o077)===0&&
  (typeof process.getuid!=='function'||s.uid===process.getuid());
const audit=(state,note,extra={})=>({audit:'IOANT_GEMMA_VISION_PATCH',
  schemaVersion:1,state,note,...extra});
const fail=x=>{throw Error(x)};
const safeNote=e=>/^[a-z_]{3,80}$/.test(e?.message??'')?e.message:'precondition_failed';
function modelList(cfg){
 const p=cfg?.models?.providers?.ollama;
 if(!obj(p)||p.api!=='ollama'||p.baseUrl!=='http://127.0.0.1:11435'||
  !Array.isArray(p.models)||p.models.length<2||p.models.length>32)fail('provider_mismatch');
 const ids=p.models.map(x=>obj(x)?x.id:null);
 if(ids.some(x=>typeof x!=='string')||new Set(ids).size!==ids.length||
   ids.filter(x=>x===MODEL).length!==1)fail('model_inventory_mismatch');
 const target=p.models.find(x=>x.id===MODEL);
 if(!Array.isArray(target.input)||!isDeepStrictEqual(target.input,['text'])&&
   !isDeepStrictEqual(target.input,INPUT))fail('model_input_unexpected');
 return p.models;
}
export function planVisionPatch(disk,rpcResponse){
 if(!obj(disk))fail('invalid_config_document');
 const d=rpcEnvelope(rpcResponse);
 if(!obj(d)||d.valid===false||d.exists===false||
   typeof d.hash!=='string'||!OPAQUE.test(d.hash))fail('revision_unavailable');
 const list=modelList(disk);
 const roots=['sourceConfig','config','parsed','resolved'].map(k=>d[k]).filter(obj);
 if(!roots.length)fail('snapshot_unavailable');
 for(const root of roots){
  const remote=modelList(root);
  if(!isDeepStrictEqual(remote.map(x=>x.id),list.map(x=>x.id))||
     !isDeepStrictEqual(remote.find(x=>x.id===MODEL).input,list.find(x=>x.id===MODEL).input))
   fail('snapshot_or_inventory_conflict');
 }
 if(isDeepStrictEqual(list.find(x=>x.id===MODEL).input,INPUT))
  return {state:'already_configured',hash:d.hash};
 const models=structuredClone(list);
 models.find(x=>x.id===MODEL).input=INPUT;
 return {state:'ready',hash:d.hash,patch:{models:{providers:{ollama:{models}}}}};
}
export function verifyVisionPatch(before,after){
 try{
  if(!obj(before)||!obj(after))return false;
  const x=structuredClone(before),target=modelList(x);
  target.find(v=>v.id===MODEL).input=INPUT;
  return isDeepStrictEqual(x,after)&&isDeepStrictEqual(
    modelList(after).find(v=>v.id===MODEL).input,INPUT);
 }catch{return false}
}
async function snapshotDisk(path=CONFIG){
 const s=await lstat(path);
 if(!s.isFile()||!owned(s)||s.size>MAX)fail('unsafe_local_config');
 const raw=await readFile(path);
 if(raw.length>MAX)fail('unsafe_local_config');
 let parsed;try{parsed=JSON.parse(raw.toString('utf8'))}catch{fail('config_json_unavailable')}
 return {raw,parsed};
}
async function privateBackup(raw){
 const parent=join(homedir(),'.openclaw');
 const p=await lstat(parent);
 if(!p.isDirectory()||!owned(p)||await realpath(parent)!==parent)
  fail('unsafe_backup_parent');
 try{await mkdir(DIR,{mode:0o700})}catch(e){if(e.code!=='EEXIST')throw e}
 const s=await lstat(DIR);
 if(!s.isDirectory()||!owned(s)||await realpath(DIR)!==DIR)
  fail('unsafe_backup_dir');
 const dest=join(DIR,'gemma-vision-before-'+randomBytes(8).toString('hex')+'.json');
 const f=await open(dest,'wx',0o600);
 try{await f.writeFile(raw);await f.sync()}finally{await f.close()}
 return true;
}
async function dryRun(patch,{bin=CLI,spawner=spawn}={}){
 return await new Promise(resolve=>{
  let ended=false,child,timer;
  const done=x=>{if(!ended){ended=true;clearTimeout(timer);resolve(x)}};
  try{child=spawner(bin,['config','patch','--stdin','--dry-run'],
    {shell:false,stdio:['pipe','ignore','ignore']})}
  catch{return done(false)}
  child.on('error',()=>done(false));
  child.on('close',code=>done(code===0));
  child.stdin.on('error',()=>{});
  child.stdin.end(JSON.stringify(patch));
  timer=setTimeout(()=>{child.kill('SIGTERM');done(false)},25000);
 });
}
export async function patchGemmaVision({
  rpc=execNative,read=snapshotDisk,backup=privateBackup,validate=dryRun
}={}){
 if(process.env.OPENCLAW_CONFIG_PATH||process.env.OPENCLAW_PROFILE||
    process.env.OPENCLAW_STATE_DIR)return audit('blocked','custom_profile_review');
 let before,plan;
 try{
  before=await read();
  plan=planVisionPatch(before.parsed,await rpc('config.get',{}));
 }catch(e){return audit('blocked',safeNote(e))}
 if(plan.state==='already_configured')return audit('already_configured','no_write');
 try{
  if(!await validate(plan.patch))return audit('blocked','schema_dryrun_failed');
  await backup(before.raw);
 }catch(e){return audit('blocked',safeNote(e))}
 let reply;
 try{
  reply=rpcEnvelope(await rpc('config.patch',{
   raw:JSON.stringify(plan.patch),baseHash:plan.hash,
   note:'Operator approved Gemma native image metadata only'
  }));
 }catch(e){return audit('inconclusive',patchFailureLabel(e),{backup:true})}
 if(!obj(reply)||reply.ok===false||!Array.isArray(reply.changedPaths)||
   !reply.changedPaths.every(x=>typeof x==='string'))
  return audit('inconclusive','patch_reply_invalid',{backup:true});
 try{
  const next=await read();
  if(!verifyVisionPatch(before.parsed,next.parsed))
   return audit('inconclusive','config_readback_mismatch',{backup:true});
  const live=rpcEnvelope(await rpc('config.get',{}));
  const model=modelList(live?.sourceConfig??live?.config??live?.parsed??live?.resolved);
  if(!isDeepStrictEqual(model.find(x=>x.id===MODEL).input,INPUT))
   return audit('inconclusive','gateway_readback_mismatch',{backup:true});
 }catch{return audit('inconclusive','readback_unavailable',{backup:true})}
 return audit('applied','vision_input_enabled',{backup:true,verified:true});
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 patchGemmaVision().then(x=>process.stdout.write(JSON.stringify(x)+'\n')).catch(()=>
  process.stdout.write(JSON.stringify(audit('blocked','unexpected_failure'))+'\n'));
}
