// One durable connection claim, one independent identity, additive local grants.
import {writeFile,readFile,rename,unlink} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {ComputerTaskStore,operationId} from './computer-task-store.mjs';
import {EXECUTION_PARENT,executionPolicy} from './project-execution-policy.mjs';
import {REPOSITORY_TASK_GRANT,readRepositoryTaskGrants,validateRepositoryTaskGrants} from './repository-task-policy.mjs';
import {registeredProjectBindings} from './project-binding.mjs';
import {inspectDirectAgent} from './agent.mjs';
import {AGENT_ROOT,provisionProjectAgent} from './native-project-agent.mjs';
import {loadWorkspaceAccess,resolveWorkspaceRepository,REPOSITORY_ID} from './workspace-access.mjs';
import {privateExecutionPath} from './project-execution-store.mjs';

export async function existingRepositoryBinding(repo,{bindings=registeredProjectBindings(),policy=executionPolicy}={}){
 for(const binding of Object.values(bindings)){
  const generic=await policy(binding,{action:'repository_task'});
  if(generic?.repo===repo)return {binding,generic:true};
  const legacy=await policy(binding);
  if(legacy?.repo===repo)return {binding,generic:false};
 }
 return null;
}
export function generatedProjectBinding(repo,{agentRoot=AGENT_ROOT}={}){
 const slug=repo.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,25)||'project';
 const key='repo-'+slug+'-'+repo.repository_id.slice(0,10);
 return {projectKey:key,agentId:key,workspace:join(agentRoot,key)};
}
const valid=input=>input&&typeof input==='object'&&!Array.isArray(input)&&
 Object.keys(input).sort().join(',')==='operation_id,repository_id'&&typeof input.operation_id==='string'&&
 operationId.test(input.operation_id)&&typeof input.repository_id==='string'&&REPOSITORY_ID.test(input.repository_id);
export async function connectWorkspaceProject(input,{
 store=new ComputerTaskStore(join(EXECUTION_PARENT,'direct-workspace-connect')),
 accessLoad=loadWorkspaceAccess,resolve=resolveWorkspaceRepository,lookup=existingRepositoryBinding,
 grantPath=REPOSITORY_TASK_GRANT,readGrants=readRepositoryTaskGrants,
 inspect=inspectDirectAgent,provision=provisionProjectAgent,agentRoot=AGENT_ROOT
}={}){
 if(!valid(input))return {state:'blocked',reason:'invalid_project_connect_input'};
 const digest=createHash('sha256').update(JSON.stringify(['workspace_connect',input.repository_id])).digest('hex');
 let claim,lock,mutated=false,result;
 const outcome=(state,extra={})=>({state,operationId:input.operation_id,doNotRepeat:true,
  modelInferenceInvoked:false,computerOperationInvoked:false,...extra});
 try{
  claim=await store.begin(input.operation_id,digest);
  if(!claim.created){
   if(claim.record.digest!==digest)return outcome('blocked',{reason:'operation_id_conflict'});
   return claim.record.state==='finished'?{...claim.record.result,cached:true}:
    outcome('inconclusive',{reason:'connection_already_started_query_same_id',cached:true});
  }
  const access=await accessLoad();if(!access)throw Error('workspace_access_not_configured');
  const repo=await resolve(access,input.repository_id);
  await privateExecutionPath(dirname(grantPath),true);
  lock=join(dirname(grantPath),'.repository-grants.lock');
  try{await writeFile(lock,JSON.stringify({operationId:input.operation_id}),{mode:0o600,flag:'wx'});}
  catch{lock=null;throw Error('workspace_connection_busy');}
  const before=readGrants(grantPath),found=await lookup(repo.repo);
  const binding=found?.binding??generatedProjectBinding(repo,{agentRoot});
  const policy={agent:binding.agentId,workspace:binding.workspace,repo:repo.repo,repository:repo.repository,
   branch:repo.branch,origins:[repo.origin],scriptRoots:access.scriptRoots,runtimes:access.runtimes};
  if(before.projects[binding.projectKey]){
   if(before.projects[binding.projectKey].repo!==repo.repo)throw Error('project_repository_conflict');
   if(!found?.generic)throw Error('existing_project_grant_requires_review');
   result=outcome('connected',{project_key:binding.projectKey,agent:binding.agentId,
    repository:repo.repository,branch:before.projects[binding.projectKey].branch,alreadyConnected:true,
    nativeAgentCreated:false,pluginRefreshRequired:false,tunnelRestartRequired:false});
  }else{
   const next=structuredClone(before);next.projects[binding.projectKey]=policy;
   validateRepositoryTaskGrants(next);registeredProjectBindings({load:()=>next});
   let nativeAgentCreated=false;
   if(found){
    if((await inspect({binding})).state!=='ready')throw Error('existing_project_agent_not_ready');
   }else{
    if(!access.provisionAgents)throw Error('native_project_provisioning_not_enabled');
    await provision(binding,{onMutation:async()=>{mutated=true;}});nativeAgentCreated=true;
   }
   if(!isDeepStrictEqual(readGrants(grantPath),before))throw Error('project_grants_changed_before_publish');
   const temp=join(dirname(grantPath),'.workspace-connect-'+randomUUID()+'.tmp');
   await writeFile(temp,JSON.stringify(next)+'\n',{mode:0o600,flag:'wx'});
   if(Object.keys(before.projects).length){
    await writeFile(join(dirname(grantPath),'.grant-before-connect-'+randomUUID()+'.json'),
     await readFile(grantPath),{mode:0o600,flag:'wx'});
   }
   mutated=true;await rename(temp,grantPath);
   if(!isDeepStrictEqual(readGrants(grantPath),next))throw Error('project_grants_readback_requires_review');
   result=outcome('connected',{project_key:binding.projectKey,agent:binding.agentId,
    repository:repo.repository,branch:repo.branch,alreadyConnected:false,nativeAgentCreated,
    pluginRefreshRequired:false,tunnelRestartRequired:false,
    executionScope:'Pinned tracked scripts inside the approved workspace; current user permissions, not an OS sandbox.'});
  }
 }catch(e){
  result=outcome(mutated?'inconclusive':'blocked',{
   reason:/^[a-z_]+$/.test(e.message)?e.message:'workspace_connection_requires_review',
   ...(mutated?{configurationMayHaveChanged:true}:{} )});
 }finally{
  if(claim?.created&&result){
   try{await store.finish(input.operation_id,digest,result);}
   catch{result=outcome('inconclusive',{reason:'connection_receipt_unavailable_query_same_id'});mutated=true;}
  }
  // A partial configuration must be reviewed before any further provisioning.
  if(lock&&(!mutated||result?.state==='connected'))await unlink(lock).catch(()=>{});
 }
 return result;
}
