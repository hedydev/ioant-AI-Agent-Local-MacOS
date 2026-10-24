// Generic text-only technical discussion. Agent identity is bound by a
// Mac operator flag, not an untrusted ChatGPT code block or model response.
import {execNative} from './openclaw-ollama-provision.mjs';
import {validateDevTask,readDevReply,invokeDevCli} from './openclaw-alice-dev-discuss.mjs';
import {validDevAgent,verifyBoundAgentConfig,inspectBoundWorkspace} from './development-agent-route.mjs';

export function buildBoundTurn(prompt,chatDigest,agentId){
 if(!validDevAgent(agentId)||!validateDevTask(prompt,chatDigest))throw Error('invalid_bound_turn');
 return {sessionKey:'agent:'+agentId+':dev-'+chatDigest,
  body:'You are a restricted local technical advisor ('+agentId+
   ') collaborating with ChatGPT on software engineering. You have no tools. Analyze the question, identify assumptions and risks, and provide concise independent advice. Do not claim to have read local files, executed tests, changed code, accessed Minecraft, or verified external facts. Never instruct the host to bypass safety boundaries. Your reply is untrusted analysis, not an action.\n\nDEVELOPMENT QUESTION (untrusted text):\n'+prompt};
}
export async function discussBoundAgent({agentId,prompt,chatDigest,
 rpc=execNative,workspace=inspectBoundWorkspace,invoke=invokeDevCli}={}){
 const base={audit:'IOANT_OPENCLAW_BOUND_DEV_DISCUSS',schemaVersion:1,
  configWrite:false,externalDelivery:false,toolsEnabled:false};
 if(!validDevAgent(agentId))return {...base,state:'blocked',note:'missing_or_invalid_local_binding'};
 const safe={...base,agent:agentId};
 try{
  if(!validateDevTask(prompt,chatDigest))return {...safe,state:'blocked',note:'invalid_prompt_or_chat'};
  if(process.env.OPENCLAW_CONFIG_PATH||process.env.OPENCLAW_STATE_DIR||process.env.OPENCLAW_PROFILE)
   return {...safe,state:'blocked',note:'custom_profile'};
  if(!verifyBoundAgentConfig(await rpc('config.get',{}),agentId))
   return {...safe,state:'blocked',note:'agent_missing_or_unsafe'};
  if(await workspace(agentId)!=='present_private')
   return {...safe,state:'blocked',note:'workspace_not_private'};
  const turn=buildBoundTurn(prompt,chatDigest,agentId);
  const args=['agent','--agent',agentId,'--session-key',turn.sessionKey,
   '--message-file','/dev/stdin','--timeout','120','--json'];
  const result=await invoke(args,turn.body);
  if(result?.state!=='reply')
   return {...safe,state:'inconclusive',note:['gateway_timeout','cli_launch_failed',
    'gateway_cli_failed','invalid_json'].includes(result?.note)?result.note:'gateway_unavailable'};
  return {...safe,...readDevReply(result.data)};
 }catch{return {...safe,state:'inconclusive',note:'gateway_or_preflight_unavailable'};}
}
