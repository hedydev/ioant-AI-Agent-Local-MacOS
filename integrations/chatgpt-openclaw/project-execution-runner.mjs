// One registered Git fast-forward + Python test run. No arbitrary shell and no AI.
import {lstat,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {executionCommand,GIT_ARGS,redactExecutionOutput} from './project-execution-command.mjs';
import {SHA,executionPolicy} from './project-execution-policy.mjs';
import {validateTreeListing} from '../../stage2/project-self-update.mjs';
import {loadRepositoryTask,executeRepositoryTask,verifyTaskScript} from './repository-task.mjs';
import {collectRepositoryArtifacts} from './repository-artifacts.mjs';

export async function inspectExecutionRepository(policy,{command=executionCommand}={}){
 const s=await lstat(policy.repo);
 if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||await realpath(policy.repo)!==policy.repo)
  throw Error('repository_path_unverified');
 const git=async(...args)=>{
  const r=await command('/usr/bin/git',[...GIT_ARGS,...args],{cwd:policy.repo});
  if(!r.ok||r.truncated)throw Error('git_preflight_failed');return r.stdout.trim();
 };
 if(await git('rev-parse','--show-toplevel')!==policy.repo||
  await git('rev-parse','--absolute-git-dir')!==join(policy.repo,'.git'))throw Error('repository_identity_mismatch');
 if(await git('symbolic-ref','--quiet','--short','HEAD')!==policy.branch)throw Error('unexpected_branch');
 if(!policy.origins.includes(await git('remote','get-url','origin')))throw Error('unexpected_origin');
 if(await git('status','--porcelain=v1','--untracked-files=all'))throw Error('dirty_worktree');
 // Do not execute locally configured checkout filters while updating source.
 const filters=await command('/usr/bin/git',[...GIT_ARGS,'config','--get-regexp','^filter\\.'],{cwd:policy.repo});
 if(filters.exitCode!==1||filters.stdout.trim()||filters.timedOut||filters.spawnFailed||filters.truncated)
  throw Error('repository_filters_require_review');
 const head=await git('rev-parse','--verify','HEAD');if(!SHA.test(head))throw Error('invalid_git_oid');
 return {head,branch:policy.branch,repository:policy.repository};
}
export function pythonTestEvidence(text,exitCode){
 const m=[...String(text).matchAll(/Ran (\d+) tests? in [^\r\n]+/g)].at(-1);
 const count=m?Number(m[1]):0;
 const skipped=Number(String(text).match(/^OK \([^\r\n]*skipped=(\d+)[^\r\n]*\)/m)?.[1]??0);
 const ok=exitCode===0&&count>skipped&&/^OK(?: \([^\r\n]*\))?\s*$/m.test(text);
 return {passed:ok,tests:count,skipped,exitCode};
}
export async function runRegisteredExecution(binding,operationId,{store,policyLoad=executionPolicy,
 command=executionCommand,inspect=inspectExecutionRepository}={}){
 let record=await store.get(operationId),log='',retainLock=false;
 if(!record||record.state!=='accepted'||!await store.owns(operationId,record.digest))return;
 const save=async()=>store.save(record);
 const append=async text=>{
  const clean=redactExecutionOutput(text);
  if(Buffer.byteLength(log+clean)>262144){record.logTruncated=true;return;}
  log+=clean;record.report=await store.writeLog(operationId,log);
 };
 const step=async(name,file,args,options={})=>{
  const row={name,state:'running',startedAt:new Date().toISOString()};record.steps.push(row);await save();
  await append('\n['+name+'] started\n');
  let streamed=false;
  const r=await command(file,args,{cwd:policy.repo,...options,
   ...(name==='validate_tree'?{}:{onOutput:async text=>{streamed=true;await append(text);}})});
  row.state=r.ok?'passed':r.timedOut?'inconclusive':'failed';row.exitCode=r.exitCode;
  row.timedOut=r.timedOut===true;row.finishedAt=new Date().toISOString();
  if(name==='validate_tree')await append('Bounded Git tree metadata validated separately; file listing omitted.\n');
  else if(r.truncated){record.logTruncated=true;await append('Output omitted because capture limit was exceeded.\n');}
  else if(!streamed)await append(r.stdout+'\n'+r.stderr+'\n');
  await save();
  if(!r.ok){
   if(r.timedOut||r.outputFailed||name==='fast_forward'){retainLock=true;throw Error('command_outcome_requires_review');}
   throw Error('execution_step_failed');
  }
  return r;
 };
 let policy;
 try{
  policy=await policyLoad(binding,{action:record.input.action});
  if(!policy||record.input.action!==policy.action)throw Error('project_action_not_enabled');
  record.state='running';record.runnerPid=process.pid;record.startedAt=new Date().toISOString();await save();
  const before=await inspect(policy,{command});record.beforeCommit=before.head;await save();
  const git=(name,args)=>step(name,'/usr/bin/git',[...GIT_ARGS,...args]);
  await git('fetch',['fetch','--no-tags','origin','refs/heads/'+policy.branch]);
  const fetched=(await git('fetched_commit',['rev-parse','--verify','FETCH_HEAD'])).stdout.trim();
  if(fetched!==record.input.expected_commit)throw Error('remote_commit_mismatch');
  const tree=await git('validate_tree',['ls-tree','-rlz','--full-tree',fetched]);
  if(tree.truncated)throw Error('candidate_tree_too_large');validateTreeListing(tree.stdout);
  const ancestor=await command('/usr/bin/git',[...GIT_ARGS,'merge-base','--is-ancestor',before.head,fetched],{cwd:policy.repo});
  if(!ancestor.ok)throw Error('fast_forward_required');
  const plan=policy.action==='repository_task'?await loadRepositoryTask(policy,fetched,record.input.task_file,{command}):null;
  const fresh=await inspect(policy,{command});if(fresh.head!==before.head)throw Error('repository_changed_before_update');
  if(before.head!==fetched)await git('fast_forward',['merge','--ff-only','--no-edit',fetched]);
  const updated=await inspect(policy,{command});
  if(updated.head!==fetched)throw Error('updated_commit_unverified');record.actualCommit=updated.head;
  record.testedCommit=fetched;await save();
  if(plan){
   const outputDir=await store.outputDirectory(operationId);
   record.task=await executeRepositoryTask(plan,policy,{operationId,outputDir,step,
    verify:(p,task,item)=>verifyTaskScript(p,task,item,{command})});
   record.artifacts=await collectRepositoryArtifacts(plan,outputDir,store,operationId);
  }else{
  const testPath=join(policy.repo,policy.testDirectory),testFile=join(testPath,policy.targetedTest);
  for(const path of [policy.python,testPath,testFile]){
   const st=await lstat(path);if(st.isSymbolicLink()&&path!==policy.python||await realpath(path)!==path&&path!==policy.python)
    throw Error('test_path_unverified');
   if(path===testFile&&!st.isFile()||path===testPath&&!st.isDirectory())throw Error('test_path_unverified');
  }
  for(const [name,args] of [
   ['targeted_python_regression',['-m','unittest','discover','-s',policy.testDirectory,'-p',policy.targetedTest,'-v']],
   ['full_mac_python_regression',['-m','unittest','discover','-s',policy.testDirectory,'-v']]]){
   const r=await step(name,policy.python,args,{timeout:300000});
   const evidence=pythonTestEvidence(r.stdout+'\n'+r.stderr,r.exitCode);
   record.steps.at(-1).tests=evidence.tests;record.steps.at(-1).skipped=evidence.skipped;await save();
   if(!evidence.passed)throw Error('positive_test_evidence_required');
  }
  }
  const end=await inspect(policy,{command});
  if(end.head!==fetched)throw Error('repository_changed_during_tests');
  record.actualCommit=end.head;record.worktreeClean=true;record.state='passed';
  record.resultScope=plan?'Pinned repository task steps exited successfully; no independent deployment or application-effect acceptance.':'Local pinned Git update and Mac Python regressions only; no deployment or gameplay acceptance.';
 }catch(e){
  record.state=retainLock?'inconclusive':record.actualCommit?'failed':'blocked';
  record.reason=/^[a-z_]+$/.test(e.message)?e.message:'project_execution_requires_review';
 }finally{
  record.finishedAt=new Date().toISOString();
  if(!record.report)record.report=await store.writeLog(operationId,log);
  await save();
  if(!retainLock)await store.release(operationId,record.digest);
 }
}
