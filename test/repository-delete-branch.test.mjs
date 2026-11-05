import test from 'node:test';import assert from 'node:assert/strict';
import {branchName,deleteRemoteBranch} from '../integrations/chatgpt-openclaw/repository-delete-branch.mjs';
import {validExecutionInput,projectExecution} from '../integrations/chatgpt-openclaw/project-execution.mjs';
const sha='a'.repeat(40),input={operation_id:'delete_branch_0001',conversation_key:'delete_branch_chat',action:'repository_delete_branch',branch:'feature/old',expected_branch_commit:sha};
test('delete input is exact, bounded and distinct from local source commit',()=>{
 assert.equal(validExecutionInput(input),true);const unpinned={...input};delete unpinned.expected_branch_commit;assert.equal(validExecutionInput(unpinned),true);
 for(const branch of ['-main','../main','a..b','a.lock','a/*','a@{x}','a\nb','.hidden','a//b']){assert.equal(branchName(branch),false);assert.equal(validExecutionInput({...input,branch}),false);}
 assert.equal(validExecutionInput({...input,expected_branch_commit:'bad'}),false);assert.equal(validExecutionInput({...input,task_file:'x'}),false);
});
test('deletion uses an exact remote ref lease, verifies absence and does not modify local refs',async()=>{
 const calls=[];const r=await deleteRemoteBranch(input,{}, {branch:'work'}, {git:async(name,args)=>{calls.push({name,args});return {stdout:name==='branch_delete_preflight'?'ref: refs/heads/main\tHEAD\n'+sha+'\trefs/heads/feature/old\n':''};}});
 assert.equal(r.deleted,true);assert.equal(r.remoteAbsenceVerified,true);assert.deepEqual(calls[1].args,['push','--porcelain','--force-with-lease=refs/heads/feature/old:'+sha,'origin',':refs/heads/feature/old']);assert.equal(calls.length,3);
 assert.equal(calls.some(c=>c.args.some(x=>['checkout','reset','stash','switch'].includes(x))),false);
});
test('new remote commits, default/current branch and unknown default never reach push',async()=>{
 for(const [branch,current,output] of [['main','work','ref: refs/heads/main\tHEAD\n'],['work','work','ref: refs/heads/main\tHEAD\n'],['feature/old','work',''],['feature/old','work','ref: refs/heads/main\tHEAD\n'+'b'.repeat(40)+'\trefs/heads/feature/old\n']]){
  let pushes=0;await assert.rejects(deleteRemoteBranch({...input,branch},{},{branch:current},{git:async(name)=>{if(name==='delete_remote_branch')pushes++;return {stdout:output};}}));assert.equal(pushes,0);
 }
});
test('already absent is reported without pushing; an uncertain push is never repeated',async()=>{
 let calls=0;const r=await deleteRemoteBranch(input,{}, {branch:'work'}, {git:async()=>{calls++;return {stdout:'ref: refs/heads/main\tHEAD\n'};}});assert.equal(r.alreadyAbsent,true);assert.equal(calls,1);
 let pushes=0;await assert.rejects(deleteRemoteBranch(input,{}, {branch:'work'}, {git:async name=>{if(name==='delete_remote_branch'){pushes++;throw Error('transport_unknown');}return {stdout:'ref: refs/heads/main\tHEAD\n'+sha+'\trefs/heads/feature/old\n'};}}),/transport_unknown/);assert.equal(pushes,1);
});
test('real fixed executor deletes a leased branch from a local bare remote and preserves dirty checkout',async t=>{
 const {mkdtemp,realpath,writeFile,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{execFileSync}=await import('node:child_process');
 const {ProjectExecutionStore}=await import('../integrations/chatgpt-openclaw/project-execution-store.mjs'),{runRegisteredExecution}=await import('../integrations/chatgpt-openclaw/project-execution-runner.mjs');
 const root=await realpath(await mkdtemp(join(tmpdir(),'delete-ref-')));t.after(()=>rm(root,{recursive:true,force:true}));
 const git=(cwd,...args)=>execFileSync('/usr/bin/git',['-c','core.hooksPath=/dev/null',...args],{cwd,encoding:'utf8',env:{...process.env,GIT_AUTHOR_NAME:'Fixture',GIT_AUTHOR_EMAIL:'f@example.invalid',GIT_COMMITTER_NAME:'Fixture',GIT_COMMITTER_EMAIL:'f@example.invalid'}}).trim();
 const remote=join(root,'remote.git'),repo=join(root,'checkout');git(root,'init','--quiet','--bare','--initial-branch=main',remote);git(root,'clone','--quiet',remote,repo);await writeFile(join(repo,'file'),'base');git(repo,'add','file');git(repo,'commit','--quiet','-m','base');git(repo,'push','--quiet','origin','HEAD:main','HEAD:feature/old');
 const tip=git(repo,'rev-parse','HEAD');await writeFile(join(repo,'file'),'local edits');await writeFile(join(repo,'untracked'),'keep');const index=await readFile(join(repo,'.git/index'));
 const binding={projectKey:'fixture',agentId:'fixture'},store=new ProjectExecutionStore(binding,{parent:root}),policy=async()=>({repo,branch:'main',origins:[remote],repository:'fixture/repo',action:'repository_delete_branch'}),args={...input,expected_branch_commit:tip};let launches=0;
 assert.equal((await projectExecution('openclaw_project_execute',args,{binding,store,policy,launch:async()=>launches++})).state,'accepted');await runRegisteredExecution(binding,args.operation_id,{store,policyLoad:policy});
 const r=await projectExecution('openclaw_project_result',{operation_id:args.operation_id},{binding,store});assert.equal(r.state,'passed',JSON.stringify(r));assert.equal(r.branchDeletion.remoteAbsenceVerified,true);assert.equal(r.modelInferenceInvoked,false);assert.equal(git(repo,'ls-remote','--heads','origin','refs/heads/feature/old'),'');assert.equal(git(repo,'rev-parse','HEAD'),tip);assert.equal(await readFile(join(repo,'file'),'utf8'),'local edits');assert.deepEqual(await readFile(join(repo,'.git/index')),index);
 await projectExecution('openclaw_project_execute',args,{binding,store,policy,launch:async()=>launches++});assert.equal(launches,1);
});
