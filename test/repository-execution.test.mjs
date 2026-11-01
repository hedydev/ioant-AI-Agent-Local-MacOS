import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,chmod,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {validateRepositoryTaskGrants,repositoryTaskPolicy} from '../integrations/chatgpt-openclaw/repository-task-policy.mjs';
import {ProjectExecutionStore} from '../integrations/chatgpt-openclaw/project-execution-store.mjs';
import {projectExecution,validExecutionInput,executionTools} from '../integrations/chatgpt-openclaw/project-execution.mjs';
import {runRegisteredExecution} from '../integrations/chatgpt-openclaw/project-execution-runner.mjs';
import {executionEnvironment} from '../integrations/chatgpt-openclaw/project-execution-command.mjs';
import {registeredProjectBindings,projectWorkspacePolicy} from '../integrations/chatgpt-openclaw/project-binding.mjs';
import {readDeclaredArtifact} from '../integrations/chatgpt-openclaw/repository-artifacts.mjs';
async function privateTemp(t){
 const p=await realpath(await mkdtemp(join(tmpdir(),'ioant-repository-run-')));await chmod(p,0o700);
 t.after(()=>rm(p,{recursive:true,force:true}));return p;
}
const grant=()=>({schemaVersion:1,projects:{example:{agent:'example',workspace:'/Volumes/LunaDrive/DeveloperCache/openclaw-agents/example',repo:'/Users/example/project',repository:'owner/project',
 branch:'main',origins:['git@github.com:owner/project.git'],scriptRoots:['scripts'],runtimes:{node:'/usr/local/bin/node'}}}});
