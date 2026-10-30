#!/usr/bin/env node
// Local operator migration, deliberately not an MCP permission-escalation tool.
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';
import {readPrivateJson} from '../stage2/workflow-capabilities.mjs';
import {registeredProjectBindings,inspectProjectWorkspace,projectWorkspacePolicy} from '../integrations/chatgpt-openclaw/project-binding.mjs';
import {localModelPolicy} from '../integrations/chatgpt-openclaw/agent.mjs';
import {nativeConfigCommand} from '../integrations/chatgpt-openclaw/native-project-agent.mjs';
import {PROJECT_ACCESS_FILE,FULL_PROJECT_TOOLS,projectRole,fullProjectToolPolicy} from '../integrations/chatgpt-openclaw/project-access-policy.mjs';
import {privateExecutionPath} from '../integrations/chatgpt-openclaw/project-execution-store.mjs';
export async function configureProjectAgentAccess(mode,{bindings=registeredProjectBindings(),
 configPath=join(homedir(),'.openclaw/openclaw.json'),accessPath=PROJECT_ACCESS_FILE,
 backups=join(homedir(),'.openclaw/backups'),command=nativeConfigCommand,workspace=inspectProjectWorkspace}={}){
 if(!['--dry-run','--apply'].includes(mode))throw Error('explicit_mode_required');
 const before=await readPrivateJson(configPath),entries={},roles=[];
 for(const b of Object.values(bindings)){
  if(!localModelPolicy(before,b.agentId)||!projectWorkspacePolicy(before,b)||await workspace(b)!=='present_private')throw Error('registered_project_precondition_required');
  entries[b.agentId]={tools:structuredClone(FULL_PROJECT_TOOLS)};
  roles.push({binding:b,path:join(b.workspace,'AGENTS.md'),before:await readFile(join(b.workspace,'AGENTS.md'),'utf8')});
 }
 const patch={agents:{entries}};await command(['config','patch','--stdin','--dry-run','--json'],patch);
 if(!isDeepStrictEqual(before,await readPrivateJson(configPath)))throw Error('config_changed_before_apply');
 const result={state:'validated',projects:Object.keys(bindings),toolAccess:'full',modelInferenceInvoked:false};
 if(mode==='--dry-run')return result;
 await privateExecutionPath(backups,true);const backup=join(backups,'project-agent-access-'+randomUUID());await mkdir(backup,{mode:0o700});
 await writeFile(join(backup,'openclaw.json'),await readFile(configPath),{mode:0o600,flag:'wx'});
 for(const role of roles){
  if(await readFile(role.path,'utf8')!==role.before)throw Error('project_role_changed_before_apply');
  await writeFile(join(backup,role.binding.agentId+'.md'),role.before,{mode:0o600,flag:'wx'});
 }
 try{await writeFile(join(backup,'project-agent-access.json'),await readFile(accessPath),{mode:0o600,flag:'wx'});}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!isDeepStrictEqual(before,await readPrivateJson(configPath)))throw Error('config_changed_before_apply');
 await command(['config','patch','--stdin'],patch);
 const after=await readPrivateJson(configPath),expected=structuredClone(before);
 for(const [id,value] of Object.entries(entries))expected.agents.entries[id].tools=value.tools;
 if(!isDeepStrictEqual(after,expected))throw Error('project_access_disk_readback_failed');
 const live=JSON.parse(await command(['gateway','call','config.get','--json']));
 const layers=['sourceConfig','config','parsed','resolved'].map(k=>live[k]).filter(Boolean);
 if(!layers.length||layers.some(c=>Object.values(bindings).some(b=>!fullProjectToolPolicy(c.agents?.entries?.[b.agentId]))))throw Error('project_access_live_readback_pending');
 for(const role of roles){const temp=role.path+'.'+randomUUID()+'.tmp';await writeFile(temp,projectRole(role.binding,{fullAccess:true}),{mode:0o600,flag:'wx'});await rename(temp,role.path);}
 await privateExecutionPath(resolve(accessPath,'..'),true);
 const tmp=accessPath+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify({schemaVersion:1,projectAgentAccess:'full'})+'\n',{mode:0o600,flag:'wx'});await rename(tmp,accessPath);
 return {...result,state:'applied',backup,defaultsForNewProjects:'full',unregisteredAgentsChanged:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await configureProjectAgentAccess(process.argv[2])));}catch(e){console.error(JSON.stringify({state:'blocked',reason:/^[a-z_]+$/.test(e.message)?e.message:'project_access_update_failed'}));process.exitCode=1;}
}
