// A terminated fetch can alter remote refs, but cannot have started a later merge.
// Settling the local writer lease never claims fetch/sync success or retries it.
import {lstat,readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {executionPolicy} from './project-execution-policy.mjs';
import {inspectExecutionRepository} from './execution-repository.mjs';
import {preservationSnapshot} from './repository-preservation.mjs';
import {executionCommand,executionEnvironment,GIT_ARGS} from './project-execution-command.mjs';
import {reviewExecutionRecovery,readExecutionRecovery} from './execution-recovery.mjs';
export const GIT_FETCH_TIMEOUT_MS=300000;
const SHA=/^[a-f0-9]{40}$/;
const hash=x=>createHash('sha256').update(x).digest('hex');
const absent=pid=>{try{process.kill(pid,0);return false;}catch(e){return e.code==='ESRCH';}};
export function onlyTimedOutFetch(r){
 const s=r?.steps?.[0];
 return Boolean(r&&['repository_fetch','repository_sync'].includes(r.input?.action)&&SHA.test(r.beforeCommit??'')&&
  Object.hasOwn(r,'beforeBranch')&&r.steps.length===1&&s.name==='fetch'&&s.capability==='git'&&s.timedOut===true&&
  s.processGroupAbsent===true&&Number.isSafeInteger(s.processId)&&s.processId>1);
}
async function assertNoGitLocks(repo){
 const root=join(repo,'.git');
 for(const name of ['index.lock','HEAD.lock','FETCH_HEAD.lock','ORIG_HEAD.lock','packed-refs.lock','shallow.lock','config.lock']){
  try{await lstat(join(root,name));throw Error('git_lock_still_present');}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 let count=0;
 const scan=async dir=>{
  let entries;try{entries=await readdir(dir,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return;throw e;}
  for(const e of entries){
   if(++count>4096)throw Error('git_lock_inspection_limit');
   if(e.isSymbolicLink())throw Error('git_ref_path_unverified');
   if(e.name.endsWith('.lock'))throw Error('git_lock_still_present');
   if(e.isDirectory())await scan(join(dir,e.name));
  }
 };
 await scan(join(root,'refs'));
}
export async function inspectFetchInterruption(record,policy,{inspect=inspectExecutionRepository,exited=absent,requireRunnerExit=false,command=executionCommand}={}){
 if(!onlyTimedOutFetch(record))throw Error('fetch_recovery_not_applicable');
 const step=record.steps[0];
 if(!exited(step.processId)||!exited(-step.processId))throw Error('fetch_process_still_present');
 if(requireRunnerExit&&(!Number.isSafeInteger(record.runnerPid)||record.runnerPid<2||!exited(record.runnerPid)))throw Error('original_runner_still_present');
 const current=await inspect(policy,{allowDirty:true,requireRegisteredBranch:false,requireIdle:true,
  command:(file,args,options)=>command(file,args,{...options,env:{...executionEnvironment(),GIT_OPTIONAL_LOCKS:'0'}})});
 if(current.head!==record.beforeCommit||current.branch!==record.beforeBranch||current.gitOperation)throw Error('checkout_changed_since_fetch');
 await assertNoGitLocks(policy.repo);
 return {commandProcessId:step.processId,processGroupAbsent:true,head:current.head,branch:current.branch,
  localCheckoutUpdated:false,remoteRefsMayHaveChanged:true,fetchSucceeded:false};
}
const recovery={directory:'git-fetch-reconciliation',decision:'confirmed_fetch_ended_before_checkout_update'};
export async function reconcileGitFetch(args,{binding,store,policyLoad=executionPolicy,now=Date.now,inspect=inspectExecutionRepository,exited=absent}={}){
 const applicable=r=>r?.state==='inconclusive'&&r.reason==='command_outcome_requires_review'&&onlyTimedOutFetch(r);
 const snapshot=async r=>{
  const policy=await policyLoad(binding,{action:r.input.action});if(!policy)throw Error('fetch_recovery_policy_unavailable');
  const local=await inspectFetchInterruption(r,policy,{inspect,exited,requireRunnerExit:true});
  const changes=await preservationSnapshot(policy,{command:executionCommand});
  const tracking=await executionCommand('/usr/bin/git',[...GIT_ARGS,'rev-parse','--verify','--quiet','refs/remotes/origin/'+policy.branch],{cwd:policy.repo});
  if(tracking.timedOut||tracking.truncated||tracking.spawnFailed||tracking.outputFailed||tracking.signal||!tracking.ok&&tracking.exitCode!==1||tracking.ok&&!SHA.test(tracking.stdout.trim()))throw Error('tracking_ref_unverified');
  const fetchPath=join(policy.repo,'.git/FETCH_HEAD');let fetchHead=null;
  try{const s=await lstat(fetchPath);if(!s.isFile()||s.isSymbolicLink()||s.size>65536)throw Error('fetch_head_unverified');fetchHead={bytes:s.size,sha256:hash(await readFile(fetchPath))};}catch(e){if(e.code!=='ENOENT')throw e;}
  return {...local,localChanges:{digest:changes.digest,fileCount:changes.fileCount},remoteTrackingCommit:tracking.ok?tracking.stdout.trim():null,fetchHead};
 };
 return reviewExecutionRecovery(args,{store,applicable,snapshot,now,...recovery});
}
export const gitFetchRecoveryReceipt=(store,id)=>readExecutionRecovery(store,id,recovery);