test('data grants support independent workspaces and never infer a grant from task data',async()=>{
 const doc=grant();doc.projects.other={...doc.projects.example,agent:'other',workspace:'/Volumes/LunaDrive/DeveloperCache/openclaw-agents/other',repo:'/Users/example/other'};
 assert.equal(validateRepositoryTaskGrants(doc),doc);
 assert.equal((await repositoryTaskPolicy({projectKey:'example',agentId:'example'},{load:async()=>doc})).action,'repository_task');
 assert.equal(await repositoryTaskPolicy({projectKey:'missing',agentId:'example'},{load:async()=>doc}),null);
 assert.equal(await repositoryTaskPolicy({projectKey:'example',agentId:'other'},{load:async()=>doc}),null);
 for(const edit of [d=>d.projects.example.shell=true,d=>d.projects.example.repo='/a/../b',
  d=>d.projects.example.origins=['https://user:password@github.com/o/r'],
  d=>d.projects.example.runtimes={shell:'/bin/sh'},d=>d.projects.example.scriptRoots=['../scripts']]){
  const d=grant();edit(d);assert.throws(()=>validateRepositoryTaskGrants(d));
 }
 doc.projects.other.repo=doc.projects.example.repo;assert.throws(()=>validateRepositoryTaskGrants(doc));
});
test('generic MCP input requires a tracked-task name and includes it in operation identity',async t=>{
 const parent=await privateTemp(t),binding={projectKey:'example',agentId:'example'},store=new ProjectExecutionStore(binding,{parent});
 const input={operation_id:'generic_request_0001',conversation_key:'conversation_0001',action:'repository_task',expected_commit:'a'.repeat(40),task_file:'.openclaw/tasks/check.json',workspace_mode:'in_place'};
 assert.equal(validExecutionInput(input),true);
 assert.equal(new RegExp(executionTools[1].inputSchema.properties.task_file.pattern).test(input.task_file),true);
 assert.equal(validExecutionInput({...input,task_file:'/tmp/untrusted.json'}),false);
 const missing={...input};delete missing.task_file;assert.equal(validExecutionInput(missing),false);
 let launched=0;const options={binding,store,policy:async()=>({action:'repository_task'}),launch:async()=>{launched++;}};
 assert.equal((await projectExecution('openclaw_project_execute',input,options)).state,'accepted');
 assert.equal((await projectExecution('openclaw_project_execute',input,options)).state,'accepted');
 assert.equal((await projectExecution('openclaw_project_execute',{...input,task_file:'.openclaw/tasks/other.json'},options)).reason,'operation_id_conflict');
 assert.equal(launched,1);
 assert.match(executionTools[1].inputSchema.properties.task_file.description,/Never ask the user/);
});
async function gitFixture(t,index,{missingArtifact=false,generatedFile=false,mutateTracked=false}={}){
 const parent=await privateTemp(t),seed=join(parent,'seed'),repo=join(parent,'checkout');await mkdir(seed);
 const git=(cwd,...args)=>execFileSync('/usr/bin/git',args,{cwd,encoding:'utf8',env:executionEnvironment(),stdio:['ignore','pipe','pipe']}).trim();
 git(seed,'init','-q','-b','main');await writeFile(join(seed,'README.md'),'fixture\n');
 const commit=()=>git(seed,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture');
 git(seed,'add','.');commit();git(parent,'clone','-q',seed,repo);
 await mkdir(join(seed,'.openclaw/tasks'),{recursive:true});await mkdir(join(seed,'scripts'));
 const task={schemaVersion:1,title:'Independent fixture '+index,steps:[{name:'check',runtime:'node',script:'scripts/check.mjs',args:['@output_dir']}],artifacts:[{id:'summary',file:'summary.json',format:'json'}]};
 await writeFile(join(seed,'.openclaw/tasks/check.json'),JSON.stringify(task));
 await writeFile(join(seed,'scripts/check.mjs'),`import {writeFileSync} from 'node:fs';import {join} from 'node:path';${missingArtifact?'void 0':"writeFileSync(join(process.argv[2],'summary.json'),JSON.stringify({project:"+index+",ok:true,token:'sensitive-fixture-value'}))"};${generatedFile?"writeFileSync('generated-build-output.txt','build output');":''}${mutateTracked?"writeFileSync('README.md','mutated tracked file');":''}console.log('FIXTURE_PASSED');\n`);
 git(seed,'add','.');commit();const expected=git(seed,'rev-parse','HEAD');
 const binding={projectKey:'fixture-'+index,agentId:'fixture-'+index};
 const policy={project:binding.projectKey,agent:binding.agentId,action:'repository_task',repo,repository:'fixture/'+index,branch:'main',origins:[seed],scriptRoots:['scripts'],runtimes:{node:process.execPath}};
 return {parent,repo,binding,policy,expected,git,store:new ProjectExecutionStore(binding,{parent})};
}
test('two real Git projects use the same MCP admission, pinned update, runner, artifact and cached receipt',async t=>{
 for(let index=1;index<=2;index++){
  const f=await gitFixture(t,index),input={operation_id:'end_to_end_operation_0001',conversation_key:'independent_chat_'+index,action:'repository_task',expected_commit:f.expected,task_file:'.openclaw/tasks/check.json',workspace_mode:'in_place'};
  let launches=0;const options={...f,policy:async()=>f.policy,launch:async()=>{launches++;}};
  assert.equal((await projectExecution('openclaw_project_execute',input,options)).state,'accepted');
  await runRegisteredExecution(f.binding,input.operation_id,{store:f.store,policyLoad:async()=>f.policy});
  const r=await projectExecution('openclaw_project_result',{operation_id:input.operation_id},options);
  assert.equal(r.state,'passed',JSON.stringify(r));assert.equal(r.cached,true);assert.equal(r.actualCommit,f.expected);
  assert.equal(r.worktreeClean,true);assert.equal(r.modelInferenceInvoked,false);assert.equal(r.workerUsed,false);
  assert.equal(r.artifacts[0].artifact,'summary');assert.equal(r.taskFile,input.task_file);
  const report=await projectExecution('openclaw_project_report',{operation_id:input.operation_id,artifact_id:'summary'},options);
  assert.equal(report.state,'report');const body=JSON.parse(report.logText);
  assert.equal(body.project,index);assert.equal(body.ok,true);assert.equal(body.token,'[REDACTED]');
  assert.equal(report.logText.includes('sensitive-fixture-value'),false);
  assert.equal(f.git(f.repo,'status','--porcelain'),'');
  await projectExecution('openclaw_project_execute',input,options);assert.equal(launches,1);
  const artifact=join(f.store.dir,input.operation_id+'.artifact-summary.txt');await writeFile(artifact,'changed');
  assert.equal((await projectExecution('openclaw_project_report',{operation_id:input.operation_id,artifact_id:'summary'},options)).reason,'execution_report_changed');
 }
});
test('declared artifacts reject missing files, symlinks, traversal and excessive size',async t=>{
 const output=await privateTemp(t);await writeFile(join(output,'plain.txt'),'safe');await symlink(join(output,'plain.txt'),join(output,'link.txt'));
 for(const file of ['missing.txt','link.txt','../plain.txt'])await assert.rejects(readDeclaredArtifact(output,{file,format:'text'}));
 await writeFile(join(output,'large.txt'),'x'.repeat(262145));await assert.rejects(readDeclaredArtifact(output,{file:'large.txt',format:'text'}),/too_large/);
 const r=await readDeclaredArtifact(output,{file:'plain.txt',format:'text'});assert.equal(r.text,'safe');
});
test('ZIP reports read only a declared member without extracting files and reject unsafe archives',async t=>{
 const output=await privateTemp(t),zip=join(output,'report.zip');
 const create=name=>execFileSync('/usr/bin/python3',['-I','-S','-c',"import zipfile,sys;z=zipfile.ZipFile(sys.argv[1],'w');z.writestr(sys.argv[2],'{\"ok\":true,\"password\":\"private\"}');z.close()",zip,name]);
 create('report.json');const r=await readDeclaredArtifact(output,{file:'report.zip',format:'zip_json',member:'report.json'});
 assert.equal(JSON.parse(r.text).password,'[REDACTED]');
 await assert.rejects(readFile(join(output,'report.json')),/ENOENT/);
 create('../report.json');await assert.rejects(readDeclaredArtifact(output,{file:'report.zip',format:'zip_json',member:'report.json'}),/zip_artifact_unverified/);
});

test('data registry adds independent projects and rejects aliasing existing Agents or workspaces',()=>{
 const doc=grant(),bindings=registeredProjectBindings({load:()=>doc});
 assert.equal(bindings.example.agentId,'example');assert.ok(bindings['alice-ai']);
 doc.projects.example.agent='alice-ai';doc.projects.example.workspace=bindings['alice-ai'].workspace;
 assert.throws(()=>registeredProjectBindings({load:()=>doc}),/independent_project_binding/);
 const binding=bindings.example,config={agents:{entries:{example:{workspace:binding.workspace},other:{workspace:binding.workspace}}}};
 assert.equal(projectWorkspacePolicy(config,binding),false);
 config.agents.entries.other.workspace='/different';assert.equal(projectWorkspacePolicy(config,binding),true);
});

test('zero exit with a missing declared report cannot become a passed task',async t=>{
 const f=await gitFixture(t,3,{missingArtifact:true}),input={operation_id:'missing_report_task_0001',conversation_key:'missing_report_chat',action:'repository_task',expected_commit:f.expected,task_file:'.openclaw/tasks/check.json',workspace_mode:'in_place'};
 const options={...f,policy:async()=>f.policy,launch:async()=>{}};
 await projectExecution('openclaw_project_execute',input,options);
 await runRegisteredExecution(f.binding,input.operation_id,{store:f.store,policyLoad:async()=>f.policy});
 const r=await projectExecution('openclaw_project_result',{operation_id:input.operation_id},options);
 assert.equal(r.state,'failed');assert.equal(r.cached,true);assert.equal(r.actualCommit,f.expected);
 assert.equal(r.artifacts,undefined);
});

test('isolated tasks preserve dirty source files and old HEAD while executing the pinned remote task',async t=>{
 const f=await gitFixture(t,4,{generatedFile:true}),oldHead=f.git(f.repo,'rev-parse','HEAD');
 await writeFile(join(f.repo,'README.md'),'operator edits must survive\n');await mkdir(join(f.repo,'build'));await writeFile(join(f.repo,'build','untracked.bin'),'local build output');
 const status=f.git(f.repo,'status','--porcelain=v1','--untracked-files=all');
 const input={operation_id:'isolated_acceptance_0001',conversation_key:'isolated_fixture_chat',action:'repository_task',expected_commit:f.expected,task_file:'.openclaw/tasks/check.json',workspace_mode:'isolated'};
 const opts={...f,policy:async()=>f.policy,launch:async()=>{}};
 assert.equal(validExecutionInput(input),true);assert.equal(validExecutionInput({...input,workspace_mode:'arbitrary_path'}),false);
 await projectExecution('openclaw_project_execute',input,opts);await runRegisteredExecution(f.binding,input.operation_id,{store:f.store,policyLoad:async()=>f.policy});
 const r=await projectExecution('openclaw_project_result',{operation_id:input.operation_id},opts);
 assert.equal(r.state,'passed',JSON.stringify(r));assert.equal(r.workspaceMode,'isolated');assert.equal(r.sourceWorktreeDirty,true);assert.equal(r.sourceCheckoutUpdated,false);assert.equal(r.generatedCheckoutFiles,true);assert.equal(r.worktreeClean,false);
 assert.equal(r.actualCommit,f.expected);assert.equal(r.cached,true);assert.equal(r.steps.some(s=>s.name==='isolated_checkout'),true);
 assert.equal(f.git(f.repo,'rev-parse','HEAD'),oldHead);assert.equal(await readFile(join(f.repo,'README.md'),'utf8'),'operator edits must survive\n');assert.equal(await readFile(join(f.repo,'build/untracked.bin'),'utf8'),'local build output');assert.equal(f.git(f.repo,'status','--porcelain=v1','--untracked-files=all'),status);
 const report=await projectExecution('openclaw_project_report',{operation_id:input.operation_id,artifact_id:'summary'},opts);assert.equal(JSON.parse(report.logText).ok,true);
 assert.equal((await projectExecution('openclaw_project_execute',{...input,workspace_mode:'in_place'},opts)).reason,'operation_id_conflict');
});
test('isolated task cannot pass when a script changes tracked checkout files',async t=>{
 const f=await gitFixture(t,5,{mutateTracked:true}),input={operation_id:'isolated_track_change_0001',conversation_key:'isolated_change_chat',action:'repository_task',expected_commit:f.expected,task_file:'.openclaw/tasks/check.json',workspace_mode:'isolated'};
 await projectExecution('openclaw_project_execute',input,{...f,policy:async()=>f.policy,launch:async()=>{}});
 await runRegisteredExecution(f.binding,input.operation_id,{store:f.store,policyLoad:async()=>f.policy});
 const r=await f.store.get(input.operation_id);assert.equal(r.state,'failed');assert.equal(r.reason,'tracked_checkout_changed_during_tests');
});

test('default current tasks run in dirty detached or other-branch checkouts without updating refs, files or index',async t=>{
 for(const state of ['detached','topic']){
  const f=await gitFixture(t,state==='detached'?6:7);
  f.git(f.repo,'pull','--ff-only');
  f.git(f.repo,'checkout',...(state==='detached'?['--detach',f.expected]:['-b','operator-topic']));
  await writeFile(join(f.repo,'README.md'),'staged operator edit\n');f.git(f.repo,'add','README.md');
  await writeFile(join(f.repo,'README.md'),'unstaged operator edit\n');await writeFile(join(f.repo,'untracked.txt'),'keep\n');
  const head=await readFile(join(f.repo,'.git/HEAD')),index=await readFile(join(f.repo,'.git/index'));
  const main=f.git(f.repo,'rev-parse','refs/heads/main'),fetch=await readFile(join(f.repo,'.git/FETCH_HEAD'));
  const input={action:'repository_task',operation_id:'current_task_'+state,conversation_key:'current_fixture_chat',expected_commit:f.expected,task_file:'.openclaw/tasks/check.json'};
  let launches=0;const opts={...f,policy:async()=>f.policy,launch:async()=>{launches++;}};
  await projectExecution('openclaw_project_execute',input,opts);
  assert.equal((await f.store.get(input.operation_id)).input.workspace_mode,'current');
  await runRegisteredExecution(f.binding,input.operation_id,{store:f.store,policyLoad:async()=>f.policy});
  const r=await projectExecution('openclaw_project_result',{operation_id:input.operation_id},opts);
  assert.equal(r.state,'passed',JSON.stringify(r));assert.equal(r.workspaceMode,'current');assert.equal(r.sourceWorktreeDirty,true);assert.equal(r.sourceCheckoutUpdated,false);assert.equal(r.worktreeClean,false);
  assert.equal(r.steps.length,1);assert.equal(r.steps[0].capability,'script');assert.equal(r.beforeBranch,state==='detached'?null:'operator-topic');assert.equal(r.afterBranch,r.beforeBranch);
  assert.deepEqual(await readFile(join(f.repo,'.git/HEAD')),head);assert.deepEqual(await readFile(join(f.repo,'.git/index')),index);assert.deepEqual(await readFile(join(f.repo,'.git/FETCH_HEAD')),fetch);
  assert.equal(f.git(f.repo,'rev-parse','refs/heads/main'),main);assert.equal(await readFile(join(f.repo,'README.md'),'utf8'),'unstaged operator edit\n');assert.equal(await readFile(join(f.repo,'untracked.txt'),'utf8'),'keep\n');
  assert.equal(JSON.parse((await projectExecution('openclaw_project_report',{operation_id:input.operation_id,artifact_id:'summary'},opts)).logText).ok,true);
  await projectExecution('openclaw_project_execute',input,opts);assert.equal(launches,1);
  assert.equal((await projectExecution('openclaw_project_execute',{...input,workspace_mode:'current'},opts)).state,'passed');
  assert.equal((await projectExecution('openclaw_project_execute',{...input,workspace_mode:'in_place'},opts)).reason,'operation_id_conflict');assert.equal(launches,1);
 }
});

test('current mode refuses a different commit without fetching or checking out',async t=>{
 const f=await gitFixture(t,8),old=f.git(f.repo,'rev-parse','HEAD');
 const input={action:'repository_task',operation_id:'current_mismatch_001',conversation_key:'current_fixture_chat',expected_commit:f.expected,task_file:'.openclaw/tasks/check.json',workspace_mode:'current'};
 await projectExecution('openclaw_project_execute',input,{...f,policy:async()=>f.policy,launch:async()=>{}});
 await runRegisteredExecution(f.binding,input.operation_id,{store:f.store,policyLoad:async()=>f.policy});
 const r=await f.store.get(input.operation_id);assert.equal(r.state,'blocked');assert.equal(r.reason,'current_commit_mismatch');assert.equal(r.steps.length,0);assert.equal(f.git(f.repo,'rev-parse','HEAD'),old);await assert.rejects(readFile(join(f.repo,'.git/FETCH_HEAD')),/ENOENT/);
});

test('current mode does not execute an entry script changed outside the pinned commit',async t=>{
 const f=await gitFixture(t,9);f.git(f.repo,'pull','--ff-only');await writeFile(join(f.repo,'scripts/check.mjs'),'throw Error("unreviewed")');
 const input={action:'repository_task',operation_id:'current_entry_changed_001',conversation_key:'current_fixture_chat',expected_commit:f.expected,task_file:'.openclaw/tasks/check.json',workspace_mode:'current'};
 await projectExecution('openclaw_project_execute',input,{...f,policy:async()=>f.policy,launch:async()=>{}});
 await runRegisteredExecution(f.binding,input.operation_id,{store:f.store,policyLoad:async()=>f.policy});
 const r=await f.store.get(input.operation_id);assert.equal(r.reason,'task_script_revision_changed');assert.equal(r.steps.length,0);assert.equal(await readFile(join(f.repo,'scripts/check.mjs'),'utf8'),'throw Error("unreviewed")');
});

test('current mode blocks an in-progress Git operation without changing checkout state',async t=>{
 const f=await gitFixture(t,10);f.git(f.repo,'pull','--ff-only');await writeFile(join(f.repo,'.git/MERGE_HEAD'),f.expected+'\n');
 const input={action:'repository_task',operation_id:'current_merging_001',conversation_key:'current_fixture_chat',expected_commit:f.expected,task_file:'.openclaw/tasks/check.json'};
 await projectExecution('openclaw_project_execute',input,{...f,policy:async()=>f.policy,launch:async()=>{}});
 await runRegisteredExecution(f.binding,input.operation_id,{store:f.store,policyLoad:async()=>f.policy});
 const r=await f.store.get(input.operation_id);assert.equal(r.state,'blocked');assert.equal(r.reason,'git_operation_in_progress');assert.equal(r.steps.length,0);assert.equal(await readFile(join(f.repo,'.git/MERGE_HEAD'),'utf8'),f.expected+'\n');
});

test('old mode-less jobs retain their original identity and are never migrated or relaunched',async t=>{
 const f=await gitFixture(t,11),input={action:'repository_task',operation_id:'legacy_task_default_001',conversation_key:'legacy_fixture_chat',expected_commit:f.expected,task_file:'.openclaw/tasks/check.json'};
 const digest=createHash('sha256').update(JSON.stringify([f.binding.projectKey,f.binding.agentId,input.operation_id,input.conversation_key,input.action,input.expected_commit,input.task_file])).digest('hex');
 await f.store.begin(input,digest);let launched=0;const opts={...f,policy:async()=>f.policy,launch:async()=>{launched++;}};
 assert.equal((await projectExecution('openclaw_project_execute',input,opts)).state,'accepted');
 assert.equal((await projectExecution('openclaw_project_execute',{...input,workspace_mode:'in_place'},opts)).state,'accepted');
 assert.equal((await projectExecution('openclaw_project_execute',{...input,workspace_mode:'current'},opts)).reason,'operation_id_conflict');
 assert.equal((await f.store.get(input.operation_id)).input.workspace_mode,undefined);assert.equal(launched,0);
});
