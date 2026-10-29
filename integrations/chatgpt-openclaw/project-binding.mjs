// Selected by the local launcher, never by a ChatGPT tool argument.
// Separate MCP plugin/tunnel profiles pin each ChatGPT Project to its Agent.
const BINDINGS=Object.freeze({
 'openclaw-workflow':Object.freeze({projectKey:'openclaw-workflow',agentId:'openclaw-dev',
  workspace:'/Volumes/LunaDrive/DeveloperCache/openclaw-agents/openclaw-dev'}),
 'alice-ai':Object.freeze({projectKey:'alice-ai',agentId:'alice-ai',
  workspace:'/Volumes/LunaDrive/DeveloperCache/openclaw-agents/alice-ai'})
});
export function projectBinding(key='openclaw-workflow'){
 if(!Object.hasOwn(BINDINGS,key))throw Error('unregistered_project');
 return BINDINGS[key];
}
export function projectWorkspacePolicy(config,binding){
 const entries=config?.agents?.entries;
 const current=entries?.[binding.agentId];
 if(current?.workspace!==binding.workspace)return false;
 return Object.values(BINDINGS).filter(x=>x.agentId!==binding.agentId).every(other=>{
  const a=entries?.[other.agentId];
  return !a||a.workspace!==current.workspace&&
   !(typeof current.agentDir==='string'&&current.agentDir===a.agentDir);
 });
}
