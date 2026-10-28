#!/usr/bin/env node
// Passive Chrome MCP DevToolsActivePort boundary inventory.
// Only path metadata / ACL presence and process identity; NO file contents,
// fs.open, fs.access, browser/CDP calls, TCC changes, or service mutations.
import {lstat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join,basename} from 'node:path';
import {fileURLToPath} from 'node:url';

const exec=promisify(execFile);
const UID=typeof process.getuid==='function'?process.getuid():null;
const EUID=typeof process.geteuid==='function'?process.geteuid():null;
const GROUPS=typeof process.getgroups==='function'?process.getgroups():[];
const LABELS=['home','library','application_support','google','chrome','devtools_port'];
const HOME=homedir();
const PATHS=[HOME,join(HOME,'Library'),join(HOME,'Library','Application Support'),
 join(HOME,'Library','Application Support','Google'),
 join(HOME,'Library','Application Support','Google','Chrome'),
 join(HOME,'Library','Application Support','Google','Chrome','DevToolsActivePort')];
const MAX=64*1024;
const CODES=new Set(['ENOENT','EACCES','EPERM','ENOTDIR','ELOOP']);
const code=e=>CODES.has(e?.code)?e.code:'unavailable';
const mode=s=>(s.mode&0o777).toString(8).padStart(3,'0');
const type=s=>s.isSymbolicLink()?'symlink':s.isDirectory()?'directory':s.isFile()?'file':'other';

export function posixAllow({mode:bits,uid,gid},actorUid,actorGroups,needed){
 if(!Number.isInteger(actorUid)||!Number.isInteger(uid)||!Number.isInteger(gid))return null;
 // Metadata-only POSIX estimate. ACLs, sandboxing and TCC can override it.
 const shift=actorUid===uid?6:actorGroups.includes(gid)?3:0;
 return (((bits>>shift)&7)&needed)===needed;
}
export function classifyMetadata(entries){
 if(entries.length!==6||entries.some(e=>e.state!=='observed'))
  return 'incomplete_metadata';
 if(entries.slice(0,5).some(e=>e.type!=='directory')||entries[5].type!=='file')
  return 'unexpected_path_type';
 if(entries.some(e=>e.posixAllowsExpected===false))return 'posix_mode_may_block';
 if(entries.some(e=>e.aclEntries===null))return 'acl_observation_incomplete';
 if(entries.some(e=>e.aclEntries>0))return 'acl_present_requires_review';
 return 'not_explained_by_posix_metadata';
}
export function parsePids(raw){
 if(typeof raw!=='string'||raw.length>MAX)return [];
 return [...new Set(raw.split(/\s+/).filter(x=>/^\d{1,9}$/.test(x))
  .map(Number).filter(n=>n>1))].slice(0,4);
}
export function parsePs(raw){
 const m=typeof raw==='string'?raw.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/):null;
 if(!m)return null;
 const name=basename(m[4].trim());
 return {uid:+m[1],euid:+m[2],ppid:+m[3],
  executableClass:/^node(?:\d+)?$/.test(name)?'node':
   /^openclaw(?:\.app)?$/i.test(name)?'openclaw':'other'};
}
async function aclCount(path){
 try{
  const {stdout}=await exec('/bin/ls',['-lde',path],{timeout:4500,maxBuffer:8192});
  return (stdout.match(/^\s*\d+:\s/gm)??[]).length;
 }catch{return null;}
}
async function inspectPath(path,label,isLast){
 try{
  const s=await lstat(path);
  const observedType=type(s);
  // Never follow a symbolic link or attempt any further operation on its target.
  if(observedType==='symlink')return {label,state:'observed',type:'symlink',
    ownerUid:s.uid,groupGid:s.gid,mode:mode(s),posixAllowsExpected:null,aclEntries:null};
  const need=isLast?4:1;
  return {label,state:'observed',type:observedType,ownerUid:s.uid,
   groupGid:s.gid,mode:mode(s),
   posixAllowsExpected:posixAllow({mode:s.mode,uid:s.uid,gid:s.gid},EUID,GROUPS,need),
   aclEntries:await aclCount(path)};
 }catch(e){return {label,state:'unavailable',reason:code(e)};}
}
async function gatewayIdentity(){
  let pids;
  try{
   const {stdout}=await exec('/usr/sbin/lsof',
    ['-nP','-t','-iTCP:18789','-sTCP:LISTEN'],{timeout:7000,maxBuffer:4096});
   pids=parsePids(stdout);
  }catch{return {state:'unavailable',reason:'listener_process_lookup_failed'};}
  if(pids.length!==1)return {state:'unavailable',reason:'listener_not_unique',count:pids.length};
  try{
   const {stdout}=await exec('/bin/ps',['-p',String(pids[0]),'-o','uid=,euid=,ppid=,comm='],
    {timeout:4500,maxBuffer:4096});
   const parsed=parsePs(stdout);
   if(!parsed)return {state:'unavailable',reason:'process_identity_unparsed'};
   return {state:'observed',pid:pids[0],...parsed,sameEuidAsDiagnostic:parsed.euid===EUID};
  }catch{return {state:'unavailable',reason:'process_identity_unavailable'};}
}
export async function inventory(){
 if(process.platform!=='darwin')return {audit:'IOANT_CHROME_MCP_PERMISSION_PASSIVE',schemaVersion:1,
   state:'blocked',reason:'macos_only',readOnly:true};
 const entries=[];
 for(let i=0;i<PATHS.length;i++){
  // Refuse to traverse a path after an unverified ancestor.
  if(i>0&&(entries[i-1].state!=='observed'||entries[i-1].type!=='directory')){
   entries.push({label:LABELS[i],state:'skipped',reason:'ancestor_not_verified'});continue;
  }
  entries.push(await inspectPath(PATHS[i],LABELS[i],i===PATHS.length-1));
 }
 return {audit:'IOANT_CHROME_MCP_PERMISSION_PASSIVE',schemaVersion:1,
  state:'observed',readOnly:true,portContentRead:false,portOpened:false,
  browserCalled:false,tccDatabaseQueried:false,permissionsChanged:false,
  servicesChanged:false,worker:{uid:UID,euid:EUID,nodeExecutableClass:'node'},
  gateway:await gatewayIdentity(),paths:entries,
  metadataAssessment:classifyMetadata(entries),
  tccCausality:'not_established',gatewayCanReadPort:'not_tested'};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(process.argv.length!==2){console.log(JSON.stringify({audit:'IOANT_CHROME_MCP_PERMISSION_PASSIVE',
  state:'blocked',reason:'no_arguments_supported'}));process.exitCode=2;}
 else{console.log(JSON.stringify(await inventory()));}
}
