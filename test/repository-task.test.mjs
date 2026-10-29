import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {parseRepositoryTask,loadRepositoryTask,verifyTaskScript,executeRepositoryTask,taskFilePath}
 from '../integrations/chatgpt-openclaw/repository-task.mjs';
import {executionCommand} from '../integrations/chatgpt-openclaw/project-execution-command.mjs';
const definition=()=>({schemaVersion:1,title:'Generic local verification',steps:[
 {name:'verify',runtime:'node',script:'scripts/verify.mjs',args:['@output_dir','$(do-not-evaluate)']}],
 artifacts:[{id:'summary',file:'report.json',format:'json'}]});
test('one repository task format describes scripts, arguments and declared artifacts',()=>{
 const p=parseRepositoryTask(JSON.stringify(definition()));assert.equal(p.steps[0].timeoutSeconds,60);
 assert.deepEqual(p.steps[0].args,['@output_dir','$(do-not-evaluate)']);assert.equal(p.artifacts[0].format,'json');
 assert.equal(taskFilePath('.openclaw/tasks/check.json'),true);
 for(const path of ['../check.json','/tmp/x.json','.openclaw/tasks/../x.json','.openclaw/tasks/x.json;run'])assert.equal(taskFilePath(path),false);
});
test('task data rejects shell commands, environment overrides, traversal and invalid artifacts',()=>{
 for(const change of [d=>d.command='anything',d=>d.steps[0].command='anything',d=>d.steps[0].env={KEY:'value'},
  d=>d.steps[0].script='../escape.py',d=>d.steps[0].script='/bin/bash',d=>d.steps[0].script='scripts/link.sh',
  d=>d.steps[0].args=['\x00'],d=>d.steps[0].name=['fake'],d=>d.artifacts[0].file='../secret',
  d=>d.artifacts[0].id='execution_log',d=>d.artifacts[0].format='zip_json',d=>d.steps[0].timeoutSeconds=601]){
  const d=definition();change(d);assert.throws(()=>parseRepositoryTask(JSON.stringify(d)));
 }
});
async function repoFixture(t){
 const root=await realpath(await mkdtemp(join(tmpdir(),'ioant-generic-task-')));t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(join(root,'.openclaw/tasks'),{recursive:true});await mkdir(join(root,'scripts'));
 await writeFile(join(root,'.openclaw/tasks/check.json'),JSON.stringify(definition()));
 await writeFile(join(root,'scripts/verify.mjs'),'console.log("GENERIC_TASK_OK");\n');
 const git=(...args)=>execFileSync('/usr/bin/git',args,{cwd:root,encoding:'utf8',env:{...process.env,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'}}).trim();
 git('init','-q');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture');
 const commit=git('rev-parse','HEAD');return {root,commit,policy:{repo:root,scriptRoots:['scripts'],runtimes:{node:process.execPath}}};
}
test('the same loader runs two independent Git fixtures without a project-name branch',async t=>{
 for(let i=0;i<2;i++){
  const f=await repoFixture(t),plan=await loadRepositoryTask(f.policy,f.commit,'.openclaw/tasks/check.json');
  assert.equal(plan.commit,f.commit);assert.match(plan.steps[0].blobOid,/^[a-f0-9]{40}$/);
  const calls=[];await executeRepositoryTask(plan,f.policy,{operationId:'generic_fixture_'+i,outputDir:join(f.root,'outputs'),
   step:async(name,file,args,options)=>{calls.push({name,file,args,options});}});
  assert.equal(calls.length,1);assert.equal(calls[0].file,process.execPath);
  assert.deepEqual(calls[0].args,[join(f.root,'scripts/verify.mjs'),join(f.root,'outputs'),'$(do-not-evaluate)']);
  assert.equal(calls[0].options.env.OPENCLAW_OPERATION_ID,'generic_fixture_'+i);
  assert.equal(calls[0].options.env.OPENAI_API_KEY,undefined);
 }
});
test('untracked definitions, changed scripts and roots outside the local grant are refused',async t=>{
 const f=await repoFixture(t),plan=await loadRepositoryTask(f.policy,f.commit,'.openclaw/tasks/check.json');
 await assert.rejects(loadRepositoryTask(f.policy,f.commit,'.openclaw/tasks/missing.json'),/tracked_regular/);
 await assert.rejects(loadRepositoryTask({...f.policy,scriptRoots:['other']},f.commit,'.openclaw/tasks/check.json'),/outside_workspace_grant/);
 await writeFile(join(f.root,'scripts/verify.mjs'),'changed\n');
 await assert.rejects(verifyTaskScript(f.policy,plan,plan.steps[0]),/revision_changed/);
});
test('the generic kernel executes an actual tracked script with literal argv and no model',async t=>{
 const f=await repoFixture(t),plan=await loadRepositoryTask(f.policy,f.commit,'.openclaw/tasks/check.json');
 const outputDir=join(f.root,'outputs');await mkdir(outputDir,{mode:0o700});const results=[];
 const r=await executeRepositoryTask(plan,f.policy,{operationId:'generic_actual_0001',outputDir,
  step:async(name,file,args,options)=>{
   const result=await executionCommand(file,args,{cwd:f.root,...options});
   assert.equal(result.ok,true);results.push(result.stdout.trim());
  }});
 assert.equal(r.completedSteps,1);assert.deepEqual(results,['GENERIC_TASK_OK']);
});
