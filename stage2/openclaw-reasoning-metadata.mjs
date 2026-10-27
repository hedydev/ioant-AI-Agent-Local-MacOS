#!/usr/bin/env node
// Narrow, one-shot OpenClaw Gemma reasoning metadata correction.
// Not a generic config editor. No arguments, agent changes, model selection,
// remote hosts, password output or automatic retry on ambiguous RPC outcomes.
import {lstat,readFile,mkdir,open,realpath} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {spawn} from 'node:child_process';
import {execNative,rpcEnvelope,patchFailureLabel} from './openclaw-ollama-provision.mjs';

const CONFIG=join(homedir(),'.openclaw','openclaw.json');
const DIR=join(homedir(),'.openclaw','reasoning-metadata-backups');
const CLI=join(homedir(),'.openclaw','bin','openclaw');
const MODEL='gemma4:26b-a4b';
const INPUT=['text','image'];
const EXPECTED_IDS=['gemma4:26b-a4b','gpt-oss:20b','qwen3.6:27b-coding','gemma4:31b-mlx','nemotron-3-nano:30b-mlx'];
const OPAQUE=/^[\x21-\x7e]{8,256}$/;
const MAX=512*1024;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const owned=s=>!s.isSymbolicLink()&&(s.mode&0o077)===0&&
  (typeof process.getuid!=='function'||s.uid===process.getuid());
const audit=(state,note,extra={})=>({audit:'IOANT_GEMMA_REASONING_PATCH',
  schemaVersion:1,state,note,...extra});
const fail=x=>{throw Error(x)};
const safeNote=e=>/^[a-z_]{3,80}$/.test(e?.message??'')?e.message:'precondition_failed';
function modelList(cfg){
 const p=cfg?.models?.providers?.ollama;
 if(!obj(p)||p.api!=='ollama'||p.baseUrl!=='http://127.0.0.1:11435'||
   !Array.isArray(p.models))fail('provider_mismatch');
 const ids=p.models.map(x=>obj(x)?x.id:null);
 if(!isDeepStrictEqual(ids,EXPECTED_IDS))fail('model_inventory_mismatch');
 const target=p.models[0];
 if(!isDeepStrictEqual(target.input,INPUT))fail('vision_preservation_guard');
 if(target.params?.thinking!==undefined||target.params?.think!==undefined)
  fail('explicit_think_override_review');
 return p.models;
}
const reasoning=x=>Object.hasOwn(x,'reasoning')?x.reasoning:'absent';
export function planReasoningPatch(disk,rpcResponse){
 if(!obj(disk))fail('invalid_config_document');
 const doc=rpcEnvelope(rpcResponse);
 if(!obj(doc)||doc.valid===false||doc.exists===false||
   typeof doc.hash!=='string'||!OPAQUE.test(doc.hash))fail('revision_unavailable');
 const list=modelList(disk),diskValue=reasoning(list[0]);
 if(diskValue!==true&&diskValue!=='absent')fail('explicit_reasoning_disabled');
 const names=['sourceConfig','config','parsed','resolved'];
 // In this OpenClaw build the effective "config" root materializes the
 // missing reasoning flag as false; raw authored roots leave it absent.
 if(!names.every(name=>obj(doc[name])))fail('snapshot_unavailable');
 for(const name of names){
  const remote=modelList(doc[name]);
  const value=reasoning(remote[0]);
  if(diskValue===true){
   if(value!==true)fail('snapshot_reasoning_conflict');
  }else if(!['absent',false].includes(value)){
   fail('snapshot_reasoning_conflict');
  }
  if(!isDeepStrictEqual(remote.map(x=>x.id),list.map(x=>x.id)))
   fail('snapshot_or_inventory_conflict');
 }
 // The persisted authored model list is the single source for the entire
 // provider array; do not copy effective defaults into the patch.
 if(diskValue===true)return {state:'already_configured',hash:doc.hash};
 const models=structuredClone(list);
 models[0].reasoning=true;
 return {state:'ready',hash:doc.hash,patch:{models:{providers:{ollama:{models}}}}};
}
export function verifyReasoningPatch(before,after){
 try{
  if(!obj(before)||!obj(after))return false;
  const x=structuredClone(before),list=modelList(x);
  if(reasoning(list[0])!=='absent')return false;
  list[0].reasoning=true;
  return isDeepStrictEqual(x,after)&&modelList(after)[0].reasoning===true;
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
 const dest=join(DIR,'gemma-reasoning-before-'+randomBytes(8).toString('hex')+'.json');
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
export async function patchGemmaReasoning({
  rpc=execNative,read=snapshotDisk,backup=privateBackup,validate=dryRun
}={}){
 if(process.env.OPENCLAW_CONFIG_PATH||process.env.OPENCLAW_PROFILE||
    process.env.OPENCLAW_STATE_DIR)return audit('blocked','custom_profile_review');
 let before,plan;
 try{
  before=await read();
  plan=planReasoningPatch(before.parsed,await rpc('config.get',{}));
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
   note:'Operator approved Gemma reasoning metadata only'
  }));
 }catch(e){return audit('inconclusive',patchFailureLabel(e),{backup:true})}
 if(!obj(reply)||reply.ok===false||!Array.isArray(reply.changedPaths)||
   !reply.changedPaths.every(x=>typeof x==='string'))
  return audit('inconclusive','patch_reply_invalid',{backup:true});
 try{
  const next=await read();
  if(!verifyReasoningPatch(before.parsed,next.parsed))
   return audit('inconclusive','config_readback_mismatch',{backup:true});
  const live=rpcEnvelope(await rpc('config.get',{}));
  if(!['sourceConfig','config','parsed','resolved'].every(name=>
    obj(live?.[name])&&modelList(live[name])[0].reasoning===true))
   return audit('inconclusive','gateway_readback_mismatch',{backup:true});
 }catch{return audit('inconclusive','readback_unavailable',{backup:true})}
 return audit('applied','reasoning_enabled',{backup:true,verified:true});
}
// On macOS /var is commonly a symlink to /private/var, so a direct Node
// invocation may have a different argv path than the canonical ESM URL.
// Compare real files, not path spelling, and avoid running during imports.
async function invokedDirectly(){
 if(!process.argv[1])return false;
 try{return (await realpath(process.argv[1]))===(await realpath(fileURLToPath(import.meta.url)));}
 catch{return false;}
}
if(await invokedDirectly()){
 patchGemmaReasoning().then(x=>process.stdout.write(JSON.stringify(x)+'\n')).catch(()=>
  process.stdout.write(JSON.stringify(audit('blocked','unexpected_failure'))+'\n'));
}
