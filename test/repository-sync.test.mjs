import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,realpath,chmod,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';
import {ProjectExecutionStore} from '../integrations/chatgpt-openclaw/project-execution-store.mjs';
import {projectExecution,validExecutionInput} from '../integrations/chatgpt-openclaw/project-execution.mjs';
import {runRegisteredExecution} from '../integrations/chatgpt-openclaw/project-execution-runner.mjs';
async function fixture(t){
 const root=await realpath(await mkdtemp(join(tmpdir(),'repo-sync-')));await chmod(root,0o700);t.after(()=>rm(root,{recursive:true,force:true}));
 const git=(cwd,...args)=>execFileSync('/usr/bin/git',['-c','core.hooksPath=/dev/null',...args],{cwd,encoding:'utf8',env:{...process.env,GIT_AUTHOR_NAME:'Fixture',GIT_AUTHOR_EMAIL:'fixture@example.invalid',GIT_COMMITTER_NAME:'Fixture',GIT_COMMITTER_EMAIL:'fixture@example.invalid'}}).trim();
 const remote=join(root,'remote'),repo=join(root,'checkout');git(root,'init','--quiet','--initial-branch=main',remote);
 await writeFile(join(remote,'local.txt'),'base\n');await writeFile(join(remote,'.gitignore'),'ignored.txt\n');git(remote,'add','.');git(remote,'commit','--quiet','-m','base');git(root,'clone','--quiet',remote,repo);
 return {root,git,remote,repo};
}
async function execute(f,id){
 const binding={projectKey:'fixture',agentId:'fixture'},store=new ProjectExecutionStore(binding,{parent:f.root}),policy=async()=>({repo:f.repo,repository:'fixture/repo',origins:[f.remote],branch:'main',action:'repository_sync'});
 const input={action:'repository_sync',operation_id:id,conversation_key:'sync_fixture_chat',expected_commit:f.git(f.remote,'rev-parse','HEAD')};
 const admission=await projectExecution('openclaw_project_execute',input,{binding,store,policy,launch:async()=>{}});assert.equal(admission.state,'accepted');
 await runRegisteredExecution(binding,id,{store,policyLoad:policy});
 return projectExecution('openclaw_project_result',{operation_id:id},{binding,store});
}
test('sync requires a pinned commit and accepts no arbitrary command/task/workspace mode',()=>{
 const x={action:'repository_sync',operation_id:'sync_check_001',conversation_key:'sync_chat_001',expected_commit:'a'.repeat(40)};
 assert.equal(validExecutionInput(x),true);for(const y of [{...x,expected_commit:undefined},{...x,command:'run'},{...x,task_file:'.openclaw/tasks/task.json'},{...x,workspace_mode:'isolated'}])assert.equal(validExecutionInput(y),false);
});
test('real dirty original fast-forward preserves staged and unstaged content, index entries and untracked files',async t=>{
 const f=await fixture(t);await writeFile(join(f.repo,'local.txt'),'staged\n');f.git(f.repo,'add','local.txt');const index=f.git(f.repo,'ls-files','--stage','--','local.txt');await writeFile(join(f.repo,'local.txt'),'unstaged\n');await writeFile(join(f.repo,'untracked.txt'),'keep\n');
 await writeFile(join(f.remote,'new.txt'),'remote\n');f.git(f.remote,'add','new.txt');f.git(f.remote,'commit','--quiet','-m','remote');
 const r=await execute(f,'sync_dirty_0001');assert.equal(r.state,'passed',JSON.stringify(r));assert.equal(r.actualCommit,f.git(f.remote,'rev-parse','HEAD'));assert.equal(r.preservedLocalChanges.verified,true);assert.equal(r.modelInferenceInvoked,false);
 assert.equal(await readFile(join(f.repo,'local.txt'),'utf8'),'unstaged\n');assert.equal(await readFile(join(f.repo,'untracked.txt'),'utf8'),'keep\n');assert.equal(f.git(f.repo,'ls-files','--stage','--','local.txt'),index);assert.equal(r.worktreeClean,false);
});
test('overlapping edits stop before HEAD changes and preserve the exact local content',async t=>{
 const f=await fixture(t),old=f.git(f.repo,'rev-parse','HEAD');await writeFile(join(f.repo,'local.txt'),'local\n');await writeFile(join(f.remote,'local.txt'),'remote\n');f.git(f.remote,'add','local.txt');f.git(f.remote,'commit','--quiet','-m','remote');
 const r=await execute(f,'sync_conflict_001');assert.equal(r.state,'blocked');assert.equal(r.reason,'local_changes_overlap_update');assert.equal(f.git(f.repo,'rev-parse','HEAD'),old);assert.equal(await readFile(join(f.repo,'local.txt'),'utf8'),'local\n');
});
test('ignored local files are never overwritten by a newly tracked remote file',async t=>{
 const f=await fixture(t),old=f.git(f.repo,'rev-parse','HEAD');await writeFile(join(f.repo,'ignored.txt'),'private local\n');await writeFile(join(f.remote,'ignored.txt'),'remote\n');f.git(f.remote,'add','-f','ignored.txt');f.git(f.remote,'commit','--quiet','-m','remote');
 const r=await execute(f,'sync_ignored_001');assert.notEqual(r.state,'passed');assert.equal(f.git(f.repo,'rev-parse','HEAD'),old);assert.equal(await readFile(join(f.repo,'ignored.txt'),'utf8'),'private local\n');
});
