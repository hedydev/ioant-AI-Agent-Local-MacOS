// Local project registry. Fixed mode pins one key at startup; shared mode
// admits only locally enabled keys through project-router. Remote callers
// cannot supply arbitrary Agent IDs, paths or authenticated-project claims.
import {readRepositoryTaskGrants} from './repository-task-policy.mjs';
import {lstat,realpath} from 'node:fs/promises';
import {join,dirname} from 'node:path';
const BINDINGS=Object.freeze({
 'openclaw-workflow':Object.freeze({projectKey:'openclaw-workflow',agentId:'openclaw-dev',
  workspace:'/Volumes/LunaDrive/DeveloperCache/openclaw-agents/openclaw-dev'}),
 'alice-ai':Object.freeze({projectKey:'alice-ai',agentId:'alice-ai',
  workspace:'/Volumes/LunaDrive/DeveloperCache/openclaw-agents/alice-ai'})
});
export function registeredProjectBindings({load=readRepositoryTaskGrants}={}){
 const bindings={...BINDINGS};
 for(const [key,p] of Object.entries(load().projects)){
  if(Object.hasOwn(bindings,key)){
   if(bindings[key].agentId!==p.agent||bindings[key].workspace!==p.workspace)throw Error('registered_binding_conflict');
   continue;
  }
  if(Object.values(bindings).some(b=>b.agentId===p.agent||b.workspace===p.workspace))throw Error('independent_project_binding_required');
  bindings[key]=Object.freeze({projectKey:key,agentId:p.agent,workspace:p.workspace});
 }
 return bindings;
}
export function projectBinding(key='openclaw-workflow'){
 if(Object.hasOwn(BINDINGS,key))return BINDINGS[key];
 const all=registeredProjectBindings();
 if(!Object.hasOwn(all,key))throw Error('unregistered_project');
 return all[key];
}
export async function inspectProjectWorkspace(binding){
 try{
  for(const [p,directory] of [[dirname(binding.workspace),true],[binding.workspace,true],[join(binding.workspace,'AGENTS.md'),false]]){
   const st=await lstat(p);
   if((directory?!st.isDirectory():!st.isFile())||st.isSymbolicLink()||st.uid!==process.getuid()||
    (st.mode&0o077)!==0||await realpath(p)!==p||!directory&&st.size>524288)return 'unsafe_or_missing';
  }
  return 'present_private';
 }catch{return 'unavailable';}
}
export function projectWorkspacePolicy(config,binding){
 const entries=config?.agents?.entries;
 const current=entries?.[binding.agentId];
 if(current?.workspace!==binding.workspace)return false;
 return Object.entries(entries).filter(([id])=>id!==binding.agentId).every(([,a])=>{
  return !a||a.workspace!==current.workspace&&
   !(typeof current.agentDir==='string'&&current.agentDir===a.agentDir);
 });
}
