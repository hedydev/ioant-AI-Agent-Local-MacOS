// Local root grant and read-only Git discovery, independent of project Agents.
import {lstat,realpath,readdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {readPrivateJson} from '../../stage2/workflow-capabilities.mjs';
import {executionCommand,GIT_ARGS} from './project-execution-command.mjs';
import {repositoryPath} from './repository-task.mjs';
export const WORKSPACE_ACCESS=join(homedir(),'Library/Application Support/ioant-openclaw-ops/direct-workspace-access.json');
export const REPOSITORY_ID=/^[a-f0-9]{24}$/;
export const PROJECT_KEY=/^[a-z][a-z0-9-]{0,47}$/;
const exact=(o,fields)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===[...fields].sort().join(',');
const absolute=p=>typeof p==='string'&&p.startsWith('/')&&!/[\x00-\x1f\x7f]/.test(p)&&
 p.split('/').slice(1).every(s=>s&&s!=='.'&&s!=='..');
export function safeGitOrigin(origin){
 return typeof origin==='string'&&(/^(?:git@[A-Za-z0-9.-]+:|https:\/\/[A-Za-z0-9.-]+\/)[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(origin));
}
export function validateWorkspaceAccess(doc){
 if(!exact(doc,['schemaVersion','roots','scriptRoots','runtimes','provisionAgents'])||doc.schemaVersion!==1||
  typeof doc.provisionAgents!=='boolean'||!Array.isArray(doc.roots)||!doc.roots.length||doc.roots.length>8||
  !Array.isArray(doc.scriptRoots)||!doc.scriptRoots.length||doc.scriptRoots.length>8||doc.scriptRoots.some(p=>!repositoryPath(p))||
  !doc.runtimes||typeof doc.runtimes!=='object'||Array.isArray(doc.runtimes)||!Object.keys(doc.runtimes).length||
  Object.entries(doc.runtimes).some(([kind,path])=>!['node','python','bash'].includes(kind)||!absolute(path)))
  throw Error('invalid_workspace_access');
 const keys=new Set(),paths=new Set();
 for(const r of doc.roots){
  if(!exact(r,['key','path'])||typeof r.key!=='string'||!PROJECT_KEY.test(r.key)||keys.has(r.key)||
   !absolute(r.path)||paths.has(r.path))throw Error('invalid_workspace_root');
  keys.add(r.key);paths.add(r.path);
 }
 return doc;
}
export async function loadWorkspaceAccess(){
 try{return validateWorkspaceAccess(await readPrivateJson(WORKSPACE_ACCESS));}
 catch(e){if(e.code==='ENOENT')return null;throw e;}
}
export async function verifyWorkspaceRoot(path){
 const s=await lstat(path);
 if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o022)!==0||await realpath(path)!==path)
  throw Error('workspace_root_unverified');
}
export const repositoryId=path=>createHash('sha256').update(path).digest('hex').slice(0,24);
export async function workspaceCandidates(access){
 const candidates=[];
 for(const root of access.roots){
  await verifyWorkspaceRoot(root.path);
  const entries=await readdir(root.path,{withFileTypes:true});
  if(entries.length>2048)throw Error('workspace_directory_limit');
  for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
   if(!entry.isDirectory()||entry.isSymbolicLink()||entry.name.startsWith('.'))continue;
   const repo=join(root.path,entry.name);
   let s;try{s=await lstat(join(repo,'.git'));}catch(e){if(e.code==='ENOENT')continue;throw e;}
   // Linked worktrees and bare repositories need their own execution contract.
   if(!s.isDirectory()||s.isSymbolicLink())continue;
   candidates.push({repository_id:repositoryId(repo),workspace_key:root.key,name:entry.name,repo});
  }
 }
 if(candidates.length>512)throw Error('workspace_repository_limit');
 return candidates;
}
export async function inspectWorkspaceRepository(candidate,{command=executionCommand}={}){
 await verifyWorkspaceRoot(candidate.repo);await verifyWorkspaceRoot(join(candidate.repo,'.git'));
 const git=async args=>{
  const r=await command('/usr/bin/git',[...GIT_ARGS,...args],{cwd:candidate.repo,limit:32768});
  if(!r.ok||r.truncated)throw Error('workspace_git_metadata_unavailable');return r.stdout.trim();
 };
 if(await git(['rev-parse','--show-toplevel'])!==candidate.repo||
  await git(['rev-parse','--absolute-git-dir'])!==join(candidate.repo,'.git'))throw Error('workspace_repository_identity_mismatch');
 const branch=await git(['symbolic-ref','--quiet','--short','HEAD']);
 if(!/^[A-Za-z0-9_][A-Za-z0-9_/-]{0,127}$/.test(branch)||branch.includes('//')||branch.endsWith('/'))
  throw Error('workspace_branch_requires_review');
 const head=await git(['rev-parse','--verify','HEAD']);if(!/^[a-f0-9]{40}$/.test(head))throw Error('workspace_head_unverified');
 const origin=await git(['remote','get-url','origin']);
 if(!safeGitOrigin(origin))throw Error('workspace_origin_requires_review');
 const dirty=await command('/usr/bin/git',[...GIT_ARGS,'status','--porcelain=v1','--untracked-files=all'],{cwd:candidate.repo,limit:32768});
 if(!dirty.ok)throw Error('workspace_status_unavailable');
 return {...candidate,branch,head,origin,worktreeClean:!dirty.truncated&&dirty.stdout.trim()==='',
  repository:(origin.startsWith('git@')?origin.slice(4).replace(':','/'):origin.slice(8)).replace(/\.git$/,'')};
}
export async function resolveWorkspaceRepository(access,id,options){
 if(typeof id!=='string'||!REPOSITORY_ID.test(id))throw Error('invalid_repository_id');
 const candidate=(await workspaceCandidates(access)).find(c=>c.repository_id===id);
 if(!candidate)throw Error('repository_outside_approved_workspaces');
 return inspectWorkspaceRepository(candidate,options);
}
