import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,chmod,writeFile,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {ProjectExecutionStore} from '../integrations/chatgpt-openclaw/project-execution-store.mjs';
import {runRegisteredExecution} from '../integrations/chatgpt-openclaw/project-execution-runner.mjs';
import {executionCommand} from '../integrations/chatgpt-openclaw/project-execution-command.mjs';
import {inspectFetchInterruption,reconcileGitFetch,gitFetchRecoveryReceipt,GIT_FETCH_TIMEOUT_MS} from '../integrations/chatgpt-openclaw/git-fetch-recovery.mjs';
import {projectExecution} from '../integrations/chatgpt-openclaw/project-execution.mjs';
const id='fetch_timeout_recovery_001';
async function fixture(t,action='repository_sync'){
 const root=await realpath(await mkdtemp(join(tmpdir(),'fetch-recovery-')));await chmod(root,0o700);t.after(()=>rm(root,{recursive:true,force:true}));
 const repo=join(root,'repo');await mkdir(repo);
 const git=(...a)=>execFileSync('/usr/bin/git',['-c','core.hooksPath=/dev/null',...a],{cwd:repo}).toString().trim();
 git('init','-q','--initial-branch=main');git('remote','add','origin','https://example.com/a/b.git');await writeFile(join(repo,'file'),'base');git('add','file');git('-c','user.name=Fixture','-c','user.email=fixture@example.com','commit','-qm','base');
 await writeFile(join(repo,'file'),'local edit');await writeFile(join(repo,'untracked'),'keep');
 const head=git('rev-parse','HEAD'),binding={projectKey:'fixture',agentId:'fixture'},store=new ProjectExecutionStore(binding,{parent:root});
 const policy={repo,action,branch:'main',origins:['https://example.com/a/b.git']};
 const input={operation_id:id,action,conversation_key:'fetch_recovery_chat',...(action==='repository_sync'?{expected_commit:head}:{})};
 await store.begin(input,'a'.repeat(64));
 return {root,repo,head,binding,store,policy,git,input,options:{binding,store,policyLoad:async()=>policy}};
}
async function historic(c){
 const r=await c.store.get(id);Object.assign(r,{state:'inconclusive',reason:'command_outcome_requires_review',beforeCommit:c.head,beforeBranch:'main',runnerPid:99999998,
  steps:[{name:'fetch',state:'inconclusive',capability:'git',timedOut:true,processId:99999999,processGroupAbsent:true,signal:'SIGTERM'}]});await c.store.save(r);return r;
}
test('real killed fetch subprocess settles failed, frees lease, preserves files and cannot replay the same ID',async t=>{
 for(const action of ['repository_sync','repository_fetch']){
  const c=await fixture(t,action),index=await readFile(join(c.repo,'.git/index'));let calls=0;
  const command=async(file,args,opts)=>{
   if(file==='/usr/bin/git'&&args.includes('fetch')){calls++;assert.equal(opts.timeout,GIT_FETCH_TIMEOUT_MS);return executionCommand('/bin/sleep',['3'],{timeout:25});}
   return executionCommand(file,args,opts);
  };
  await runRegisteredExecution(c.binding,id,{store:c.store,policyLoad:async()=>c.policy,command});
  const r=await c.store.get(id);assert.equal(r.state,'failed',JSON.stringify(r));assert.equal(r.reason,'git_fetch_timeout');assert.equal(r.steps.length,1);assert.equal(r.steps[0].state,'failed');
  assert.equal(r.fetchInterruption.fetchSucceeded,false);assert.equal(r.fetchInterruption.remoteRefsMayHaveChanged,true);assert.equal(r.sourceCheckoutUpdated,false);
  assert.equal(c.git('rev-parse','HEAD'),c.head);assert.deepEqual(await readFile(join(c.repo,'.git/index')),index);assert.equal(await readFile(join(c.repo,'file'),'utf8'),'local edit');assert.equal(await readFile(join(c.repo,'untracked'),'utf8'),'keep');
  await assert.rejects(c.store.owns(id,'a'.repeat(64)),{code:'ENOENT'});await runRegisteredExecution(c.binding,id,{store:c.store,policyLoad:async()=>c.policy,command});assert.equal(calls,1);
 }
});
test('missing group-exit evidence or leftover Git lock retains the original uncertain lease',async t=>{
 for(const kind of ['unverified','lock']){
  const c=await fixture(t);
  const command=async(file,args,opts)=>{
   if(file==='/usr/bin/git'&&args.includes('fetch')){
    const r=await executionCommand('/bin/sleep',['3'],{timeout:25});
    if(kind==='lock')await writeFile(join(c.repo,'.git/FETCH_HEAD.lock'),'busy');else r.processGroupAbsent=false;
    return r;
   }
   return executionCommand(file,args,opts);
  };
  await runRegisteredExecution(c.binding,id,{store:c.store,policyLoad:async()=>c.policy,command});const r=await c.store.get(id);
  assert.equal(r.state,'inconclusive');assert.equal(await c.store.owns(id,r.digest),true);
 }
});
test('historical fetch review releases only exact lease and cloud result retains unknown original',async t=>{
 const c=await fixture(t);await historic(c);const raw=await readFile(c.store.path(id),'utf8');
 const i=await reconcileGitFetch({mode:'inspect',operation_id:id},c.options);assert.equal(i.state,'review_ready',JSON.stringify(i));
 const r=await reconcileGitFetch({mode:'resolve',operation_id:id,review_digest:i.review_digest,acknowledge_effects_unverified:true},c.options);assert.equal(r.state,'resolved');assert.equal(r.effectsVerified,false);
 assert.equal(await readFile(c.store.path(id),'utf8'),raw);
 const actual=await projectExecution('openclaw_project_result',{operation_id:id},{binding:c.binding,store:c.store});assert.equal(actual.state,'inconclusive');assert.equal(actual.reconciliation.lockReleased,true);
 assert.equal((await gitFetchRecoveryReceipt(c.store,id)).decision,'confirmed_fetch_ended_before_checkout_update');
 const next=await c.store.begin({...c.input,operation_id:'new_fetch_next_002'},'b'.repeat(64));assert.equal(next.created,true);
 assert.equal((await reconcileGitFetch({mode:'inspect',operation_id:id},c.options)).cached,true);assert.equal(await c.store.owns('new_fetch_next_002','b'.repeat(64)),true);
});
test('active original runner, changed checkout, ref lock and stages after fetch block recovery',async t=>{
 const c=await fixture(t),r=await historic(c);
 await assert.rejects(inspectFetchInterruption({...r,runnerPid:process.pid},c.policy,{requireRunnerExit:true}),/original_runner_still_present/);
 await assert.rejects(inspectFetchInterruption({...r,beforeCommit:'f'.repeat(40)},c.policy),/checkout_changed_since_fetch/);
 await mkdir(join(c.repo,'.git/refs/remotes/origin'),{recursive:true});await writeFile(join(c.repo,'.git/refs/remotes/origin/main.lock'),'busy');
 assert.equal((await reconcileGitFetch({mode:'inspect',operation_id:id},c.options)).reason,'git_lock_still_present');
 await assert.rejects(inspectFetchInterruption({...r,steps:[...r.steps,{name:'fast_forward'}]},c.policy),/fetch_recovery_not_applicable/);
 assert.equal(await c.store.owns(id,r.digest),true);
});
test('review pins local changes and rejects an expired or missing acknowledgment',async t=>{
 const c=await fixture(t);await historic(c);const i=await reconcileGitFetch({mode:'inspect',operation_id:id},c.options);
 const args={mode:'resolve',operation_id:id,review_digest:i.review_digest,acknowledge_effects_unverified:true};
 assert.equal((await reconcileGitFetch({...args,acknowledge_effects_unverified:false},c.options)).reason,'invalid_task_recovery_input');
 assert.equal((await reconcileGitFetch(args,{...c.options,now:()=>Date.now()+61000})).reason,'task_review_changed_or_expired');
 await writeFile(join(c.repo,'untracked'),'changed');assert.equal((await reconcileGitFetch(args,c.options)).reason,'task_review_changed_or_expired');
 assert.equal(await c.store.owns(id,'a'.repeat(64)),true);
});
