// Remove generated registration and Agent configuration; retain all user files and receipts.
import {join,dirname} from 'node:path';
import {homedir} from 'node:os';
import {mkdir,readFile,writeFile,rename,unlink,cp,lstat,realpath} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {registeredProjectBindings} from '../integrations/chatgpt-openclaw/project-binding.mjs';
import {REPOSITORY_TASK_GRANT,readRepositoryTaskGrants} from '../integrations/chatgpt-openclaw/repository-task-policy.mjs';
import {ComputerTaskStore,operationId} from '../integrations/chatgpt-openclaw/computer-task-store.mjs';
import {ProjectExecutionStore} from '../integrations/chatgpt-openclaw/project-execution-store.mjs';
import {EXECUTION_PARENT} from '../integrations/chatgpt-openclaw/project-execution-policy.mjs';
import {retirementPath} from '../integrations/chatgpt-openclaw/project-lifecycle.mjs';
import {nativeConfigCommand} from '../integrations/chatgpt-openclaw/native-project-agent.mjs';
import {readPrivateJson} from '../stage2/workflow-capabilities.mjs';
import {privateDirectory,privateRead,privateJsonFiles} from './private-files.mjs';
export async function removeProject(input,{parent=EXECUTION_PARENT,grantPath=REPOSITORY_TASK_GRANT,
 configPath=join(homedir(),'.openclaw/openclaw.json'),command=nativeConfigCommand,
 bindings=()=>registeredProjectBindings(),readGrants=readRepositoryTaskGrants}={}){
 if(!input||Object.keys(input).sort().join(',')!=='operation_id,project_key'||!operationId.test(input.operation_id??'')||!/^repo-[a-z0-9-]{1,42}$/.test(input.project_key??''))throw Error('generated_project_required');
 const store=new ComputerTaskStore(join(parent,'direct-project-removals'),parent),digest=createHash('sha256').update(input.project_key).digest('hex');
 const claim=await store.begin(input.operation_id,digest);
 if(!claim.created){if(claim.record.digest!==digest)throw Error('operation_id_conflict');return claim.record.state==='finished'?{...claim.record.result,cached:true}:{state:'inconclusive',reason:'removal_already_started_do_not_repeat'};}
 let grantLock,projectLock,marker,mutated=false,result;
 try{
  const b=bindings()[input.project_key];if(!b)throw Error('project_not_registered');
  const before=readGrants(grantPath),g=before.projects[b.projectKey];
  if(!g||g.agent!==b.agentId||g.workspace!==b.workspace)throw Error('generated_project_required');
  await privateDirectory(dirname(grantPath));
  grantLock=join(dirname(grantPath),'.repository-grants.lock');try{await writeFile(grantLock,JSON.stringify({operationId:input.operation_id}),{mode:0o600,flag:'wx'});}catch{grantLock=null;throw Error('project_registration_busy');}
  marker=retirementPath(b.projectKey,parent);try{await writeFile(marker,JSON.stringify({operationId:input.operation_id}),{mode:0o600,flag:'wx'});}catch{marker=null;throw Error('project_retirement_requires_review');}
  const execution=new ProjectExecutionStore(b,{parent});await execution.admit();projectLock=join(execution.dir,'active.lock');
  try{await writeFile(projectLock,JSON.stringify({operationId:input.operation_id,digest}),{mode:0o600,flag:'wx'});}catch{projectLock=null;throw Error('project_execution_busy');}
  for(const {path} of await privateJsonFiles(join(parent,'direct-computer-'+b.projectKey),500)){
   const r=JSON.parse(await privateRead(path));if(r.state==='started'||r.result?.state==='inconclusive')throw Error('project_computer_task_unsettled');
  }
  const config=await readPrivateJson(configPath),agent=config.agents?.entries?.[b.agentId];
  if(agent?.workspace!==b.workspace)throw Error('project_agent_identity_changed');
  const patch={agents:{entries:{[b.agentId]:null}}};await command(['config','patch','--stdin','--dry-run','--json'],patch);
  if(!isDeepStrictEqual(await readPrivateJson(configPath),config)||!isDeepStrictEqual(readGrants(grantPath),before))throw Error('project_config_changed');
  const backups=join(parent,'removed-projects');await privateDirectory(backups,{create:true});const backup=join(backups,randomUUID());await mkdir(backup,{mode:0o700});
  await writeFile(join(backup,'openclaw.json'),await readFile(configPath),{mode:0o600,flag:'wx'});await writeFile(join(backup,'grants.json'),await readFile(grantPath),{mode:0o600,flag:'wx'});
  // The native Gateway intentionally rejects roster deletion through config.patch.
  // Its supported lifecycle RPC performs deletion while deleteFiles:false retains paths.
  if(agent.agentDir)throw Error('custom_agent_directory_requires_review');
  const nativeDir=join(homedir(),'.openclaw/agents',b.agentId);
  try{const st=await lstat(nativeDir);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid()||await realpath(nativeDir)!==nativeDir)throw Error('native_agent_data_unverified');await cp(nativeDir,join(backup,'native-agent'),{recursive:true,dereference:false,errorOnExist:true,force:false});}catch(e){if(e.code!=='ENOENT')throw e;}
  mutated=true;await command(['gateway','call','agents.delete','--params',JSON.stringify({agentId:b.agentId,deleteFiles:false}),'--json']);
  const expected=structuredClone(config);delete expected.agents.entries[b.agentId];
  if(!isDeepStrictEqual(await readPrivateJson(configPath),expected))throw Error('removed_agent_readback_failed');
  const live=JSON.parse(await command(['gateway','call','config.get','--json'])),layers=['sourceConfig','config','resolved','parsed'].map(k=>live[k]).filter(Boolean);
  if(!layers.length||layers.some(c=>Object.hasOwn(c.agents?.entries??{},b.agentId)))throw Error('removed_agent_live_readback_pending');
  if(!isDeepStrictEqual(readGrants(grantPath),before))throw Error('project_grants_changed');
  const next=structuredClone(before);delete next.projects[b.projectKey];const tmp=grantPath+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(next)+'\n',{mode:0o600,flag:'wx'});await rename(tmp,grantPath);
  if(!isDeepStrictEqual(readGrants(grantPath),next))throw Error('removed_grant_readback_failed');
  result={state:'removed',operationId:input.operation_id,project_key:b.projectKey,agent:b.agentId,backup,filesDeleted:false,historyRetained:true,nativeDataBackedUp:true};
 }catch(e){result={state:mutated?'inconclusive':'blocked',project_key:input.project_key,operationId:input.operation_id,reason:/^[a-z_]+$/.test(e.message)?e.message:'project_removal_failed',doNotRepeat:true};}
 finally{
  await store.finish(input.operation_id,digest,result);
  // A partially applied mutation remains retired/locked for explicit recovery.
  if(!mutated||result?.state==='removed'){
   if(projectLock)await unlink(projectLock);
   if(grantLock)await unlink(grantLock);
   if(marker&&result?.state!=='removed')await unlink(marker);
  }
 }
 return result;
}
