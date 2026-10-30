// Provision one independent Agent using the local operator-owned tool opt-in.
// MCP requests cannot select permissions/providers or edit existing Agents.
import {spawn} from 'node:child_process';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {lstat,readFile,mkdir,writeFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import {randomUUID} from 'node:crypto';
import {readPrivateJson} from '../../stage2/workflow-capabilities.mjs';
import {executionEnvironment} from './project-execution-command.mjs';
import {privateExecutionPath} from './project-execution-store.mjs';
import {projectFullAccessEnabled,FULL_PROJECT_TOOLS,projectRole,fullProjectToolPolicy} from './project-access-policy.mjs';
import {directAgentPolicy,localModelPolicy} from './agent.mjs';
export const AGENT_ROOT='/Volumes/LunaDrive/DeveloperCache/openclaw-agents';
const CONFIG=join(homedir(),'.openclaw/openclaw.json');
const CLI=join(homedir(),'.openclaw/bin/openclaw');
export function projectAgentDefinition(binding,{fullAccess=projectFullAccessEnabled()}={}){
 return {name:'Project '+binding.projectKey,workspace:binding.workspace,
  model:'ollama/gemma4:26b-a4b',modelPolicy:{allow:['ollama/gemma4:26b-a4b']},
  runtime:{type:'embedded'},thinkingDefault:'off',bootstrapMaxChars:2000,bootstrapTotalMaxChars:6000,
  tools:fullAccess?structuredClone(FULL_PROJECT_TOOLS):{profile:'minimal',deny:['*'],codeMode:false,exec:{mode:'deny'},fs:{workspaceOnly:true},
   elevated:{enabled:false},agentToAgent:{send:[]}},skills:[],subagents:{allowAgents:[]},
  heartbeat:{every:'0m'},memory:{search:{enabled:false}},params:{maxTokens:2048}};
}
export function nativeProjectPatch(config,binding,{agentRoot=AGENT_ROOT,fullAccess=projectFullAccessEnabled()}={}){
 if(typeof binding.agentId!=='string'||!/^repo-[a-z0-9-]{1,42}$/.test(binding.agentId)||
  binding.workspace!==join(agentRoot,binding.agentId)||config?.agents?.ownership!=='explicit'||
  config?.agents?.defaults?.systemAgent?.agentId!=='main'||!config?.agents?.entries?.main||
  config?.models?.providers?.ollama?.baseUrl!=='http://127.0.0.1:11435'||
  config.models.providers.ollama.api!=='ollama')throw Error('native_project_precondition_required');
 if(Object.hasOwn(config.agents.entries,binding.agentId)||
  Object.values(config.agents.entries).some(a=>a?.workspace===binding.workspace))throw Error('native_project_identity_in_use');
 const agent=projectAgentDefinition(binding,{fullAccess}),candidate=structuredClone(config);
 candidate.agents.entries[binding.agentId]=agent;
 if(!localModelPolicy(candidate,binding.agentId)||!directAgentPolicy(candidate,binding.agentId)&&!fullProjectToolPolicy(candidate.agents.entries[binding.agentId]))throw Error('native_local_model_policy_required');
 return {agents:{entries:{[binding.agentId]:agent}}};
}
export async function nativeConfigCommand(args,input){
 return new Promise((ok,bad)=>{
  let output='',oversized=false;
  const child=spawn(CLI,args,{env:executionEnvironment(),stdio:['pipe','pipe','pipe'],shell:false});
  const timer=setTimeout(()=>{child.kill('SIGTERM');bad(Error('native_config_outcome_unknown'));},20000);
  child.stdout.on('data',chunk=>{output+=chunk;if(Buffer.byteLength(output)>2097152){oversized=true;child.kill('SIGTERM');}});
  child.stderr.resume();
  child.once('error',()=>{clearTimeout(timer);bad(Error('native_config_unavailable'));});
  child.once('close',code=>{clearTimeout(timer);code===0&&!oversized?ok(output):bad(Error('native_config_write_or_read_failed'));});
  child.stdin.on('error',()=>{}); // The child error/exit is authoritative.
  child.stdin.end(input===undefined?'':JSON.stringify(input));
 });
}
export async function provisionProjectAgent(binding,{configPath=CONFIG,agentRoot=AGENT_ROOT,
 backups=join(homedir(),'.openclaw/backups'),fullAccess=projectFullAccessEnabled(),command=nativeConfigCommand,onMutation=async()=>{}}={}){
 if(['OPENCLAW_PROFILE','OPENCLAW_CONFIG_PATH','OPENCLAW_STATE_DIR'].some(k=>process.env[k]))throw Error('custom_profile_not_supported');
 const before=await readPrivateJson(configPath),patch=nativeProjectPatch(before,binding,{agentRoot,fullAccess});
 await privateExecutionPath(agentRoot,true);await privateExecutionPath(backups,true);
 try{await lstat(binding.workspace);throw Error('native_project_workspace_exists');}catch(e){if(e.code!=='ENOENT')throw e;}
 await command(['config','patch','--stdin','--dry-run','--json'],patch);
 if(!isDeepStrictEqual(await readPrivateJson(configPath),before))throw Error('native_project_prewrite_changed');
 const backup=join(backups,'repository-connect-'+randomUUID());await mkdir(backup,{mode:0o700});
 await writeFile(join(backup,'openclaw.json'),await readFile(configPath),{mode:0o600,flag:'wx'});
 await onMutation('workspace_creation');
 await mkdir(binding.workspace,{mode:0o700});await privateExecutionPath(binding.workspace,true);
 await writeFile(join(binding.workspace,'AGENTS.md'),projectRole(binding,{fullAccess:fullProjectToolPolicy(patch.agents.entries[binding.agentId])}),{mode:0o600,flag:'wx'});
 if(!isDeepStrictEqual(await readPrivateJson(configPath),before))throw Error('native_project_prewrite_changed');
 await onMutation('native_config_write');
 await command(['config','patch','--stdin'],patch);
 const expected=structuredClone(before);expected.agents.entries[binding.agentId]=patch.agents.entries[binding.agentId];
 if(!isDeepStrictEqual(await readPrivateJson(configPath),expected))throw Error('native_project_disk_readback_requires_review');
 const live=JSON.parse(await command(['gateway','call','config.get','--json']));
 const layers=['sourceConfig','config','parsed','resolved'].map(k=>live[k]).filter(Boolean);
 if(!layers.length||layers.some(c=>!(directAgentPolicy(c,binding.agentId)||fullProjectToolPolicy(c.agents.entries[binding.agentId]))||
  c.agents.entries[binding.agentId].workspace!==binding.workspace||
  !isDeepStrictEqual(c.agents.entries[binding.agentId].tools,expected.agents.entries[binding.agentId].tools)))
  throw Error('native_project_live_readback_pending');
 return {nativeAgentCreated:true,toolsEnabled:fullProjectToolPolicy(expected.agents.entries[binding.agentId]),computerControlEnabled:fullProjectToolPolicy(expected.agents.entries[binding.agentId]),modelInferenceInvoked:false};
}
