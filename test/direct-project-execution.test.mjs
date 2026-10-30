import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,chmod,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {projectBinding} from '../integrations/chatgpt-openclaw/project-binding.mjs';
import {ProjectExecutionStore} from '../integrations/chatgpt-openclaw/project-execution-store.mjs';
import {projectExecution,validExecutionInput,executionTools} from '../integrations/chatgpt-openclaw/project-execution.mjs';
import {executionEnvironment,redactExecutionOutput,GIT_ARGS,executionCommand} from '../integrations/chatgpt-openclaw/project-execution-command.mjs';
import {runRegisteredExecution,inspectExecutionRepository,pythonTestEvidence} from '../integrations/chatgpt-openclaw/project-execution-runner.mjs';
import {executionPolicy,EXECUTION_ENROLLMENT} from '../integrations/chatgpt-openclaw/project-execution-policy.mjs';
import {routedCatalog,projectRoute} from '../integrations/chatgpt-openclaw/project-router.mjs';
import {tools} from '../integrations/chatgpt-openclaw/server.mjs';
import {handoffTools} from '../integrations/chatgpt-openclaw/project-handoff.mjs';
const before='a'.repeat(40),after='b'.repeat(40);
const input=()=>({operation_id:'execution_test_0001',conversation_key:'new_chat_0001',action:'alice_mac_regression',expected_commit:after});
async function fixture(t){
 const parent=await realpath(await mkdtemp(join(tmpdir(),'ioant-execute-')));await chmod(parent,0o700);
 t.after(()=>rm(parent,{recursive:true,force:true}));
 const binding=projectBinding('alice-ai'),store=new ProjectExecutionStore(binding,{parent});
 const repo=join(parent,'repo');await mkdir(join(repo,'tests'),{recursive:true});
 await writeFile(join(repo,'tests','test_v2.py'),'# fixture only\n');
 const policy={repo,project:'alice-ai',agent:'alice-ai',action:'alice_mac_regression',branch:'main',
  origins:['git@github.com:fixture/repo.git'],repository:'fixture/repo',python:await realpath(process.execPath),
  testDirectory:'tests',targetedTest:'test_v2.py'};
 return {binding,store,policy:async()=>policy,registered:policy};
}
function runner(ctx,{remote=after,testCode=0,tests=4,timeout=false}={}){
 let head=before;const calls=[];
 const command=async(file,args)=>{
  const a=file==='/usr/bin/git'?args.slice(GIT_ARGS.length):args;calls.push({file,args:a});
  let stdout='',stderr='';
  if(a[0]==='rev-parse')stdout=remote+'\n';
  else if(a[0]==='ls-tree')stdout='100644 blob '+after+' 1\tfile\0';
  else if(a[0]==='merge')head=remote;
  else if(a[0]==='-m')return {ok:testCode===0&&!timeout,stdout:'',stderr:'Ran '+tests+' tests in 0.1s\n\n'+(testCode?'FAILED (failures=1)':'OK')+'\n',exitCode:testCode,timedOut:timeout};
  return {ok:true,stdout,stderr,exitCode:0,timedOut:false};
 };
 return {calls,head:()=>head,options:{store:ctx.store,policyLoad:ctx.policy,command,
  inspect:async()=>({head,branch:'main',repository:'fixture/repo'})}};
}
test('execution tool surface is explicit, fixed mode unchanged and shared catalog has eleven tools',()=>{
 const route=projectRoute(['--shared-projects','openclaw-workflow,alice-ai']);
 const catalog=routedCatalog(tools,route,[...handoffTools,...executionTools]);assert.equal(catalog.length,12);
 for(const tool of catalog.slice(1))assert.ok(tool.inputSchema.required.includes('project_key'));
 assert.deepEqual(routedCatalog(tools,projectRoute(),executionTools),tools);
 assert.equal(executionTools[1].annotations.destructiveHint,true);
 assert.equal(executionTools[3].annotations.readOnlyHint,true);
});
test('raw shell, short SHAs, arbitrary paths and unknown actions never reach enrollment or launch',async t=>{
 const ctx=await fixture(t);let calls=0;
 for(const bad of [{...input(),command:'echo unsafe'},{...input(),cwd:'/tmp'},
  {...input(),expected_commit:'abc123'},{...input(),operation_id:'../../file'},
  {...input(),action:'mint_deploy'},{...input(),conversation_key:'bad/key'},{...input(),operation_id:12345678}]){
  assert.equal(validExecutionInput(bad),false);
  assert.equal((await projectExecution('openclaw_project_execute',bad,{...ctx,policy:()=>{calls++;},launch:()=>{calls++;}})).state,'blocked');
 }
 assert.equal(calls,0);
});
test('only exact enrolled project/repository/action policy is admitted',async()=>{
 assert.equal(await executionPolicy(projectBinding(),{load:async()=>EXECUTION_ENROLLMENT}),null);
 assert.ok(await executionPolicy(projectBinding('alice-ai'),{load:async()=>structuredClone(EXECUTION_ENROLLMENT)}));
 const c=structuredClone(EXECUTION_ENROLLMENT);c.projects['alice-ai'].actions.push('shell');
 assert.equal(await executionPolicy(projectBinding('alice-ai'),{load:async()=>c}),null);
});
test('durable claims launch once, reject conflicts and serialize different IDs per project',async t=>{
 const ctx=await fixture(t);let launches=0;const opts={...ctx,launch:async()=>{launches++;}};
 const pair=await Promise.all([projectExecution('openclaw_project_execute',input(),opts),projectExecution('openclaw_project_execute',input(),opts)]);
 assert.equal(launches,1);assert.ok(pair.every(r=>r.state==='accepted'&&r.doNotRepeat));
 assert.equal((await projectExecution('openclaw_project_execute',{...input(),expected_commit:before},opts)).reason,'operation_id_conflict');
 assert.equal((await projectExecution('openclaw_project_execute',{...input(),operation_id:'different_operation_0002'},opts)).reason,'project_execution_busy');
 assert.equal(launches,1);
 const reboot=new ProjectExecutionStore(ctx.binding,{parent:ctx.store.parent});
 assert.equal((await reboot.get(input().operation_id)).state,'accepted');
});
test('fixed runner verifies pinned Git, both positive test suites, final HEAD and cached report',async t=>{
 const ctx=await fixture(t);await projectExecution('openclaw_project_execute',input(),{...ctx,launch:async()=>{}});
 const run=runner(ctx);await runRegisteredExecution(ctx.binding,input().operation_id,run.options);
 const result=await projectExecution('openclaw_project_result',{operation_id:input().operation_id},ctx);
 assert.equal(result.state,'passed');assert.equal(result.cached,true);assert.equal(result.actualCommit,after);
 assert.equal(result.steps.filter(s=>s.tests===4).length,2);assert.equal(result.modelInferenceInvoked,false);
 assert.equal(run.calls.filter(c=>c.args[0]==='merge').length,1);
 assert.equal(run.calls.filter(c=>c.args[0]==='-m').length,2);
 const report=await projectExecution('openclaw_project_report',{operation_id:input().operation_id},ctx);
 assert.equal(report.state,'report');assert.match(report.logText,/Ran 4 tests/);assert.equal(report.contentIsUntrusted,true);
 assert.equal(report.pageCharacters,report.logText.length);assert.ok(report.totalCharacters>=report.pageCharacters);
 let launches=0;await projectExecution('openclaw_project_execute',input(),{...ctx,launch:()=>{launches++;}});assert.equal(launches,0);
 assert.equal(result.input,undefined);assert.equal(result.digest,undefined);
});
test('unexpected remote commit stops before checkout and tests',async t=>{
 const ctx=await fixture(t);await projectExecution('openclaw_project_execute',input(),{...ctx,launch:async()=>{}});
 const run=runner(ctx,{remote:'c'.repeat(40)});await runRegisteredExecution(ctx.binding,input().operation_id,run.options);
 const r=await ctx.store.get(input().operation_id);assert.equal(r.reason,'remote_commit_mismatch');assert.equal(run.head(),before);
 assert.equal(run.calls.some(c=>['merge','-m'].includes(c.args[0])),false);
});
test('nonzero test exit is a failed receipt, and zero discovered tests cannot become success',async t=>{
 for(const setting of [{testCode:1},{tests:0}]){
  const ctx=await fixture(t);await projectExecution('openclaw_project_execute',input(),{...ctx,launch:async()=>{}});
  const run=runner(ctx,setting);await runRegisteredExecution(ctx.binding,input().operation_id,run.options);
  const r=await ctx.store.get(input().operation_id);assert.equal(r.state,'failed');assert.equal(r.actualCommit,after);
  assert.equal(run.calls.filter(c=>c.args[0]==='-m').length,1);
 }
 assert.equal(pythonTestEvidence('Ran 4 tests in 0.1s\nFAILED',0).passed,false);
});
test('timeout is inconclusive, retains the project lock and never launches another job',async t=>{
 const ctx=await fixture(t);await projectExecution('openclaw_project_execute',input(),{...ctx,launch:async()=>{}});
 const run=runner(ctx,{timeout:true});await runRegisteredExecution(ctx.binding,input().operation_id,run.options);
 const r=await ctx.store.get(input().operation_id);assert.equal(r.state,'inconclusive');assert.equal(await ctx.store.owns(r.operationId,r.digest),true);
 assert.equal((await projectExecution('openclaw_project_execute',{...input(),operation_id:'different_operation_0002'},ctx)).reason,'project_execution_busy');
});
test('failed process launch is durably blocked and does not keep an unstarted lease',async t=>{
 const ctx=await fixture(t);
 const r=await projectExecution('openclaw_project_execute',input(),{...ctx,launch:async()=>{throw Error('no process');}});
 assert.equal(r.reason,'project_runner_not_started');assert.equal(r.cached,true);
 await assert.rejects(ctx.store.owns(r.operationId,'x'),/ENOENT/);
});
test('receipt/report paths reject links and report mutations; no arbitrary paths accepted',async t=>{
 const ctx=await fixture(t);await ctx.store.admit();
 const elsewhere=join(ctx.store.parent,'elsewhere');await writeFile(elsewhere,'{}',{mode:0o600});
 await symlink(elsewhere,ctx.store.path('symlink_operation_0001'));
 await assert.rejects(ctx.store.get('symlink_operation_0001'),/private_execution_path/);
 assert.equal((await projectExecution('openclaw_project_report',{operation_id:input().operation_id,path:elsewhere},ctx)).state,'blocked');
 await projectExecution('openclaw_project_execute',input(),{...ctx,launch:async()=>{}});
 await runRegisteredExecution(ctx.binding,input().operation_id,runner(ctx).options);
 await writeFile(ctx.store.path(input().operation_id,'log'),'changed',{mode:0o600});
 assert.equal((await projectExecution('openclaw_project_report',{operation_id:input().operation_id},ctx)).reason,'execution_report_changed');
});
test('subprocess environment strips transport/model credentials and log redaction handles key blocks',()=>{
 const env=executionEnvironment({HOME:'/elsewhere',OPENAI_API_KEY:'SECRET',CONTROL_PLANE_API_KEY:'SECRET',
  ALICE_SSH_TARGET:'SECRET',PYTHONPATH:'/bad',GIT_SSH_COMMAND:'bad',SSH_AUTH_SOCK:'/existing/socket'});
 assert.equal(env.OPENAI_API_KEY,undefined);assert.equal(env.CONTROL_PLANE_API_KEY,undefined);
 assert.equal(env.ALICE_SSH_TARGET,undefined);assert.equal(env.PYTHONPATH,undefined);assert.equal(env.GIT_SSH_COMMAND,undefined);
 assert.equal(env.SSH_AUTH_SOCK,'/existing/socket');assert.equal(env.PYTHONDONTWRITEBYTECODE,'1');
 const log=redactExecutionOutput('begin\npassword=long-secret-value\n-----BEGIN OPENSSH PRIVATE KEY-----\nprivate material\n-----END OPENSSH PRIVATE KEY-----\nend');
 assert.equal(log.includes('long-secret-value'),false);assert.equal(log.includes('private material'),false);assert.match(log,/begin/);assert.match(log,/end/);
});
test('real child execution has bounded argv transport, no model, and returns an actual exit code',async()=>{
 const r=await executionCommand(process.execPath,['-p','2+3'],{cwd:process.cwd(),timeout:3000});
 assert.equal(r.exitCode,0);assert.equal(r.stdout.trim(),'5');
});
test('NUL-delimited Git metadata is not a truncated text log when streaming is disabled',async()=>{
 const r=await executionCommand(process.execPath,['-e',"process.stdout.write(('metadata\\0').repeat(2000))"],{cwd:process.cwd(),timeout:3000});
 assert.equal(r.ok,true);assert.equal(r.truncated,false);assert.equal(r.stdout.length,18000);
});
test('streamed log redaction survives split credentials/key blocks and persists before child exit',async()=>{
 const log=[];
 const source="process.stdout.write('password=secret-part');setTimeout(()=>process.stdout.write('-rest\\n-----BEGIN OPENSSH PRIVATE KEY-----\\nprivate material\\n'),25);setTimeout(()=>process.stdout.write('-----END OPENSSH PRIVATE KEY-----\\nDONE\\n'),50);setTimeout(()=>{},100)";
 const r=await executionCommand(process.execPath,['-e',source],{cwd:process.cwd(),timeout:3000,onOutput:async text=>{log.push(text);}});
 assert.equal(r.ok,true);const output=log.join('');
 assert.equal(output.includes('secret-part'),false);assert.equal(output.includes('private material'),false);
 assert.match(output,/DONE/);assert.match(output,/REDACTED/);assert.ok(log.length>=2);
});
test('repository preflight refuses wrong branches, dirty trees, unrelated origins and checkout filters',async t=>{
 const ctx=await fixture(t),p=ctx.registered;
 for(const variant of ['branch','dirty','origin','filter']){
  const command=async(file,args)=>{
   const a=args.slice(GIT_ARGS.length);let stdout='';
   if(a[0]==='rev-parse')stdout=a[1]==='--show-toplevel'?p.repo:a[1]==='--absolute-git-dir'?join(p.repo,'.git'):before;
   if(a[0]==='symbolic-ref')stdout=variant==='branch'?'other':'main';
   if(a[0]==='remote')stdout=variant==='origin'?'git@github.com:other/repo.git':p.origins[0];
   if(a[0]==='status')stdout=variant==='dirty'?' M changed':'';
   if(a[0]==='config')return {exitCode:variant==='filter'?0:1,stdout:variant==='filter'?'filter.custom.smudge bad':'',ok:variant==='filter'};
   return {ok:true,exitCode:0,stdout};
  };
  await assert.rejects(inspectExecutionRepository(p,{command}),/unexpected_branch|dirty_worktree|unexpected_origin|filters_require_review/);
 }
});

