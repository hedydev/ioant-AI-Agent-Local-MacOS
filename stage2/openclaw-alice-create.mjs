#!/usr/bin/env node
// Separately authorized, one-shot Alice text Agent registration for OpenClaw
// v2026.10.6. Never accepts user-supplied IDs, paths, model or tool policy.
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {lstat,mkdir,readFile,writeFile,realpath} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {homedir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {execNative,rpcEnvelope,patchFailureLabel} from './openclaw-ollama-provision.mjs';
import {probeOpenClaw} from './openclaw-config-preflight.mjs';
import {classifyAgentSnapshot,inspectWorkspace} from './openclaw-alice-agent-preflight.mjs';

const AUDIT='IOANT_OPENCLAW_ALICE_CREATE';
const ID='alice-ai';
const VOLUME='/Volumes/LunaDrive';
const CACHE=join(VOLUME,'DeveloperCache');
const PARENT=join(CACHE,'openclaw-agents');
const WORKSPACE=join(PARENT,ID);
const CONFIG=join(homedir(),'.openclaw','openclaw.json');
const CLI=join(homedir(),'.openclaw','bin','openclaw');
const exec=promisify(execFile);
const MAX=512*1024;
const OPAQUE=/^[\x21-\x7e]{8,256}$/;
const AGENT=Object.freeze({
 name:'AliceAI',
 workspace:WORKSPACE,
 model:'ollama/gemma4:26b-a4b',
 modelPolicy:{allow:['ollama/gemma4:26b-a4b','ollama/gpt-oss:20b']},
 tools:{profile:'minimal',deny:['*'],
  codeMode:false,exec:{mode:'deny'},fs:{workspaceOnly:true},
  elevated:{enabled:false},agentToAgent:{send:[]}},
 subagents:{allowAgents:[]},
 skills:[]
});
const INSTRUCTIONS='# AliceAI\n\nLocal text-only model validation. Never request or perform terminal, file, network, messaging, browser, Gateway administration, or Minecraft actions. No tools are authorized. Answer only the explicit question.\n';
function object(v){return !!v&&typeof v==='object'&&!Array.isArray(v);}
function own(v,k){return object(v)&&Object.hasOwn(v,k);}
function regular(s){return s.isFile()&&!s.isSymbolicLink()&&(s.mode&0o077)===0&&
 (typeof process.getuid!=='function'||s.uid===process.getuid())&&s.size<=MAX;}
function safeDir(s){return s.isDirectory()&&!s.isSymbolicLink()&&(s.mode&0o077)===0&&
 (typeof process.getuid!=='function'||s.uid===process.getuid());}
function status(state,details={}){
 const out={audit:AUDIT,schemaVersion:1,state};
 for(const [k,v] of Object.entries(details)){
  if(k==='note'&&typeof v==='string'&&/^[a-z_]{3,80}$/.test(v))out.note=v;
  if(['backup','workspace','runtimeAcknowledged','mainPreserved'].includes(k)&&typeof v==='boolean')out[k]=v;
  if(k==='agent'&&v===ID)out.agent=ID;
  if(k==='model'&&v==='ollama/gemma4:26b-a4b')out.model=v;
 }
 return out;
}
export function compatibleRoster(value){
 const raw=rpcEnvelope(value);
 if(!object(raw)||raw.valid===false||raw.exists===false||typeof raw.hash!=='string'||!OPAQUE.test(raw.hash))return null;
 const src=raw.sourceConfig;
 const cfg=raw.config;
 const eff=raw.resolved;
 if(![src,cfg,eff].every(object))return null;
 const rc=classifyAgentSnapshot(raw);
 if(rc.status!=='observed')return null;
 for(const name of ['sourceConfig','config','resolved']){
  const state=rc.roots[name];
  if(state?.state!=='observed'||state.entryCount!==1||
   !state.mainExplicit||state.aliceExplicit||state.otherCount!==0||
   state.ownerMode!=='unset'||state.mainDefaultFlag||state.systemAgentConfigured||
   state.hasBindingsForAlice)return null;
 }
 const parsed=rc.roots.parsed;
 if(!parsed||parsed.state!=='observed'||parsed.aliceExplicit||parsed.hasBindingsForAlice||
    parsed.otherCount!==0||parsed.entryCount>1)return null;
 // No change of explicit main definition, channel bindings, default model or
 // existing workspace via the agent creation patch.
 const agent=src.agents;
 if(!object(agent)||!object(agent.entries)||!own(agent.entries,'main')||
    !object(agent.entries.main))return null;
 if(agent.ownership!==undefined||agent.defaults?.systemAgent!==undefined)return null;
 if(src.bindings!==undefined&&!Array.isArray(src.bindings))return null;
 return {hash:raw.hash,main:agent.entries.main,bindings:src.bindings};
}
export function fixedPatch(){
 return {agents:{ownership:'explicit',
  defaults:{systemAgent:{agentId:'main'}},
  entries:{[ID]:structuredClone(AGENT)}}};
}
export function verifyCreated(before,response){
 const doc=rpcEnvelope(response);
 if(!object(doc)||doc.valid===false||doc.exists===false)return false;
 for(const key of ['sourceConfig','config','resolved']){
  const root=doc[key];
  if(!object(root)||root.agents?.ownership!=='explicit'||
    root.agents?.defaults?.systemAgent?.agentId!=='main'||
    !object(root.agents?.entries)||!isDeepStrictEqual(root.agents.entries.main,before.main)){
    return false;
  }
  const alice=root.agents.entries[ID];
  if(!object(alice)||alice.workspace!==WORKSPACE||
    alice.model!=='ollama/gemma4:26b-a4b'||!isDeepStrictEqual(alice.tools,AGENT.tools)||
    !isDeepStrictEqual(alice.modelPolicy,AGENT.modelPolicy)||
    !isDeepStrictEqual(root.bindings,before.bindings))return false;
 }
 return true;
}
function scrubEnv(){
 const env={...process.env};
 for(const k of ['OPENCLAW_GATEWAY_TOKEN','OPENCLAW_GATEWAY_PASSWORD','OPENCLAW_GATEWAY_URL',
  'NODE_TEST_CONTEXT','IOANT_LOOP_LOG_FILE'])delete env[k];
 return env;
}
export async function schemaDryRun(patch,{spawner=spawn,bin=CLI}={}){
 return new Promise(done=>{
  let finished=false;
  const complete=v=>{if(!finished){finished=true;clearTimeout(timer);done(v)}};
  let child;let timer;
  try{child=spawner(bin,['config','patch','--stdin','--dry-run'],
    {env:scrubEnv(),shell:false,stdio:['pipe','ignore','ignore']});}
  catch{return complete(false)}
  child.on('error',()=>complete(false));
  child.on('close',code=>complete(code===0));
  child.stdin?.on('error',()=>{});
  child.stdin?.end(JSON.stringify(patch));
  timer=setTimeout(()=>{child.kill('SIGTERM');complete(false)},25000);
 });
}
export async function privateBackup(){
 const stat=await lstat(CONFIG);
 if(!regular(stat))throw Error('unsafe_local_config');
 const disk=await realpath(VOLUME),cache=await realpath(CACHE);
 const cacheStat=await lstat(CACHE);
 if(!cache.startsWith(disk+sep)||!cacheStat.isDirectory()||
  cacheStat.isSymbolicLink()||(cacheStat.mode&0o022)!==0||
  (typeof process.getuid==='function'&&cacheStat.uid!==process.getuid()))
  throw Error('unsafe_backup_cache');
 const dir=join(CACHE,'openclaw-agent-backups');
 try{await mkdir(dir,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e}
 if(!safeDir(await lstat(dir))||await realpath(dir)!==dir)throw Error('unsafe_backup_directory');
 const bytes=await readFile(CONFIG);
 if(bytes.length>MAX)throw Error('unsafe_config_bytes');
 await writeFile(join(dir,'openclaw-before-alice-'+randomBytes(8).toString('hex')+'.json'),
   bytes,{flag:'wx',mode:0o600});
 return true;
}
export async function createWorkspace(){
 if((await inspectWorkspace()).status!=='missing_target_safe_parent')throw Error('unsafe_workspace');
 try{await mkdir(PARENT,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e}
 if(!safeDir(await lstat(PARENT))||await realpath(PARENT)!==PARENT)throw Error('unsafe_workspace_parent');
 await mkdir(WORKSPACE,{mode:0o700});
 if(!safeDir(await lstat(WORKSPACE))||await realpath(WORKSPACE)!==WORKSPACE)throw Error('unsafe_workspace_created');
 await writeFile(join(WORKSPACE,'AGENTS.md'),INSTRUCTIONS,{flag:'wx',mode:0o600});
 return true;
}
export async function createAlice({preflight=probeOpenClaw,rpc=execNative,
 workspaceCheck=inspectWorkspace,dryRun=schemaDryRun,backup=privateBackup,
 createDir=createWorkspace}={}){
 let saved=false,space=false;
 try{
  if(process.env.OPENCLAW_CONFIG_PATH||process.env.OPENCLAW_STATE_DIR||process.env.OPENCLAW_PROFILE)
   return status('blocked',{note:'custom_profile_review'});
  const p=await preflight();
  if(p?.config!=='regular_private'||p?.ollama!=='reachable'||p?.provider!=='target'||
    p?.agents!=='absent'||!['gemma4:26b-a4b','gpt-oss:20b'].every(m=>p.installed?.includes(m)))
   return status('blocked',{note:'preflight_changed'});
  if((await workspaceCheck()).status!=='missing_target_safe_parent')
   return status('blocked',{note:'workspace_not_empty'});
  const prior=compatibleRoster(await rpc('config.get',{}));
  if(!prior)return status('blocked',{note:'roster_or_revision_changed'});
  const patch=fixedPatch();
  if(!await dryRun(patch))return status('blocked',{note:'schema_dryrun_failed'});
  saved=await backup();
  space=await createDir();
  // One revision-guarded write only. No retry on lost or negative receipt.
  let result;
  try{result=rpcEnvelope(await rpc('config.patch',{
   raw:JSON.stringify(patch),baseHash:prior.hash,
   note:'Operator approved restricted Alice text Agent creation'
  }));}
  catch(e){return status('inconclusive',{backup:saved,workspace:space,note:patchFailureLabel(e)});}
  if(!object(result)||result.ok===false||!Array.isArray(result.changedPaths)||
    !result.changedPaths.every(x=>typeof x==='string')||
    !result.changedPaths.some(x=>x.startsWith('agents.')))
   return status('inconclusive',{backup:saved,workspace:space,note:'patch_reply_invalid'});
  let after;
  try{after=await rpc('config.get',{});}catch{
   return status('inconclusive',{backup:saved,workspace:space,note:'readback_unavailable'});
  }
  if(!verifyCreated(prior,after))
   return status('inconclusive',{backup:saved,workspace:space,note:'readback_not_confirmed'});
  return status('applied',{backup:saved,workspace:space,agent:ID,
   model:'ollama/gemma4:26b-a4b',mainPreserved:true,runtimeAcknowledged:true});
 }catch(e){
  const note=/^[a-z_]{3,80}$/.test(e?.message??'')?e.message:'precondition_or_filesystem_failed';
  return status(saved||space?'inconclusive':'blocked',
   {backup:saved,workspace:space,note});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 createAlice().then(r=>console.log(JSON.stringify(r))).catch(()=>
  console.log(JSON.stringify(status('blocked',{note:'unexpected_error'}))));
}
