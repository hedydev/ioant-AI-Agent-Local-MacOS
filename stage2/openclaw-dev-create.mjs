#!/usr/bin/env node
// Fixed, separately approved one-shot OpenClaw infrastructure Agent creation.
// Never touches the Alice/Minecraft repos, allows arbitrary Agent IDs, or runs
// remote commands. A missing/uncertain acknowledgement is never retried.
import {lstat,mkdir,readFile,writeFile,realpath} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {execNative,rpcEnvelope,patchFailureLabel} from './openclaw-ollama-provision.mjs';
import {probeOpenClaw} from './openclaw-config-preflight.mjs';
import {schemaDryRun} from './openclaw-alice-create.mjs';
import {agentPolicy,verifyBoundAgentConfig,inspectBoundWorkspace} from './development-agent-route.mjs';

const AUDIT='IOANT_OPENCLAW_DEV_CREATE';
const ID='openclaw-dev';
const BASE='/Volumes/LunaDrive/DeveloperCache/openclaw-agents';
const CACHE='/Volumes/LunaDrive/DeveloperCache';
const VOLUME='/Volumes/LunaDrive';
const DIR=join(BASE,ID);
const CONFIG=join(homedir(),'.openclaw','openclaw.json');
const MAX=512*1024;
const HASH=/^[\x21-\x7e]{8,256}$/;
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const dirSafe=s=>s.isDirectory()&&!s.isSymbolicLink()&&(s.mode&0o077)===0&&
 (typeof process.getuid!=='function'||s.uid===process.getuid());
const fileSafe=s=>s.isFile()&&!s.isSymbolicLink()&&(s.mode&0o077)===0&&
 s.size<=MAX&&(typeof process.getuid!=='function'||s.uid===process.getuid());