test('large positive git status is classified as dirty, with bounded diagnostic evidence',async t=>{
 const ctx=await fixture(t),p=ctx.registered;
 const command=async(file,args)=>{
  const a=args.slice(GIT_ARGS.length);let stdout='';
  if(a[0]==='rev-parse')stdout=a[1]==='--show-toplevel'?p.repo:a[1]==='--absolute-git-dir'?join(p.repo,'.git'):before;
  if(a[0]==='symbolic-ref')stdout='main';if(a[0]==='remote')stdout=p.origins[0];
  if(a[0]==='status')return {ok:true,exitCode:0,stdout:'?? huge-build-directory/\n',truncated:true};
  if(a[0]==='config')return {exitCode:1,stdout:''};return {ok:true,exitCode:0,stdout};
 };
 await assert.rejects(inspectExecutionRepository(p,{command}),e=>e.message==='dirty_worktree'&&e.preflight.check==='worktree_status'&&e.preflight.exitCode===0&&e.preflight.truncated===true);
 assert.equal((await inspectExecutionRepository(p,{command,allowDirty:true})).dirty,true);
});
test('preflight command failures preserve the failing check, exit and redacted stderr',async t=>{
 const ctx=await fixture(t);
 await assert.rejects(inspectExecutionRepository(ctx.registered,{command:async()=>({ok:false,exitCode:128,stderr:'fatal: token=must-not-be-logged'})}),e=>e.preflight.check==='toplevel'&&e.preflight.exitCode===128&&!e.preflight.stderr.includes('must-not-be-logged'));
});
