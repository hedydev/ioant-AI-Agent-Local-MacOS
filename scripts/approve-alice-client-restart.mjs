#!/usr/bin/env node
// Local operator command only; deliberately not exposed as an MCP grant writer.
import {readFile,writeFile,rename,lstat,realpath} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {dirname,join} from 'node:path';
import {ALICE_LIFECYCLE_GRANT,ALICE_RESTART_TASK,ALICE_RESTART_SCRIPT,PRIOR_DENIED_RESTART,validateAliceLifecycleGrant,verifyAliceLifecyclePlan} from '../integrations/chatgpt-openclaw/alice-lifecycle-policy.mjs';
import {readRepositoryTaskGrants} from '../integrations/chatgpt-openclaw/repository-task-policy.mjs';
import {loadRepositoryTask,verifyTaskScript} from '../integrations/chatgpt-openclaw/repository-task.mjs';
import {executionCommand,GIT_ARGS} from '../integrations/chatgpt-openclaw/project-execution-command.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
if(process.argv.length!==3||!['--approve','--revoke'].includes(process.argv[2]))throw Error('usage_approve_or_revoke');
const parent=dirname(ALICE_LIFECYCLE_GRANT),s=await lstat(parent);
if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077)!==0||await realpath(parent)!==parent)throw Error('private_operator_directory_required');
if(process.argv[2]==='--revoke'){
 await rename(ALICE_LIFECYCLE_GRANT,join(parent,'alice-client-lifecycle-revoked-'+randomUUID()+'.json'));
 console.log(JSON.stringify({state:'revoked',taskFile:ALICE_RESTART_TASK}));
}else{
 const policy=readRepositoryTaskGrants().projects['alice-ai'];
 if(policy?.agent!=='alice-ai'||policy.repository!=='hedydev/ioant-AI-Minecraft-Alice')throw Error('alice_repository_enrollment_required');
 const result=await executionCommand('/usr/bin/git',[...GIT_ARGS,'rev-parse','HEAD'],{cwd:policy.repo});
 if(!result.ok)throw Error('repository_head_unavailable');
 const plan=await loadRepositoryTask(policy,result.stdout.trim(),ALICE_RESTART_TASK);
 for(const step of plan.steps)await verifyTaskScript(policy,plan,step);
 const grant=validateAliceLifecycleGrant({schemaVersion:1,project:'alice-ai',agent:'alice-ai',repository:policy.repository,
  taskFile:ALICE_RESTART_TASK,taskSha256:plan.definitionSha256,scriptSha256:hash(await readFile(join(policy.repo,ALICE_RESTART_SCRIPT))),
  authorization:{approvedBy:'local_operator',scope:'alice_client_restart_only',reference:'user_request_20261103',priorDeniedOperation:PRIOR_DENIED_RESTART,platformReview:'required'}});
 verifyAliceLifecyclePlan(plan,grant);
 let prior=null;try{const old=await lstat(ALICE_LIFECYCLE_GRANT);if(!old.isFile()||old.isSymbolicLink()||old.uid!==process.getuid()||(old.mode&0o077)!==0)throw Error('unsafe_prior_grant');prior=await readFile(ALICE_LIFECYCLE_GRANT,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
 const text=JSON.stringify(grant,null,2)+'\n';
 if(prior!==text){
  if(prior!==null)await writeFile(join(parent,'alice-client-lifecycle-before-'+randomUUID()+'.json'),prior,{mode:0o600,flag:'wx'});
  const temp=join(parent,'.alice-client-lifecycle-'+randomUUID()+'.tmp');
  await writeFile(temp,text,{mode:0o600,flag:'wx'});
  await rename(temp,ALICE_LIFECYCLE_GRANT);
 }
 console.log(JSON.stringify({state:'approved',taskFile:ALICE_RESTART_TASK,approvalSha256:hash(JSON.stringify(grant)),platformReviewRequired:true}));
}
