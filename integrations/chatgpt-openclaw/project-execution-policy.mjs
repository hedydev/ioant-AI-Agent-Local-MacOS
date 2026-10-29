// Operator-enrolled fixed repository actions. No remote paths, commands or argv.
import {homedir} from 'node:os';
import {join} from 'node:path';
import {readPrivateJson} from '../../stage2/workflow-capabilities.mjs';
import {isDeepStrictEqual} from 'node:util';

export const EXECUTION_PARENT=join(homedir(),'Library/Application Support/ioant-openclaw-ops');
export const EXECUTION_GRANT=join(EXECUTION_PARENT,'direct-project-execution-grant.json');
export const SHA=/^[0-9a-f]{40}$/;
export const CONVERSATION=/^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;
export const ALICE_ACTION=Object.freeze({
 project:'alice-ai',agent:'alice-ai',action:'alice_mac_regression',branch:'main',
 repo:join(homedir(),'Documents/workspace/ioant-AI-Minecraft-Alice'),
 repository:'hedydev/ioant-AI-Minecraft-Alice',python:'/opt/homebrew/bin/python3',
 origins:['git@github.com:hedydev/ioant-AI-Minecraft-Alice.git',
  'https://github.com/hedydev/ioant-AI-Minecraft-Alice.git','https://github.com/hedydev/ioant-AI-Minecraft-Alice'],
 targetedTest:'test_alice_bds_lab_v2.py',testDirectory:'games/minecraft-ai/tests'
});
export const EXECUTION_ENROLLMENT=Object.freeze({schemaVersion:1,
 projects:{'alice-ai':{repository:ALICE_ACTION.repository,branch:'main',actions:['alice_mac_regression']}}});
export async function executionPolicy(binding,{load=()=>readPrivateJson(EXECUTION_GRANT)}={}){
 if(binding?.projectKey!==ALICE_ACTION.project||binding?.agentId!==ALICE_ACTION.agent)return null;
 try{
  const c=await load();
  if(!isDeepStrictEqual(c,EXECUTION_ENROLLMENT))return null;
  return ALICE_ACTION;
 }catch{return null;}
}
export function executionCatalog(binding,enabled){
 return {state:'registered_actions',project:binding.projectKey,agent:binding.agentId,
  executor:'mcp_fixed_project_runner',modelInferenceInvoked:false,workerRequired:false,
  actions:binding.projectKey==='alice-ai'?[{action:ALICE_ACTION.action,enabled,
   repository:ALICE_ACTION.repository,branch:ALICE_ACTION.branch,expectedCommitRequired:true,
   steps:['clean_main_and_origin','fetch_and_verify_exact_commit','fast_forward_only',
    'targeted_python_regression','full_mac_python_regression','verify_head_and_worktree'],
   scope:'Local Git checkout and repository Python tests as the current user; not an OS sandbox. No Mint/SSH/BDS deployment or game operation.'}]:[]};
}
