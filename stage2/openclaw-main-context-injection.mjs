#!/usr/bin/env node
// Single-purpose, opt-in main Agent context optimization.
// Never modifies AliceAI, global defaults, model catalog or tool permissions.
import {lstat,readFile,mkdir,open,realpath} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {spawn} from 'node:child_process';
import {execNative,rpcEnvelope,patchFailureLabel} from './openclaw-ollama-provision.mjs';

const HOME=homedir(),CONFIG=join(HOME,'.openclaw','openclaw.json');
const CLI=join(HOME,'.openclaw','bin','openclaw');
const BACKUP=join(HOME,'.openclaw','main-context-backups');
const MODE='continuation-skip',MAX=512*1024;
const OPAQUE=/^[\x21-\x7e]{8,256}$/;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const fail=s=>{throw Error(s)};
const safe=e=>/^[a-z_]{3,80}$/.test(e?.message??'')?e.message:'precondition_failed';
const audit=(state,note,extra={})=>({audit:'IOANT_MAIN_CONTEXT_INJECTION_PATCH',
 schemaVersion:1,state,note,...extra});
const owned=s=>!s.isSymbolicLink()&&(s.mode&0o077)===0&&
 (typeof process.getuid!=='function'||s.uid===process.getuid());
const main=cfg=>{
 const x=cfg?.agents?.entries?.main;
 if(!obj(x))fail('main_agent_unavailable');
 return x;
};
const current=x=>Object.hasOwn(x,'contextInjection')?x.contextInjection:'absent';
export function planMainContextPatch(disk,resp){
 if(!obj(disk))fail('invalid_config');
 const v=rpcEnvelope(resp);
 if(!obj(v)||v.valid===false||v.exists===false||typeof v.hash!=='string'||
   !OPAQUE.test(v.hash))fail('revision_unavailable');
 const state=current(main(disk));
 if(state!==MODE&&state!=='absent')fail('explicit_mode_requires_review');
 for(const k of ['sourceConfig','parsed','config','resolved']){
  if(!obj(v[k]))fail('snapshot_unavailable');
  const seen=current(main(v[k]));
  if(k==='sourceConfig'||k==='parsed'){
   if(seen!==state)fail('snapshot_conflict');
  }else if(state===MODE?seen!==MODE:!['absent','always'].includes(seen))
   fail('snapshot_conflict');
 }
 if(state===MODE)return {state:'already_configured',hash:v.hash};
 return {state:'ready',hash:v.hash,patch:{agents:{entries:{main:{contextInjection:MODE}}}}};
}
export function verifyMainContextPatch(before,after){
 try{
  if(!obj(before)||!obj(after)||current(main(before))!=='absent')return false;
  const expected=structuredClone(before);main(expected).contextInjection=MODE;
  return isDeepStrictEqual(expected,after);
 }catch{return false}
}
async function readDisk(){
 const s=await lstat(CONFIG);
 if(!s.isFile()||!owned(s)||s.size>MAX)fail('unsafe_config');
 const raw=await readFile(CONFIG);
 if(raw.length>MAX)fail('unsafe_config');
 try{return {raw,parsed:JSON.parse(raw.toString('utf8'))}}
 catch{fail('invalid_json')}
}
async function backup(raw){
 const root=join(HOME,'.openclaw'),p=await lstat(root);
 if(!p.isDirectory()||!owned(p)||await realpath(root)!==root)fail('unsafe_backup_parent');
 try{await mkdir(BACKUP,{mode:0o700})}catch(e){if(e.code!=='EEXIST')throw e}
 const s=await lstat(BACKUP);
 if(!s.isDirectory()||!owned(s)||await realpath(BACKUP)!==BACKUP)fail('unsafe_backup_dir');
 const name=join(BACKUP,'main-context-before-'+randomBytes(8).toString('hex')+'.json');
 const f=await open(name,'wx',0o600);
 try{await f.writeFile(raw);await f.sync()}finally{await f.close()}
 return true;
}
async function dryRun(patch,{cli=CLI,spawner=spawn}={}){
 return new Promise(resolve=>{
  let finished=false,child,timer;
  const done=v=>{if(!finished){finished=true;clearTimeout(timer);resolve(v)}};
  try{child=spawner(cli,['config','patch','--stdin','--dry-run'],
   {shell:false,stdio:['pipe','ignore','ignore']})}catch{return done(false)}
  child.on('error',()=>done(false));child.on('close',code=>done(code===0));
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(patch));
  timer=setTimeout(()=>{child.kill('SIGTERM');done(false)},25000);
 });
}
export async function patchMainContext({
 rpc=execNative,read=readDisk,save=backup,validate=dryRun
}={}){
 if(process.env.OPENCLAW_CONFIG_PATH||process.env.OPENCLAW_PROFILE||
    process.env.OPENCLAW_STATE_DIR)return audit('blocked','custom_profile_review');
 let before,plan;
 try{before=await read();plan=planMainContextPatch(before.parsed,await rpc('config.get',{}))}
 catch(e){return audit('blocked',safe(e))}
 if(plan.state==='already_configured')return audit('already_configured','no_write');
 try{
  if(!await validate(plan.patch))return audit('blocked','schema_dryrun_failed');
  await save(before.raw);
 }catch(e){return audit('blocked',safe(e))}
 let reply;
 try{reply=rpcEnvelope(await rpc('config.patch',{
  raw:JSON.stringify(plan.patch),baseHash:plan.hash,
  note:'Operator main Agent continuation context optimization only'
 }))}
 catch(e){return audit('inconclusive',patchFailureLabel(e),{backup:true})}
 if(!obj(reply)||reply.ok===false||!Array.isArray(reply.changedPaths))
  return audit('inconclusive','patch_receipt_invalid',{backup:true});
 try{
  const next=await read();
  if(!verifyMainContextPatch(before.parsed,next.parsed))
   return audit('inconclusive','disk_readback_mismatch',{backup:true});
  const live=rpcEnvelope(await rpc('config.get',{}));
  if(!['sourceConfig','parsed','config','resolved'].every(k=>
   obj(live?.[k])&&current(main(live[k]))===MODE))
   return audit('inconclusive','gateway_readback_mismatch',{backup:true});
 }catch{return audit('inconclusive','readback_unavailable',{backup:true})}
 return audit('applied','main_continuation_skip_enabled',{backup:true,verified:true});
}
async function invokedDirectly(){
 if(!process.argv[1])return false;
 try{return await realpath(process.argv[1])===await realpath(fileURLToPath(import.meta.url))}
 catch{return false}
}
if(await invokedDirectly()){
 patchMainContext().then(v=>process.stdout.write(JSON.stringify(v)+'\n'))
 .catch(()=>process.stdout.write(JSON.stringify(audit('blocked','unexpected_failure'))+'\n'));
}
