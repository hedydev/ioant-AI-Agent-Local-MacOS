#!/usr/bin/env node
// Agent creation planning: private readonly config structure and workspace
// preflight only. No Gateway mutations, workspace creation or raw config output.
import {lstat,realpath} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {execNative,rpcEnvelope} from './openclaw-ollama-provision.mjs';
import {probeOpenClaw} from './openclaw-config-preflight.mjs';

const AUDIT='IOANT_ALICE_AGENT_PREFLIGHT';
const VOLUME='/Volumes/LunaDrive';
const CACHE=join(VOLUME,'DeveloperCache');
const TARGET=join(CACHE,'openclaw-agents','alice-ai');
const OWNERSHIP=new Set(['explicit']);
function object(v){return !!v&&typeof v==='object'&&!Array.isArray(v);}
function own(v,k){return object(v)&&Object.hasOwn(v,k);}
function ownership(v){return OWNERSHIP.has(v)?v:v===undefined?'unset':'other';}
function bound(v){return Array.isArray(v)&&v.some(x=>x?.agentId==='alice-ai');}
export function classifyAgentSnapshot(raw){
 const doc=rpcEnvelope(raw);
 if(!object(doc)||doc.valid===false||doc.exists===false)return {status:'invalid_snapshot'};
 const roots=['sourceConfig','config','parsed','resolved'].map(name=>[name,doc[name]]);
 if(!roots.some(([,v])=>object(v)))return {status:'missing_sources'};
 const rows={};
 for(const [name,config] of roots){
  if(!object(config)){rows[name]={state:'missing'};continue;}
  const a=config.agents;
  if(a!==undefined&&!object(a)){rows[name]={state:'invalid_agents'};continue;}
  const entries=a?.entries;
  if(entries!==undefined&&!object(entries)){rows[name]={state:'invalid_entries'};continue;}
  const ids=Object.keys(entries??{});
  if(ids.length>100){rows[name]={state:'too_many_entries'};continue;}
  const hasMain=ids.includes('main');
  const hasAlice=ids.includes('alice-ai');
  const others=ids.filter(id=>id!=='main'&&id!=='alice-ai').length;
  const main=entries?.main;
  rows[name]={state:'observed',entryCount:ids.length,
   mainExplicit:hasMain,aliceExplicit:hasAlice,otherCount:others,
   ownerMode:ownership(a?.ownership),
   mainDefaultFlag:object(main)?main.default===true:false,
   systemAgentConfigured:typeof a?.defaults?.systemAgent?.agentId==='string',
   hasBindingsForAlice:bound(config.bindings)};
 }
 return {status:'observed',roots:rows};
}
function safeDir(st){return st.isDirectory()&&!st.isSymbolicLink()&&
  (st.mode&0o022)===0&&(typeof process.getuid!=='function'||st.uid===process.getuid());}
export async function inspectWorkspace({stat=lstat,canonical=realpath}={}){
 try{
  const disk=await canonical(VOLUME),cache=await canonical(CACHE);
  if(!cache.startsWith(disk+sep)||!safeDir(await stat(CACHE)))return {status:'unsafe_cache'};
  // Existing workspace would require separate user review; never overwrite it.
  try{
   await stat(TARGET);
   return {status:'target_exists'};
  }catch(e){
   if(e?.code!=='ENOENT')return {status:'target_unavailable'};
  }
  return {status:'missing_target_safe_parent'};
 }catch{return {status:'volume_or_cache_unavailable'}}
}
export async function preflightAlice({preflight=probeOpenClaw,rpc=execNative,
  workspace=inspectWorkspace}={}){
 const out={audit:AUDIT,schemaVersion:1,readOnly:true};
 try{
  if(process.env.OPENCLAW_CONFIG_PATH||process.env.OPENCLAW_STATE_DIR||process.env.OPENCLAW_PROFILE)
   return {...out,status:'custom_profile_review'};
  const p=await preflight();
  if(p?.config!=='regular_private'||p?.ollama!=='reachable'||p?.provider!=='target'||
    p?.agents!=='absent'||!['gemma4:26b-a4b','gpt-oss:20b'].every(m=>p.installed?.includes(m)))
   return {...out,status:'precondition_blocked'};
  const doc=classifyAgentSnapshot(await rpc('config.get',{}));
  if(doc.status!=='observed')return {...out,status:'snapshot_unavailable'};
  const folder=await workspace();
  const roots=doc.roots;
  const snapshots=['sourceConfig','config','parsed','resolved'].map(k=>roots[k]);
  const consistent=snapshots.every(x=>x.state==='observed'&&!x.aliceExplicit&&!x.hasBindingsForAlice);
  const agentLayout=snapshots.some(x=>x.otherCount>0)?'has_other_agents':
    snapshots.some(x=>x.mainExplicit)?'main_authored_in_some_roots':'implicit_or_empty_main';
  return {...out,status:'observed',roster:doc,workspace:folder,
    safeToPlan:consistent&&folder.status==='missing_target_safe_parent',
    agentLayout};
 }catch{return {...out,status:'diagnostic_unavailable'}}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 preflightAlice().then(x=>console.log(JSON.stringify(x))).catch(()=>
   console.log(JSON.stringify({audit:AUDIT,schemaVersion:1,readOnly:true,status:'diagnostic_unavailable'})));
}
