import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,chmod,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {ProjectExecutionStore} from '../integrations/chatgpt-openclaw/project-execution-store.mjs';
import {reconcileRepositoryTask,repositoryTaskRecoveryReceipt,probeRepositoryTask} from '../integrations/chatgpt-openclaw/repository-task-recovery.mjs';
import {parseRepositoryTask} from '../integrations/chatgpt-openclaw/repository-task.mjs';
import {executionCommand} from '../integrations/chatgpt-openclaw/project-execution-command.mjs';
const id='build_timeout_test_0001';
async function fixture(t){
 const parent=await realpath(await mkdtemp(join(tmpdir(),'task-recovery-')));await chmod(parent,0o700);t.after(()=>rm(parent,{recursive:true,force:true}));
 const repo=join(parent,'repo');await mkdir(repo);await mkdir(join(repo,'scripts'));await mkdir(join(repo,'.openclaw/tasks'),{recursive:true});
 const git=(...args)=>execFileSync('/usr/bin/git',['-c','core.hooksPath=/dev/null',...args],{cwd:repo}).toString().trim();
 git('init','-q','--initial-branch=main');git('remote','add','origin','https://example.com/user/repo.git');
 await writeFile(join(repo,'scripts/build.sh'),'#!/bin/bash\nexit 0\n');
 const task={schemaVersion:1,title:'Build',steps:[{name:'build',runtime:'bash',script:'scripts/build.sh',timeoutSeconds:420}]};
 await writeFile(join(repo,'.openclaw/tasks/build.json'),JSON.stringify(task));git('add','scripts/build.sh','.openclaw/tasks/build.json');git('-c','user.name=Fixture','-c','user.email=fixture@example.com','commit','-qm','fixture');
 const head=git('rev-parse','HEAD'),binding={projectKey:'test-project',agentId:'test-agent'},store=new ProjectExecutionStore(binding,{parent});
 const {record}=await store.begin({operation_id:id,action:'repository_task',workspace_mode:'current',expected_commit:head,task_file:'.openclaw/tasks/build.json'},'d'.repeat(64));
 Object.assign(record,{state:'inconclusive',reason:'command_outcome_requires_review',actualCommit:head,beforeBranch:'main',runnerPid:99999999,
  steps:[{name:'build',capability:'script',timedOut:true,state:'inconclusive'}]});await store.save(record);
 const policy={repo,branch:'main',origins:['https://example.com/user/repo.git'],scriptRoots:['scripts'],runtimes:{bash:'/bin/bash'}};
 const evidence={runnerExited:true,recordedProcessGroupsAbsent:true,scopedProcessIds:[],compilerProcessIds:[],legacyProcessEvidence:true};
 const options={store,binding,policyLoad:async()=>policy,probe:async()=>({...evidence})};
 return {store,record,policy,evidence,options};
}
test('reviewed timeout release preserves original receipt and same-ID claim, never releases a new task',async t=>{
 const c=await fixture(t),raw=await readFile(c.store.path(id),'utf8');
 const r=await reconcileRepositoryTask({mode:'inspect',operation_id:id},c.options);assert.equal(r.state,'review_ready');assert.equal(await c.store.owns(id,c.record.digest),true);
 const done=await reconcileRepositoryTask({mode:'resolve',operation_id:id,review_digest:r.review_digest,acknowledge_effects_unverified:true},c.options);
 assert.equal(done.state,'resolved');assert.equal(done.effectsVerified,false);assert.equal(await readFile(c.store.path(id),'utf8'),raw);
 assert.equal((await c.store.begin(c.record.input,c.record.digest)).created,false);
 const next=await c.store.begin({...c.record.input,operation_id:'new_build_test_0002'},'e'.repeat(64));assert.equal(next.created,true);
 const cached=await reconcileRepositoryTask({mode:'inspect',operation_id:id},c.options);assert.equal(cached.cached,true);
 assert.equal(await c.store.owns('new_build_test_0002','e'.repeat(64)),true);
 assert.equal((await repositoryTaskRecoveryReceipt(c.store,id)).lockReleased,true);
});
test('running process, changed evidence, expired review, missing acknowledgment and lifecycle are blocked',async t=>{
 const c=await fixture(t);
 c.evidence.scopedProcessIds=[123];assert.equal((await reconcileRepositoryTask({mode:'inspect',operation_id:id},c.options)).reason,'task_processes_not_quiescent');c.evidence.scopedProcessIds=[];
 const r=await reconcileRepositoryTask({mode:'inspect',operation_id:id},c.options);assert.equal(r.state,'review_ready');
 const args={mode:'resolve',operation_id:id,review_digest:r.review_digest,acknowledge_effects_unverified:true};
 assert.equal((await reconcileRepositoryTask({...args,acknowledge_effects_unverified:false},c.options)).reason,'invalid_task_recovery_input');
 assert.equal((await reconcileRepositoryTask(args,{...c.options,now:()=>Date.now()+61000})).reason,'task_review_changed_or_expired');
 c.evidence.legacyProcessEvidence=false;assert.equal((await reconcileRepositoryTask(args,c.options)).reason,'task_review_changed_or_expired');
 assert.equal(await c.store.owns(id,c.record.digest),true);
 // Existing lifecycle records cannot enter the generic recovery path.
 const other=await fixture(t);const raw=JSON.parse(await readFile(other.store.path(id),'utf8'));raw.lifecycleApproval={approvalSha256:'a'.repeat(64)};await writeFile(other.store.path(id),JSON.stringify(raw),{mode:0o600});
 assert.equal((await reconcileRepositoryTask({mode:'inspect',operation_id:id},other.options)).reason,'task_recovery_not_applicable');
});
test('pinned entry script changes block recovery and malformed sidecars do not hide original result',async t=>{
 const c=await fixture(t);await writeFile(join(c.policy.repo,'scripts/build.sh'),'changed');
 assert.equal((await reconcileRepositoryTask({mode:'inspect',operation_id:id},c.options)).reason,'task_script_revision_changed');
 await mkdir(join(c.store.dir,'task-reconciliation'),{recursive:true,mode:0o700});await writeFile(join(c.store.dir,'task-reconciliation',id+'.json'),'{}',{mode:0o600});
 assert.equal((await repositoryTaskRecoveryReceipt(c.store,id)).state,'unverified');assert.equal((await c.store.get(id)).state,'inconclusive');
});
test('process probe refuses active runner and detects scoped process without collecting argv',async()=>{
 await assert.rejects(probeRepositoryTask({runnerPid:process.pid,steps:[]},{repo:'/fixture'}),/original_runner_still_present/);
 const calls=[];const command=async(file,args)=>{calls.push(args);return {ok:true,truncated:false,stdout:file==='/bin/ps'?'87654 1 87654 /usr/bin/cargo\n':'p87654\nn/fixture\n'};};
 const r=await probeRepositoryTask({runnerPid:99999999,steps:[]},{repo:'/fixture'},{command});
 assert.deepEqual(r.scopedProcessIds,[87654]);assert.deepEqual(r.compilerProcessIds,[87654]);assert.equal(calls.flat().some(a=>/args|command=|environment/.test(a)),false);
});
test('explicit cwd review only accepts recorded group exit and verified pre-existing processes',async()=>{
 const record={runnerPid:99999999,createdAt:'2026-11-06T22:30:15.834Z',
  steps:[{processId:99999998,processGroupAbsent:true}]};
 const policy={repo:'/fixture'};
 const reviewedCwdPids=[87654];
 let start='Fri Nov  6 21:30:15 2026',parent=1;
 const command=async(file,args)=>({ok:true,truncated:false,stdout:
  file.endsWith('lsof')?'p87654\nn/fixture\np87655\nn/fixture\n':
  args[0]==='-p'?`87654 ${parent} 87654 ${start}\n`:'87654 1 87654 /bin/zsh\n87655 1 87655 /usr/bin/cargo\n'});
 const r=await probeRepositoryTask(record,policy,{command,reviewedCwdPids});
 assert.deepEqual(r.scopedProcessIds,[87655]);
 assert.deepEqual(r.compilerProcessIds,[87655]);
 assert.deepEqual(r.reviewedCwdProcesses,[{pid:87654,ppid:1,pgid:87654,name:'zsh',startedAt:'2026-11-06T21:30:15.000Z'}]);
 start='Fri Nov  6 22:30:15 2026';
 await assert.rejects(probeRepositoryTask(record,policy,{command,reviewedCwdPids}),/reviewed_cwd_process_unverified/);
 start='Fri Nov  6 21:30:15 2026';parent=2;
 await assert.rejects(probeRepositoryTask(record,policy,{command,reviewedCwdPids}),/reviewed_cwd_process_unverified/);
 await assert.rejects(probeRepositoryTask({...record,steps:[{}]},policy,{command,reviewedCwdPids}),/reviewed_cwd_requires_recorded_group_exit/);
});
test('changing the reviewed cwd evidence invalidates a pending release',async t=>{
 const c=await fixture(t);
 const options={...c.options,probe:async(_record,_policy,{reviewedCwdPids})=>({...c.evidence,reviewedCwdProcesses:reviewedCwdPids})};
 const r=await reconcileRepositoryTask({mode:'inspect',operation_id:id},{...options,reviewedCwdPids:[123]});
 assert.equal(r.state,'review_ready');
 const args={mode:'resolve',operation_id:id,review_digest:r.review_digest,acknowledge_effects_unverified:true};
 assert.equal((await reconcileRepositoryTask(args,options)).reason,'task_review_changed_or_expired');
 assert.equal(await c.store.owns(id,c.record.digest),true);
 assert.equal((await reconcileRepositoryTask(args,{...options,reviewedCwdPids:[123]})).state,'resolved');
});
test('explicit hour-long task budget is allowed and command timeout records exited process evidence',async()=>{
 const task={schemaVersion:1,title:'Long local build',steps:[{name:'build',runtime:'bash',script:'scripts/build.sh',timeoutSeconds:3600}]};
 assert.equal(parseRepositoryTask(JSON.stringify(task)).steps[0].timeoutSeconds,3600);task.steps[0].timeoutSeconds=3601;assert.throws(()=>parseRepositoryTask(JSON.stringify(task)),/invalid_task_step/);
 const r=await executionCommand('/bin/sleep',['10'],{timeout:30});assert.equal(r.timedOut,true);assert.equal(r.signal,'SIGTERM');assert.equal(r.processGroupAbsent,true);assert.ok(r.processId>1);
});
