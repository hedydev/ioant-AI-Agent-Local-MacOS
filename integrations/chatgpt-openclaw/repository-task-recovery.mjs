// Local maintainer review only. Never retries work or changes its original outcome.
import {basename} from 'node:path';
import {executionCommand} from './project-execution-command.mjs';
import {executionPolicy} from './project-execution-policy.mjs';
import {inspectExecutionRepository} from './execution-repository.mjs';
import {loadRepositoryTask,verifyTaskScript} from './repository-task.mjs';
import {ALICE_RESTART_TASK} from './alice-lifecycle-policy.mjs';
import {reviewExecutionRecovery,readExecutionRecovery} from './execution-recovery.mjs';
const absent=pid=>{try{process.kill(pid,0);return false;}catch(e){return e.code==='ESRCH';}};

export async function probeRepositoryTask(record,policy,{command=executionCommand}={}){
 if(!Number.isSafeInteger(record.runnerPid)||record.runnerPid<2||!absent(record.runnerPid))throw Error('original_runner_still_present');
 // No argv/environment collection. cwd evidence and conservative global compiler
 // detection also cover legacy receipts without a recorded command process group.
 const ps=await command('/bin/ps',['-axo','pid=,ppid=,pgid=,comm='],{timeout:10000,limit:1048576});
 const files=await command('/usr/sbin/lsof',['-a','-u',String(process.getuid()),'-d','cwd','-Fpn'],{timeout:15000,limit:1048576});
 if(!ps.ok||ps.truncated||!files.ok||files.truncated)throw Error('process_evidence_unavailable');
 const rows=ps.stdout.trim().split('\n').map(line=>line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/)).map(m=>{
  if(!m)throw Error('process_evidence_unverified');return {pid:Number(m[1]),ppid:Number(m[2]),pgid:Number(m[3]),name:basename(m[4])};
 });
 const excluded=new Set([process.pid]);let parent=process.pid;
 while(parent){const row=rows.find(r=>r.pid===parent);parent=row?.ppid;if(parent)excluded.add(parent);}
 let pid=null;const scoped=new Set();
 for(const line of files.stdout.split('\n')){
  if(/^p\d+$/.test(line))pid=Number(line.slice(1));
  if(line.startsWith('n')&&(line.slice(1)===policy.repo||line.slice(1).startsWith(policy.repo+'/'))&&pid&&!excluded.has(pid))scoped.add(pid);
 }
 const compilers=rows.filter(r=>!excluded.has(r.pid)&&/^(cargo(?:-.*)?|rustc|rust-lld|rust-objcopy|clang(?:\+\+)?|ld|codesign|hdiutil|xcodebuild)$/.test(r.name));
 const groups=record.steps.map(s=>s.processId).filter(p=>Number.isSafeInteger(p)&&p>1);
 const groupAbsent=groups.every(p=>absent(-p));
 return {runnerExited:true,scopedProcessIds:[...scoped].sort((a,b)=>a-b),compilerProcessIds:compilers.map(r=>r.pid).sort((a,b)=>a-b),
  recordedProcessGroupsAbsent:groupAbsent,legacyProcessEvidence:groups.length===0};
}

const recovery={directory:'task-reconciliation',decision:'reviewed_local_task_ended_effects_unverified'};
export async function reconcileRepositoryTask(args,{binding,store,policyLoad=executionPolicy,probe=probeRepositoryTask,now=Date.now}={}){
 const applicable=r=>r&&r.state==='inconclusive'&&r.reason==='command_outcome_requires_review'&&r.input.action==='repository_task'&&
  r.input.workspace_mode==='current'&&r.input.task_file!==ALICE_RESTART_TASK&&!r.lifecycleApproval&&!r.lifecycle&&
  r.steps.length>0&&r.steps.at(-1).capability==='script'&&r.steps.at(-1).timedOut===true&&r.steps.slice(0,-1).every(s=>s.state==='passed');
 const snapshot=async r=>{
  const p=await policyLoad(binding,{action:'repository_task'});if(!p)throw Error('task_recovery_policy_unavailable');
  const repo=await inspectExecutionRepository(p,{allowDirty:true,requireRegisteredBranch:false,requireIdle:true});
  if(repo.head!==r.actualCommit||repo.head!==r.input.expected_commit||repo.branch!==r.beforeBranch)throw Error('repository_changed_since_task');
  const plan=await loadRepositoryTask(p,repo.head,r.input.task_file);
  for(const item of plan.steps)await verifyTaskScript(p,plan,item);
  const evidence=await probe(r,p);
  if(evidence.runnerExited!==true||evidence.recordedProcessGroupsAbsent!==true||!Array.isArray(evidence.scopedProcessIds)||!Array.isArray(evidence.compilerProcessIds)||evidence.scopedProcessIds.length||evidence.compilerProcessIds.length)throw Error('task_processes_not_quiescent');
  return {repo:{head:repo.head,branch:repo.branch,dirty:repo.dirty},definitionSha256:plan.definitionSha256,evidence};
 };
 return reviewExecutionRecovery(args,{store,applicable,snapshot,now,...recovery});
}
export const repositoryTaskRecoveryReceipt=(store,id)=>readExecutionRecovery(store,id,recovery);
