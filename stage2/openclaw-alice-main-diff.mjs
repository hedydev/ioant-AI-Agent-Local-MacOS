#!/usr/bin/env node
// Read-only follow-up to Alice's inconclusive create: identify exactly which
// allowlisted main-agent fields differ from the private before-image. Never
// emit values, unknown field names, raw config, backup filename or credentials.
import {lstat,readdir,readFile,realpath} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {execNative,rpcEnvelope} from './openclaw-ollama-provision.mjs';

const AUDIT='IOANT_ALICE_MAIN_DIFF';
const CONFIG=join(homedir(),'.openclaw','openclaw.json');
const BACKUPS='/Volumes/LunaDrive/DeveloperCache/openclaw-agent-backups';
const MAX=512*1024;
// All output field labels below are schema-known literals, never read from user
// configuration. Values and names of arbitrary authored fields remain private.
const KNOWN=[
 'name','description','default','workspace','cwd','agentDir','model',
 'utilityModel','decisionModel','models','modelPolicy','thinkingDefault',
 'verboseDefault','toolProgressDetail','reasoningDefault','fastModeDefault',
 'contextInjection','bootstrapMaxChars','bootstrapTotalMaxChars','experimental',
 'skills','subagents','embeddedAgent','params','runtime','memory','humanDelay',
 'typingMode','tts','skillsLimits','contextLimits','heartbeat','identity',
 'groupChat','sandbox','tools'
];
const NESTED={
 identity:['name','theme','emoji','avatar'],
 model:['primary','fallbacks'],
 models:[],
 modelPolicy:['allow'],
 tools:['profile','allow','alsoAllow','deny','codeMode','exec','fs','elevated','agentToAgent',
   'sandbox','byProvider','toolsBySender','message','swarm','github','loopDetection'],
 sandbox:['mode','workspaceAccess','docker','browser','tools','prune'],
 subagents:['allowAgents','model','thinking','delegationMode','requireAgentId'],
 heartbeat:['every','model','target','session','directPolicy','prompt','timeoutSeconds'],
 memory:['search'],
 runtime:['type','acp']
};
function object(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)}
function privateFile(st){return st.isFile()&&!st.isSymbolicLink()&&(st.mode&0o077)===0&&
  st.size<=MAX&&(typeof process.getuid!=='function'||st.uid===process.getuid())}
function privateDirectory(st){return st.isDirectory()&&!st.isSymbolicLink()&&(st.mode&0o077)===0&&
  (typeof process.getuid!=='function'||st.uid===process.getuid())}
