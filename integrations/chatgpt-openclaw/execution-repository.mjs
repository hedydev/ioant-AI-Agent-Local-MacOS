// Repository identity/preflight and explicitly requested, executor-owned checkouts.
import {lstat,realpath,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {executionCommand,GIT_ARGS,redactExecutionOutput} from './project-execution-command.mjs';

function preflightError(reason,check,result={}){
 return Object.assign(Error(reason),{preflight:{check,exitCode:result.exitCode??null,timedOut:result.timedOut===true,
  truncated:result.truncated===true,spawnFailed:result.spawnFailed===true,
  stderr:redactExecutionOutput(result.stderr??'').slice(0,1200)}});
}
export async function inspectExecutionRepository(policy,{command=executionCommand,allowDirty=false}={}){
 const s=await lstat(policy.repo);
 if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||await realpath(policy.repo)!==policy.repo)throw Error('repository_path_unverified');
 const git=async(check,...args)=>{
  const r=await command('/usr/bin/git',[...GIT_ARGS,...args],{cwd:policy.repo});
  if(!r.ok||r.truncated)throw preflightError(r.timedOut?'git_preflight_timeout':r.truncated?'git_preflight_output_too_large':'git_preflight_failed',check,r);
  return r.stdout.trim();
 };
 if(await git('toplevel','rev-parse','--show-toplevel')!==policy.repo||await git('git_directory','rev-parse','--absolute-git-dir')!==join(policy.repo,'.git'))throw Error('repository_identity_mismatch');
 if(policy.detachedCommit){
  if(await git('head','rev-parse','--verify','HEAD')!==policy.detachedCommit)throw Error('unexpected_detached_commit');
 }else if(await git('branch','symbolic-ref','--quiet','--short','HEAD')!==policy.branch)throw Error('unexpected_branch');
 const origin=await git('origin','remote','get-url','origin');if(!policy.origins.includes(origin))throw Error('unexpected_origin');
 // normal groups untracked build directories. A positive dirty result stays dirty
 // even when a huge root listing is truncated; never mislabel it as a Git failure.
 const status=await command('/usr/bin/git',[...GIT_ARGS,'status','--porcelain=v1','--untracked-files=normal'],{cwd:policy.repo});
 if(!status.ok)throw preflightError(status.timedOut?'git_preflight_timeout':'git_preflight_failed','worktree_status',status);
 const dirty=Boolean(status.stdout.trim());
 if(status.truncated&&!dirty)throw preflightError('git_preflight_output_too_large','worktree_status',status);
 if(dirty&&!allowDirty)throw preflightError('dirty_worktree','worktree_status',status);
 const filters=await command('/usr/bin/git',[...GIT_ARGS,'config','--get-regexp','^filter\\.'],{cwd:policy.repo});
 if(filters.exitCode!==1||filters.stdout.trim()||filters.timedOut||filters.spawnFailed||filters.truncated)throw preflightError('repository_filters_require_review','checkout_filters',filters);
 const head=await git('head','rev-parse','--verify','HEAD');if(!/^[a-f0-9]{40}$/.test(head))throw Error('invalid_git_oid');
 return {head,branch:policy.branch,repository:policy.repository,origin,dirty,statusTruncated:status.truncated===true};
}
export async function createIsolatedRepository(policy,origin,{store,operationId,step}){
 const output=await store.outputDirectory(operationId),repo=join(output,'checkout');
 // No reuse, reset, cleanup or local-file copy. This directory belongs to this ID.
 await mkdir(repo,{mode:0o700});
 await step('isolated_init','/usr/bin/git',[...GIT_ARGS,'init','--quiet','--initial-branch='+policy.branch],{cwd:repo});
 await step('isolated_origin','/usr/bin/git',[...GIT_ARGS,'remote','add','origin',origin],{cwd:repo});
 return {...policy,repo};
}
