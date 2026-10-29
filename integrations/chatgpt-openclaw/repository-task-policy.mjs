// Separate local grants: never rewrite the legacy fixed-action enrollment.
import {homedir} from 'node:os';
import {join,dirname} from 'node:path';
import {lstatSync,realpathSync,readFileSync} from 'node:fs';
import {readPrivateJson} from '../../stage2/workflow-capabilities.mjs';
import {repositoryPath} from './repository-task.mjs';

export const REPOSITORY_TASK_GRANT=join(homedir(),'Library/Application Support/ioant-openclaw-ops/direct-repository-task-grants.json');
const keys=(x,required)=>x&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).sort().join(',')===[...required].sort().join(',');
const absolute=x=>typeof x==='string'&&x.startsWith('/')&&!/[\x00-\x1f\x7f]/.test(x)&&
 x.split('/').slice(1).every(p=>p&&p!=='.'&&p!=='..');
const origin=x=>typeof x==='string'&&(
 /^git@[A-Za-z0-9.-]+:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(x)||
 /^https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(x));
export function validateRepositoryTaskGrants(doc){
 if(!keys(doc,['schemaVersion','projects'])||doc.schemaVersion!==1||
  !doc.projects||typeof doc.projects!=='object'||Array.isArray(doc.projects)||
  Object.keys(doc.projects).length>32)throw Error('invalid_repository_task_grants');
 const repos=new Set(),agents=new Set();
 for(const [project,p] of Object.entries(doc.projects)){
  if(!/^[a-z][a-z0-9-]{0,47}$/.test(project)||
   !keys(p,['agent','workspace','repo','repository','branch','origins','scriptRoots','runtimes'])||
   (typeof p.agent!=='string'||!/^[a-z][a-z0-9-]{0,47}$/.test(p.agent))||p.agent==='main'||p.agent==='mac-computer'||agents.has(p.agent)||
   p.workspace!=='/Volumes/LunaDrive/DeveloperCache/openclaw-agents/'+p.agent||!absolute(p.repo)||repos.has(p.repo)||
   typeof p.repository!=='string'||!p.repository.length||p.repository.length>160||/[\x00-\x1f\x7f]/.test(p.repository)||
   typeof p.branch!=='string'||!/^[-A-Za-z0-9_/]+$/.test(p.branch)||p.branch.startsWith('-')||
   p.branch.startsWith('/')||p.branch.endsWith('/')||p.branch.includes('//')||
   !Array.isArray(p.origins)||!p.origins.length||p.origins.length>4||p.origins.some(o=>!origin(o))||
   !Array.isArray(p.scriptRoots)||!p.scriptRoots.length||p.scriptRoots.length>8||p.scriptRoots.some(r=>!repositoryPath(r))||
   !p.runtimes||typeof p.runtimes!=='object'||Array.isArray(p.runtimes)||!Object.keys(p.runtimes).length||
   Object.entries(p.runtimes).some(([kind,path])=>!['node','python','bash'].includes(kind)||!absolute(path)))
   throw Error('invalid_repository_task_grants');
  repos.add(p.repo);agents.add(p.agent);
 }
 return doc;
}
export async function repositoryTaskPolicy(binding,{load=()=>readPrivateJson(REPOSITORY_TASK_GRANT)}={}){
 try{
  const p=validateRepositoryTaskGrants(await load()).projects[binding.projectKey];
  if(!p||p.agent!==binding.agentId)return null;
  return {...p,project:binding.projectKey,action:'repository_task'};
 }catch{return null;}
}

export function readRepositoryTaskGrants(path=REPOSITORY_TASK_GRANT){
 try{
  for(const [p,directory] of [[dirname(path),true],[path,false]]){
   const s=lstatSync(p);
   if((directory?!s.isDirectory():!s.isFile())||s.isSymbolicLink()||s.uid!==process.getuid()||
    (s.mode&0o077)!==0||realpathSync(p)!==p||!directory&&s.size>65536)
    throw Error('private_repository_grants_required');
  }
  return validateRepositoryTaskGrants(JSON.parse(readFileSync(path,'utf8')));
 }catch(e){if(e.code==='ENOENT')return {schemaVersion:1,projects:{}};throw e;}
}