const own=(o,k)=>object(o)&&Object.hasOwn(o,k);
const changed=(a,b,k)=>own(a,k)!==own(b,k)||!isDeepStrictEqual(a?.[k],b?.[k]);
function kind(before,after,key){
 if(!own(before,key))return 'added';
 if(!own(after,key))return 'removed';
 return 'modified';
}
export function summarizeMainDifference(before,after){
 if(!object(before)||!object(after))return {status:'missing_main'};
 const a=Object.keys(before),b=Object.keys(after);
 if(a.length>100||b.length>100)return {status:'too_many_fields'};
 const known=new Set(KNOWN);
 const changedKnown=KNOWN.filter(key=>changed(before,after,key))
  .sort((a,b)=>{
   const critical=['model','tools','workspace','agentDir','identity','default','runtime','modelPolicy'];
   const ai=critical.indexOf(a),bi=critical.indexOf(b);
   return (ai<0?100:ai)-(bi<0?100:bi);
  });
 const unknownChanged=[...new Set([...a,...b])].filter(k=>!known.has(k)&&changed(before,after,k));
 const fields=changedKnown.slice(0,8).map(key=>{
  const f={field:key,change:kind(before,after,key)};
  if(f.change!=='modified'||!Object.hasOwn(NESTED,key))return f;
  const old=before[key],now=after[key],whitelist=NESTED[key];
  if(!object(old)||!object(now))return f;
  const subChanged=whitelist.filter(k=>changed(old,now,k));
  const subUnknown=[...new Set([...Object.keys(old),...Object.keys(now)])]
   .filter(k=>!whitelist.includes(k)&&changed(old,now,k));
  return {...f,subfields:subChanged.slice(0,5),
   otherSubfieldChanges:Math.min(subUnknown.length+Math.max(0,subChanged.length-5),99)};
 });
 return {status:changedKnown.length===0&&unknownChanged.length===0?'equal':'changed',
  beforeFieldCount:a.length,afterFieldCount:b.length,
  fields,remainingKnownChanges:Math.max(0,changedKnown.length-fields.length),
  otherFieldChanges:Math.min(unknownChanged.length,99)};
}
export async function readPrivateBeforeAfter({stat=lstat,list=readdir,canonical=realpath,
 read=readFile}={}){
 try{
  if((await canonical(BACKUPS))!==BACKUPS||!privateDirectory(await stat(BACKUPS)))
   return {status:'unsafe_backup_directory'};
  const backups=(await list(BACKUPS))
   .filter(n=>/^openclaw-before-alice-[0-9a-f]{16}\.json$/.test(n));
  if(backups.length!==1)return {status:backups.length===0?'backup_missing':'backup_ambiguous'};
  const file=join(BACKUPS,backups[0]);
  if(!privateFile(await stat(file))||!privateFile(await stat(CONFIG)))
   return {status:'unsafe_file'};
  const [oldBytes,newBytes]=await Promise.all([read(file),read(CONFIG)]);
  if(oldBytes.length>MAX||newBytes.length>MAX)return {status:'too_large'};
  let oldDoc,newDoc;
  try{oldDoc=JSON.parse(oldBytes.toString('utf8'));newDoc=JSON.parse(newBytes.toString('utf8'))}
  catch{return {status:'non_json_config'};}
  if(!object(oldDoc)||!object(newDoc))return {status:'invalid_json_root'};
  const diff=summarizeMainDifference(oldDoc.agents?.entries?.main,newDoc.agents?.entries?.main);
  return {status:'compared',main:diff,
   otherAgentsBefore:Object.keys(oldDoc.agents?.entries??{}).filter(k=>k!=='main').length,
   otherAgentsAfter:Object.keys(newDoc.agents?.entries??{}).filter(k=>k!=='main').length,
   mainOwnerConfirmed:newDoc.agents?.defaults?.systemAgent?.agentId==='main',
   modelDefaultsUnchanged:isDeepStrictEqual(oldDoc.agents?.defaults?.model,newDoc.agents?.defaults?.model),
   bindingsUnchanged:isDeepStrictEqual(oldDoc.bindings,newDoc.bindings),
   providersUnchanged:isDeepStrictEqual(oldDoc.models?.providers,newDoc.models?.providers)};
 }catch{return {status:'unavailable'}}
}
export function classifyGatewayMain(raw){
 const doc=rpcEnvelope(raw);
 if(!object(doc)||doc.valid===false||doc.exists===false)return {status:'invalid'};
 const roots={};
 for(const name of ['sourceConfig','config','parsed','resolved']){
  const c=doc[name];
  if(!object(c)){roots[name]='missing';continue}
  const agents=c.agents?.entries;
  roots[name]=!object(agents)?'unavailable':
   object(agents.main)&&object(agents['alice-ai'])?'main_and_alice':
   object(agents.main)?'main_only':object(agents['alice-ai'])?'alice_only':'neither';
 }
 return {status:'observed',valid:doc.valid===true,roots};
}
export async function diagnoseMainDiff({disk=readPrivateBeforeAfter,call=execNative}={}){
 const base={audit:AUDIT,schemaVersion:1,readOnly:true};
 try{
  if(process.env.OPENCLAW_CONFIG_PATH||process.env.OPENCLAW_STATE_DIR||process.env.OPENCLAW_PROFILE)
   return {...base,status:'custom_profile_review'};
  const d=await disk();
  const gateway=classifyGatewayMain(await call('config.get',{}));
  return {...base,status:d.status==='compared'&&gateway.status==='observed'?'observed':'review_required',
   disk:d,gateway};
 }catch{return {...base,status:'unavailable'}}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 diagnoseMainDiff().then(x=>console.log(JSON.stringify(x))).catch(()=>
  console.log(JSON.stringify({audit:AUDIT,schemaVersion:1,readOnly:true,status:'unavailable'})));
}
