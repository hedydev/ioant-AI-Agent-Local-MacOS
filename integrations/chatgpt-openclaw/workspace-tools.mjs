import {loadWorkspaceAccess,workspaceCandidates,inspectWorkspaceRepository,resolveWorkspaceRepository} from './workspace-access.mjs';
import {connectWorkspaceProject,existingRepositoryBinding} from './workspace-connect.mjs';
export async function workspaceTool(name,input,{load=loadWorkspaceAccess,candidates=workspaceCandidates,
 inspect=inspectWorkspaceRepository,resolve=resolveWorkspaceRepository,lookup=existingRepositoryBinding,
 connect=connectWorkspaceProject}={}){
 try{
  if(name==='openclaw_project_connect')return await connect(input);
  if(name!=='openclaw_workspace_projects'||!input||typeof input!=='object'||Array.isArray(input)||
   Object.keys(input).some(k=>!['repository_id','offset'].includes(k))||
   input.offset!==undefined&&(!Number.isSafeInteger(input.offset)||input.offset<0||input.offset>512)||
   input.repository_id!==undefined&&input.offset!==undefined)throw Error('invalid_workspace_query');
  const access=await load();
  if(!access)return {state:'not_configured',reason:'workspace_access_not_configured',
   nextAction:'Local operator must approve workspace roots once; do not probe desktop or run terminal commands to bypass enrollment.'};
  const start=input.offset??0,all=input.repository_id!==undefined?
   [await resolve(access,input.repository_id)]:await candidates(access);
  const page=all.slice(start,start+20),projects=[];
  for(const candidate of page){
   try{
    const repo=input.repository_id!==undefined?candidate:await inspect(candidate),found=await lookup(repo.repo);
    projects.push({repository_id:repo.repository_id,workspace_key:repo.workspace_key,name:repo.name,
     repositoryPath:repo.repo,repository:repo.repository,branch:repo.branch,head:repo.head,worktreeClean:repo.worktreeClean,
     ...(found?{project_key:found.binding.projectKey,agent:found.binding.agentId}:{}),
     executionEnabled:found?.generic===true,nextTool:found?.generic?'openclaw_project_actions':'openclaw_project_connect'});
   }catch(e){projects.push({repository_id:candidate.repository_id,name:candidate.name,state:'unavailable',
    reason:/^[a-z_]+$/.test(e.message)?e.message:'workspace_metadata_requires_review'});}
  }
  return {state:'workspace_projects',readOnly:true,modelInferenceInvoked:false,computerOperationInvoked:false,
   projects,totalRepositories:all.length,nextOffset:start+page.length<all.length?start+page.length:null,
   scope:'Git metadata in approved workspace roots only; no file content or network fetch.',
   instructions:'Connect only the repository requested by the user, then use its returned project_key. Never use a different Agent or desktop terminal to bypass missing project enrollment.'};
 }catch(e){return {state:'blocked',reason:/^[a-z_]+$/.test(e.message)?e.message:'workspace_discovery_unavailable'};}
}
