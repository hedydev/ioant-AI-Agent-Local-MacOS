import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,realpath,chmod,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';
import {ProjectExecutionStore} from '../integrations/chatgpt-openclaw/project-execution-store.mjs';
import {projectExecution,validExecutionInput} from '../integrations/chatgpt-openclaw/project-execution.mjs';import {runRegisteredExecution} from '../integrations/chatgpt-openclaw/project-execution-runner.mjs';
const input={operation_id:'fetch_fixture_123',conversation_key:'fetch_chat_123',action:'repository_fetch'};
test('fetch admission needs no task or expected commit and rejects free-form mutation inputs',()=>{assert.equal(validExecutionInput(input),true);for(const x of [{...input,command:'run'},{...input,workspace_mode:'isolated'},{...input,task_file:'.openclaw/tasks/task.json'},{...input,expected_commit:'bad'}])assert.equal(validExecutionInput(x),false);});
test('actual dirty-checkout fetch preserves HEAD, index, edits and untracked files and persists verified refs',async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'repo-fetch-')));await chmod(root,0o700);t.after(()=>rm(root,{recursive:true,force:true}));
 const repo=join(root,'source'),clone=join(root,'checkout');const git=(cwd,...args)=>execFileSync('/usr/bin/git',['-c','core.hooksPath=/dev/null',...args],{cwd,encoding:'utf8',env:{...process.env,GIT_AUTHOR_NAME:'Fixture',GIT_AUTHOR_EMAIL:'fixture@example.invalid',GIT_COMMITTER_NAME:'Fixture',GIT_COMMITTER_EMAIL:'fixture@example.invalid'}}).trim();
 git(root,'init','--quiet','--initial-branch=main',repo);await writeFile(join(repo,'file.txt'),'base\n');git(repo,'add','file.txt');git(repo,'commit','--quiet','-m','base');git(root,'clone','--quiet',repo,clone);const old=git(clone,'rev-parse','HEAD');
 await writeFile(join(repo,'new.txt'),'remote update\n');git(repo,'add','new.txt');git(repo,'commit','--quiet','-m','remote');const remote=git(repo,'rev-parse','HEAD');
 await writeFile(join(clone,'file.txt'),'local edit\n');await writeFile(join(clone,'untracked.txt'),'keep\n');const index=await readFile(join(clone,'.git/index'));
 const binding={projectKey:'project',agentId:'agent'},store=new ProjectExecutionStore(binding,{parent:root}),policy=async()=>({repo:clone,branch:'main',origins:[repo],repository:'fixture/repo',action:'repository_fetch'});
 let launches=0;const admitted=await projectExecution('openclaw_project_execute',input,{binding,store,policy,launch:async()=>{launches++;}});assert.equal(admitted.state,'accepted');await runRegisteredExecution(binding,input.operation_id,{store,policyLoad:policy});
 const result=await projectExecution('openclaw_project_result',{operation_id:input.operation_id},{binding,store});assert.equal(result.state,'passed',JSON.stringify(result));assert.equal(result.fetchedCommit,remote);assert.equal(result.remoteTrackingCommit,remote);assert.equal(result.actualCommit,old);assert.equal(result.sourceCheckoutUpdated,false);assert.equal(result.cached,true);
 assert.equal(git(clone,'rev-parse','HEAD'),old);assert.deepEqual(await readFile(join(clone,'.git/index')),index);assert.equal(await readFile(join(clone,'file.txt'),'utf8'),'local edit\n');assert.equal(await readFile(join(clone,'untracked.txt'),'utf8'),'keep\n');
 await projectExecution('openclaw_project_execute',input,{binding,store,policy,launch:async()=>{launches++;}});assert.equal(launches,1);assert.equal(result.modelInferenceInvoked,false);
});
