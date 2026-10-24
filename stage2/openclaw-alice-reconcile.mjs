#!/usr/bin/env node
// Alice post-create reconciliation. Strictly read-only, after an ambiguous write.
// Never leaks raw Gateway config, backup bytes, filenames, tokens, other agent names.
import {lstat,readFile,readdir,realpath} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {execNative,rpcEnvelope} from './openclaw-ollama-provision.mjs';
import {fixedPatch} from './openclaw-alice-create.mjs';

const AUDIT='IOANT_OPENCLAW_ALICE_RECONCILE';
const ID='alice-ai';
const CONFIG=join(homedir(),'.openclaw','openclaw.json');
const CACHE='/Volumes/LunaDrive/DeveloperCache';
const BACKUPS=join(CACHE,'openclaw-agent-backups');
const WORKSPACE=join(CACHE,'openclaw-agents',ID);
const MAX=512*1024;
function object(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
function flag(v){return v===true?'yes':v===false?'no':'unknown'}
function privateFile(st){return st.isFile()&&!st.isSymbolicLink()&&
 (st.mode&0o077)===0&&st.size<=MAX&&
 (typeof process.getuid!=='function'||st.uid===process.getuid())}
function privateDirectory(st){return st.isDirectory()&&!st.isSymbolicLink()&&
 (st.mode&0o077)===0&&(typeof process.getuid!=='function'||st.uid===process.getuid())}
function onlyFlags(model){
 const expected=fixedPatch().agents.entries[ID];
 if(!object(model))return {status:'missing'};
 return {status:'present',
  model:flag(model.model===expected.model),
  workspace:flag(model.workspace===expected.workspace),
  policyExact:flag(isDeepStrictEqual(model.tools,expected.tools)),
  denyAll:flag(Array.isArray(model.tools?.deny)&&model.tools.deny.includes('*')),
  execDenied:flag(model.tools?.exec?.mode==='deny'),
  codeModeOff:flag(model.tools?.codeMode===false),
  elevatedOff:flag(model.tools?.elevated?.enabled===false),
  modelAllow:flag(isDeepStrictEqual(model.modelPolicy,expected.modelPolicy)),
  subagentsDenied:flag(isDeepStrictEqual(model.subagents?.allowAgents,[])),
  skillsEmpty:flag(isDeepStrictEqual(model.skills,[]))
 };
}
export function classifyLive(response){
 const doc=rpcEnvelope(response);
 if(!object(doc))return {status:'invalid_envelope'};
 const validity=doc.valid===false?'invalid':doc.valid===true?'valid':'unknown';
 const roots={};
 for(const name of ['sourceConfig','config','parsed','resolved']){
  const root=doc[name];
  if(!object(root)){roots[name]={status:'missing'};continue;}
  const agents=root.agents;
  const entries=agents?.entries;
  if((agents!==undefined&&!object(agents))||
     (entries!==undefined&&!object(entries))){
   roots[name]={status:'invalid_roster'};continue;
  }
  const names=Object.keys(entries??{});
  roots[name]={status:'observed',
   main:flag(Object.hasOwn(entries??{},'main')),
   alice:onlyFlags(entries?.[ID]),
   otherAgents:names.filter(n=>n!=='main'&&n!==ID).length,
   explicitOwnership:flag(agents?.ownership==='explicit'),
   mainSystemOwner:flag(agents?.defaults?.systemAgent?.agentId==='main'),
   aliceBinding:flag(Array.isArray(root.bindings)&&root.bindings.some(b=>b?.agentId===ID))
  };
 }
 const flags={status:'observed',validity,exists:doc.exists===true?'yes':
  doc.exists===false?'no':'unknown',roots};
 return flags;
}
function compareObject(a,b){return isDeepStrictEqual(a,b)?'yes':'no';}
export function compareDiskSnapshots(before,after){
 if(!object(before)||!object(after))return {status:'unparsed'};
 return {status:'compared',
  mainPreserved:object(before.agents?.entries?.main)&&object(after.agents?.entries?.main)
   ?compareObject(before.agents.entries.main,after.agents.entries.main):'no',
  bindingsPreserved:compareObject(before.bindings,after.bindings),
  modelDefaultsPreserved:compareObject(before.agents?.defaults?.model,after.agents?.defaults?.model),
  modelProvidersPreserved:compareObject(before.models?.providers,after.models?.providers),
  systemMain:flag(after.agents?.defaults?.systemAgent?.agentId==='main'),
  alicePersisted:flag(object(after.agents?.entries?.[ID])),
  otherAgentsIntroduced:(()=>{
    const b=Object.keys(before.agents?.entries??{}).filter(k=>k!=='main'&&k!==ID).length;
    const a=Object.keys(after.agents?.entries??{}).filter(k=>k!=='main'&&k!==ID).length;
    return a>b?'yes':'no';
  })()
 };
}
export async function inspectDisk({stat=lstat,list=readdir,canonical=realpath,read=readFile}={}){
 try{
  const dir=await canonical(BACKUPS);
  if(dir!==BACKUPS||!privateDirectory(await stat(BACKUPS)))return {status:'backup_dir_unsafe'};
  const names=(await list(BACKUPS)).filter(n=>/^openclaw-before-alice-[0-9a-f]{16}\.json$/.test(n));
  if(names.length!==1)return {status:names.length===0?'backup_missing':'backup_ambiguous'};
  const beforePath=join(BACKUPS,names[0]);
  if(!privateFile(await stat(beforePath))||!privateFile(await stat(CONFIG)))
   return {status:'unsafe_file'};
  const bytes=await Promise.all([read(beforePath),read(CONFIG)]);
  if(bytes.some(b=>b.length>MAX))return {status:'oversized'};
  let before,after;
  try{before=JSON.parse(bytes[0].toString('utf8'));after=JSON.parse(bytes[1].toString('utf8'))}
  catch{return {status:'json5_or_non_json'};}
  return compareDiskSnapshots(before,after);
 }catch{return {status:'unavailable'}}
}
export async function inspectWorkspace({stat=lstat,canonical=realpath}={}){
 try{
  if((await canonical(WORKSPACE))!==WORKSPACE||!privateDirectory(await stat(WORKSPACE))||
     !privateFile(await stat(join(WORKSPACE,'AGENTS.md'))))
   return 'unsafe_or_missing';
  return 'present_private';
 }catch{return 'unavailable'}
}
export function summarizeReconciliation(live,disk,workspace){
 const source=live.roots?.sourceConfig;
 const active=live.roots?.config;
 const a=source?.alice;
 const goodSource=live.status==='observed'&&live.validity!=='invalid'&&
   source?.status==='observed'&&source.main==='yes'&&a?.status==='present'&&
   a.model==='yes'&&a.workspace==='yes'&&a.denyAll==='yes'&&
   a.policyExact==='yes'&&a.modelAllow==='yes'&&
   source.explicitOwnership==='yes'&&source.mainSystemOwner==='yes'&&
   source.otherAgents===0&&source.aliceBinding==='no';
 const activePresent=active?.alice?.status==='present';
 const diskSafe=disk.status==='compared'&&disk.mainPreserved==='yes'&&
   disk.bindingsPreserved==='yes'&&disk.modelDefaultsPreserved==='yes'&&
   disk.modelProvidersPreserved==='yes'&&disk.systemMain==='yes'&&
   disk.alicePersisted==='yes'&&disk.otherAgentsIntroduced==='no';
 return {status:goodSource&&activePresent&&diskSafe&&workspace==='present_private'
   ?'verified_persisted':'review_required',
  gatewaySourcePolicyConfirmed:flag(goodSource),
  diskPreservationConfirmed:flag(diskSafe)
 };
}
export async function reconcileAlice({call=execNative,disk=inspectDisk,
  workspace=inspectWorkspace}={}){
 const out={audit:AUDIT,schemaVersion:1,readOnly:true};
 try{
  if(process.env.OPENCLAW_CONFIG_PATH||process.env.OPENCLAW_STATE_DIR||process.env.OPENCLAW_PROFILE)
   return {...out,status:'custom_profile_review'};
  const gateway=classifyLive(await call('config.get',{}));
  const local=await disk();
  const space=await workspace();
  return {...out,...summarizeReconciliation(gateway,local,space),
   gateway,local,workspace:space};
 }catch{return {...out,status:'diagnostic_unavailable'}}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 reconcileAlice().then(r=>console.log(JSON.stringify(r))).catch(()=>
  console.log(JSON.stringify({audit:AUDIT,schemaVersion:1,readOnly:true,status:'diagnostic_unavailable'})));
}
