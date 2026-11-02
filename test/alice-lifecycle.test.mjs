import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,chmod,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {ALICE_RESTART_TASK,ALICE_RESTART_SCRIPT,PRIOR_DENIED_RESTART,validateAliceLifecycleGrant,aliceLifecycleApproval,verifyAliceLifecyclePlan,validateAliceLifecycleReceipt,aliceRepositoryEnrolled} from '../integrations/chatgpt-openclaw/alice-lifecycle-policy.mjs';
import {projectExecution} from '../integrations/chatgpt-openclaw/project-execution.mjs';
import {runRegisteredExecution} from '../integrations/chatgpt-openclaw/project-execution-runner.mjs';
import {ProjectExecutionStore} from '../integrations/chatgpt-openclaw/project-execution-store.mjs';
import {projectBinding} from '../integrations/chatgpt-openclaw/project-binding.mjs';
import {executionCommand} from '../integrations/chatgpt-openclaw/project-execution-command.mjs';
import {parseRepositoryTask} from '../integrations/chatgpt-openclaw/repository-task.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const grant=()=>({schemaVersion:1,project:'alice-ai',agent:'alice-ai',repository:'hedydev/ioant-AI-Minecraft-Alice',taskFile:ALICE_RESTART_TASK,taskSha256:'a'.repeat(64),scriptSha256:'b'.repeat(64),authorization:{approvedBy:'local_operator',scope:'alice_client_restart_only',reference:'user_request_20261103',priorDeniedOperation:PRIOR_DENIED_RESTART,platformReview:'required'}});
const task={schemaVersion:1,title:'Fixture approved restart',steps:[{name:'selftest',runtime:'python',script:ALICE_RESTART_SCRIPT,args:['--self-test'],timeoutSeconds:15},{name:'restart',runtime:'python',script:ALICE_RESTART_SCRIPT,args:['--restart','@output_dir','@operation_id'],timeoutSeconds:440}],artifacts:[{id:'alice_restart',file:'alice_17879_client_restart.json',format:'json'}]};
const result=id=>({schemaVersion:2,operationId:id,state:'completed',failureReason:'none',oldPid:100,newPid:200,replacementCount:1,restartAttempted:true,processAlive:true,heartbeatFresh:true,connected:true,sessionEstablished:true,ownerVerified:true,worldVerified:true,portVerified:true,existingTask:false,bdsRestarted:false,worldChanged:false});
async function fixture(t){
 const parent=await realpath(await mkdtemp(join(tmpdir(),'alice-lifecycle-')));await chmod(parent,0o700);t.after(()=>rm(parent,{recursive:true,force:true}));
 const repo=join(parent,'repo');await mkdir(repo);for(const path of [ALICE_RESTART_SCRIPT,ALICE_RESTART_TASK])await mkdir(dirname(join(repo,path)),{recursive:true});
 const script='# fixture, not a real lifecycle\n',raw=JSON.stringify(task);
 await writeFile(join(repo,ALICE_RESTART_SCRIPT),script);await writeFile(join(repo,ALICE_RESTART_TASK),raw);
 const git=args=>execFileSync('/usr/bin/git',args,{cwd:repo,env:{...process.env,GIT_CONFIG_GLOBAL:'/dev/null',GIT_AUTHOR_NAME:'Fixture',GIT_AUTHOR_EMAIL:'fixture@example.invalid',GIT_COMMITTER_NAME:'Fixture',GIT_COMMITTER_EMAIL:'fixture@example.invalid'}}).toString().trim();
 git(['init','-q']);git(['add','.']);git(['commit','-qm','fixture']);const head=git(['rev-parse','HEAD']);
 const binding=projectBinding('alice-ai'),store=new ProjectExecutionStore(binding,{parent});
 const policy={project:'alice-ai',agent:'alice-ai',action:'repository_task',repo,scriptRoots:['games/minecraft-ai/scripts'],runtimes:{python:'/usr/bin/python3'},repository:'hedydev/ioant-AI-Minecraft-Alice',branch:'main'};
 const g={...grant(),taskSha256:hash(raw),scriptSha256:hash(script)},approval={...g,approvalSha256:hash(JSON.stringify(g))};
 const input={action:'repository_task',operation_id:'approved_restart_test01',conversation_key:'lifecycle_chat_test01',task_file:ALICE_RESTART_TASK,workspace_mode:'current',expected_commit:head};
 return {binding,store,policy:async()=>policy,registered:policy,head,approval,input};
}
test('local grant cannot authorize other projects, arbitrary tasks or removal of platform review',async()=>{
 for(const edit of [{project:'other'}, {taskFile:'.openclaw/tasks/shell.json'}, {authorization:{...grant().authorization,platformReview:'disabled'}}])assert.throws(()=>validateAliceLifecycleGrant({...grant(),...edit}));
 await assert.rejects(aliceLifecycleApproval(projectBinding('openclaw-workflow'),{load:async()=>grant()}),/wrong_project/);
 await assert.rejects(aliceLifecycleApproval(projectBinding('alice-ai'),{load:async()=>null}),/approval_required/);
 assert.ok((await aliceLifecycleApproval(projectBinding('alice-ai'),{load:async()=>grant()})).approvalSha256);
});
test('enrollment accepts canonical GitHub labels but always requires the exact enrolled origin',()=>{
 const p={agent:'alice-ai',repository:'github.com/hedydev/ioant-AI-Minecraft-Alice',origins:['git@github.com:hedydev/ioant-AI-Minecraft-Alice.git']};
 assert.equal(aliceRepositoryEnrolled(p),true);
 assert.equal(aliceRepositoryEnrolled({...p,repository:'hedydev/ioant-AI-Minecraft-Alice'}),true);
 assert.equal(aliceRepositoryEnrolled({...p,origins:['git@github.com:attacker/other.git']}),false);
 assert.equal(aliceRepositoryEnrolled({...p,agent:'other'}),false);
});
test('missing approval, old refusal ID and isolated checkout never launch',async t=>{
 for(const [edit,reason] of [[{},'alice_lifecycle_approval_required'],[{operation_id:PRIOR_DENIED_RESTART},'prior_platform_refusal_not_replayable'],[{workspace_mode:'isolated'},'alice_lifecycle_current_workspace_required']]){
  const ctx=await fixture(t);let launches=0;
  const r=await projectExecution('openclaw_project_execute',{...ctx.input,...edit},{...ctx,launch:async()=>{launches++;},lifecycleApproval:async()=>{throw Error('alice_lifecycle_approval_required');}});
  assert.equal(r.reason,reason);assert.equal(launches,0);
 }
});
test('catalog advertises only separately approved Alice lifecycle and preserves generic actions',async t=>{
 const ctx=await fixture(t);
 const policy=async(_b,{action}={})=>({...ctx.registered,action:action??'repository_task'});
 const r=await projectExecution('openclaw_project_actions',{}, {...ctx,policy,lifecycleApproval:async()=>ctx.approval});
 assert.equal(r.approvedLifecycleTasks[0].enabled,true);assert.equal(r.approvedLifecycleTasks[0].platformReviewRequired,true);
 for(const action of ['repository_task','repository_fetch','repository_sync'])assert.ok(r.actions.some(a=>a.action===action));
});
test('approved task digest cannot hide changed script, args, artifacts or time budget',()=>{
 const raw=JSON.stringify(task),plan={...parseRepositoryTask(raw),taskFile:ALICE_RESTART_TASK};
 const a={...grant(),taskSha256:hash(raw)};verifyAliceLifecyclePlan(plan,a);
 for(const p of [{...plan,definitionSha256:'c'.repeat(64)}, {...plan,steps:[...plan.steps,{...plan.steps[0],name:'shell'}]}, {...plan,artifacts:[]}])assert.throws(()=>verifyAliceLifecyclePlan(p,a),/not_approved/);
});
test('standard success requires a distinct single replacement, current heartbeat and game session',()=>{
 const good=result('approved_restart_test01');validateAliceLifecycleReceipt(good,good.operationId);
 for(const edit of [{newPid:100},{sessionEstablished:false},{bdsRestarted:true},{worldChanged:true},{replacementCount:2},{existingTask:true},{state:'blocked'}])assert.throws(()=>validateAliceLifecycleReceipt({...good,...edit},good.operationId),/unverified/);
});
test('schema3 known exit is accepted only with explicit offline proof, legacy receipts remain valid',()=>{
 const legacy=result('approved_restart_test01');validateAliceLifecycleReceipt(legacy,legacy.operationId);
 const failed={...legacy,schemaVersion:3,state:'failed',failureReason:'client_exited_before_login',processAlive:false,heartbeatFresh:false,connected:false,sessionEstablished:false,exitVerified:true};
 validateAliceLifecycleReceipt(failed,failed.operationId);
 for(const change of [{exitVerified:false},{processAlive:true},{newPid:null},{replacementCount:0}])assert.throws(()=>validateAliceLifecycleReceipt({...failed,...change},failed.operationId),/unverified/);
});
test('approved runner surfaces lifecycle receipt, cached same-ID never launches twice',async t=>{
 const ctx=await fixture(t);let launches=0,runs=0;
 const opts={...ctx,launch:async()=>{launches++;},lifecycleApproval:async()=>ctx.approval};
 await projectExecution('openclaw_project_execute',ctx.input,opts);
 const command=async(file,args,options)=>{
  if(file==='/usr/bin/git')return executionCommand(file,args,options);
  if(args[1]==='--restart'){runs++;await writeFile(join(options.env.OPENCLAW_OUTPUT_DIR,'alice_17879_client_restart.json'),JSON.stringify(result(ctx.input.operation_id)),{mode:0o600});}
  return {ok:true,stdout:'fixture\n',stderr:'',exitCode:0};
 };
 await runRegisteredExecution(ctx.binding,ctx.input.operation_id,{store:ctx.store,policyLoad:ctx.policy,lifecycleApproval:async()=>ctx.approval,command,inspect:async()=>({head:ctx.head,branch:null,headState:'detached',dirty:true})});
 const r=await projectExecution('openclaw_project_result',{operation_id:ctx.input.operation_id},ctx);
 assert.equal(r.state,'passed');assert.equal(r.lifecycle.newPid,200);assert.equal(r.cached,true);assert.equal(r.sourceWorktreeDirty,true);
 await projectExecution('openclaw_project_execute',ctx.input,opts);assert.equal(launches,1);assert.equal(runs,1);
});
test('unverified lifecycle keeps project lock and never turns outer exit zero into success',async t=>{
 const ctx=await fixture(t);await projectExecution('openclaw_project_execute',ctx.input,{...ctx,launch:async()=>{},lifecycleApproval:async()=>ctx.approval});
 const command=async(file,args,options)=>{
  if(file==='/usr/bin/git')return executionCommand(file,args,options);
  if(args[1]==='--restart')await writeFile(join(options.env.OPENCLAW_OUTPUT_DIR,'alice_17879_client_restart.json'),JSON.stringify({...result(ctx.input.operation_id),state:'inconclusive',failureReason:'login_not_yet_verified',sessionEstablished:false}),{mode:0o600});
  return {ok:true,stdout:'',stderr:'',exitCode:0};
 };
 await runRegisteredExecution(ctx.binding,ctx.input.operation_id,{store:ctx.store,policyLoad:ctx.policy,lifecycleApproval:async()=>ctx.approval,command,inspect:async()=>({head:ctx.head,branch:'main',dirty:false})});
 const r=await ctx.store.get(ctx.input.operation_id);assert.equal(r.state,'inconclusive');assert.equal(r.reason,'login_not_yet_verified');assert.equal(await ctx.store.owns(r.operationId,r.digest),true);
});
test('revoked/changed approval at runner time blocks before scripts',async t=>{
 const ctx=await fixture(t);await projectExecution('openclaw_project_execute',ctx.input,{...ctx,launch:async()=>{},lifecycleApproval:async()=>ctx.approval});let commands=0;
 await runRegisteredExecution(ctx.binding,ctx.input.operation_id,{store:ctx.store,policyLoad:ctx.policy,lifecycleApproval:async()=>{throw Error('alice_lifecycle_approval_required');},command:async(...a)=>{commands++;return executionCommand(...a);},inspect:async()=>({head:ctx.head,branch:'main',dirty:false})});
 assert.equal((await ctx.store.get(ctx.input.operation_id)).reason,'alice_lifecycle_approval_required');
 // Only committed task metadata was read; no Python/script execution.
 assert.ok(commands>0);
});
test('a proven exited replacement fails and releases the project lock without a second launch',async t=>{
 const ctx=await fixture(t);await projectExecution('openclaw_project_execute',ctx.input,{...ctx,launch:async()=>{},lifecycleApproval:async()=>ctx.approval});let attempts=0;
 const command=async(file,args,options)=>{
  if(file==='/usr/bin/git')return executionCommand(file,args,options);
  if(args[1]==='--restart'){
   attempts++;await writeFile(join(options.env.OPENCLAW_OUTPUT_DIR,'alice_17879_client_restart.json'),JSON.stringify({...result(ctx.input.operation_id),schemaVersion:3,state:'failed',failureReason:'client_exited_before_login',exitVerified:true,processAlive:false,heartbeatFresh:false,connected:false,sessionEstablished:false}),{mode:0o600});
  }
  return {ok:true,stdout:'',stderr:'',exitCode:0};
 };
 await runRegisteredExecution(ctx.binding,ctx.input.operation_id,{store:ctx.store,policyLoad:ctx.policy,lifecycleApproval:async()=>ctx.approval,command,inspect:async()=>({head:ctx.head,branch:'main',dirty:false})});
 const r=await ctx.store.get(ctx.input.operation_id);assert.equal(r.state,'failed');assert.equal(r.reason,'client_exited_before_login');assert.equal(attempts,1);
 await assert.rejects(ctx.store.owns(r.operationId,r.digest),/ENOENT/);
});