const noteSafe=n=>typeof n==='string'&&/^[a-z_]{3,80}$/.test(n);
const status=(state,extra={})=>{
 const out={audit:AUDIT,schemaVersion:1,state};
 for(const key of ['backup','workspace','mainPreserved','alicePreserved','runtimeAcknowledged'])
  if(typeof extra[key]==='boolean')out[key]=extra[key];
 if(extra.agent===ID)out.agent=ID;
 if(extra.model==='ollama/gemma4:26b-a4b')out.model=extra.model;
 if(noteSafe(extra.note))out.note=extra.note;
 return out;
};
const roots=['sourceConfig','config','parsed','resolved'];
export function devPatch(){
 return {agents:{entries:{[ID]:agentPolicy(ID)}}};
}
export function compatibleDevRoster(snapshot){
 const doc=rpcEnvelope(snapshot);
 if(!obj(doc)||typeof doc.hash!=='string'||!HASH.test(doc.hash)||
    !verifyBoundAgentConfig(snapshot,'alice-ai'))return null;
 for(const name of roots){
  const root=doc[name];
  if(!obj(root?.agents?.entries)||
     Object.keys(root.agents.entries).sort().join(',')!=='alice-ai,main'||
     Object.hasOwn(root.agents.entries,ID))return null;
 }
 return {hash:doc.hash,roots:Object.fromEntries(roots.map(x=>[x,doc[x]]))};
}
export function verifyDevCreated(before,after){
 const doc=rpcEnvelope(after);
 if(!before||!obj(doc)||!verifyBoundAgentConfig(after,'alice-ai')||
    !verifyBoundAgentConfig(after,ID))return false;
 for(const name of roots){
  const orig=before.roots?.[name],root=doc[name];
  if(!obj(orig)||!obj(root))return false;
  const beforeEntries=orig.agents?.entries,afterEntries=root.agents?.entries;
  if(!obj(beforeEntries)||!obj(afterEntries)||
     Object.keys(afterEntries).sort().join(',')!=='alice-ai,main,openclaw-dev')return false;
  for(const field of ['main','alice-ai']){
   if(!isDeepStrictEqual(beforeEntries[field],afterEntries[field]))return false;
  }
  if(!isDeepStrictEqual(orig.agents?.ownership,root.agents?.ownership)||
     !isDeepStrictEqual(orig.agents?.defaults,root.agents?.defaults)||
     !isDeepStrictEqual(orig.bindings,root.bindings)||
     !isDeepStrictEqual(orig.models,root.models)||
     !isDeepStrictEqual(orig.gateway,root.gateway)||
     !isDeepStrictEqual(orig.plugins,root.plugins))return false;
  if(['sourceConfig','config'].includes(name)&&
     !isDeepStrictEqual(afterEntries[ID],agentPolicy(ID)))return false;
 }
 return true;
}
export async function inspectDevTarget({stat=lstat,canonical=realpath}={}){
 try{
  if(await canonical(VOLUME)!==VOLUME||
     await canonical(CACHE)!==CACHE||
     await canonical(BASE)!==BASE||
     !dirSafe(await stat(BASE)))return 'unsafe_parent';
  try{await stat(DIR);return 'target_exists'}
  catch(e){return e?.code==='ENOENT'?'missing_target_safe_parent':'target_unavailable'}
 }catch{return 'volume_or_cache_unavailable'}
}
export async function privateDevBackup(){
 const file=await lstat(CONFIG);
 if(!fileSafe(file))throw Error('unsafe_config_file');
 if(await realpath(VOLUME)!==VOLUME||await realpath(CACHE)!==CACHE||
    !dirSafe(await lstat(CACHE)))throw Error('unsafe_backup_cache');
 const backupDir=join(CACHE,'openclaw-agent-backups');
 try{await mkdir(backupDir,{mode:0o700})}catch(e){if(e?.code!=='EEXIST')throw e}
 if(await realpath(backupDir)!==backupDir||!dirSafe(await lstat(backupDir)))
  throw Error('unsafe_backup_directory');
 const bytes=await readFile(CONFIG);
 if(bytes.length>MAX)throw Error('unsafe_config_bytes');
 await writeFile(join(backupDir,'openclaw-before-dev-'+randomBytes(8).toString('hex')+'.json'),
  bytes,{mode:0o600,flag:'wx'});
 return true;
}
export async function createDevWorkspace(){
 if(await inspectDevTarget()!=='missing_target_safe_parent')
  throw Error('unsafe_dev_target');
 await mkdir(DIR,{mode:0o700});
 if(await realpath(DIR)!==DIR||!dirSafe(await lstat(DIR)))
  throw Error('unsafe_dev_workspace');
 const instructions='# OpenClaw Dev\n\nYou are a text-only, restricted development advisor for ChatGPT-led OpenClaw infrastructure planning and review. Offer assumptions, risks, tests and alternative designs. You have no tools, cannot inspect local files, execute shell or Git, access services, change configurations, or contact other agents. Never claim execution or runtime proof. OpenClaw watcher performs separately approved fixed commands; your suggestions are never executable instructions to the watcher.\n';
 await writeFile(join(DIR,'AGENTS.md'),instructions,{mode:0o600,flag:'wx'});
 return true;
}
export async function createOpenClawDev({preflight=probeOpenClaw,rpc=execNative,
 workspaceCheck=inspectDevTarget,aliceWorkspace=inspectBoundWorkspace,dryRun=schemaDryRun,
 backup=privateDevBackup,createDir=createDevWorkspace}={}){
 let saved=false,space=false;
 try{
  if(process.env.OPENCLAW_CONFIG_PATH||process.env.OPENCLAW_STATE_DIR||
     process.env.OPENCLAW_PROFILE)return status('blocked',{note:'custom_profile_review'});
  const p=await preflight();
  if(p?.config!=='regular_private'||p?.ollama!=='reachable'||
     p?.provider!=='target'||p?.agents!=='present'||
     !['gemma4:26b-a4b','gpt-oss:20b'].every(m=>p.installed?.includes(m)))
    return status('blocked',{note:'preflight_changed'});
  if(await workspaceCheck()!=='missing_target_safe_parent')
    return status('blocked',{note:'workspace_not_empty'});
  const before=compatibleDevRoster(await rpc('config.get',{}));
  if(!before)return status('blocked',{note:'roster_or_revision_changed'});
  if(await aliceWorkspace('alice-ai')!=='present_private')
    return status('blocked',{note:'alice_workspace_unavailable'});
  const patch=devPatch();
  if(!await dryRun(patch))return status('blocked',{note:'schema_dryrun_failed'});
  saved=await backup();
  space=await createDir();
  // The sole write uses a Gateway revision lock. No retry even if receipt is lost.
  let result;
  try{result=rpcEnvelope(await rpc('config.patch',{
   raw:JSON.stringify(patch),baseHash:before.hash,
   note:'Operator authorized restricted OpenClaw Dev Agent creation'
  }));}
  catch(e){return status('inconclusive',{backup:saved,workspace:space,note:patchFailureLabel(e)});}
  if(!obj(result)||result.ok===false||!Array.isArray(result.changedPaths)||
     !result.changedPaths.every(x=>typeof x==='string')||
     !result.changedPaths.some(x=>x.startsWith('agents.')))
   return status('inconclusive',{backup:saved,workspace:space,note:'patch_reply_invalid'});
  let after;
  try{after=await rpc('config.get',{});}
  catch{return status('inconclusive',{backup:saved,workspace:space,note:'readback_unavailable'});}
  if(!verifyDevCreated(before,after))
   return status('inconclusive',{backup:saved,workspace:space,note:'readback_not_confirmed'});
  return status('applied',{backup:true,workspace:true,mainPreserved:true,
   alicePreserved:true,runtimeAcknowledged:true,agent:ID,model:'ollama/gemma4:26b-a4b'});
 }catch(e){
  return status(saved||space?'inconclusive':'blocked',{
   backup:saved,workspace:space,
   note:noteSafe(e?.message)?e.message:'precondition_or_filesystem_failed'});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 createOpenClawDev().then(r=>console.log(JSON.stringify(r))).catch(()=>
  console.log(JSON.stringify(status('inconclusive',{note:'unexpected_error'}))));
}
