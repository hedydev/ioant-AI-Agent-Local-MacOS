#!/usr/bin/env node
// Read-only prerequisites for the separately opted-in OpenClaw Dev creation.
import {resolve} from 'node:path';
import {probeOpenClaw} from './openclaw-config-preflight.mjs';
import {execNative} from './openclaw-ollama-provision.mjs';
import {compatibleDevRoster,inspectDevTarget,inspectDevBackupCache} from './openclaw-dev-create.mjs';
import {inspectBoundWorkspace} from './development-agent-route.mjs';

export async function preflightDev({preflight=probeOpenClaw,rpc=execNative,
 workspace=inspectDevTarget,aliceWorkspace=inspectBoundWorkspace,
 backupCache=inspectDevBackupCache}={}){
 const out={audit:'IOANT_OPENCLAW_DEV_PREFLIGHT',schemaVersion:1,readOnly:true,
  agent:'openclaw-dev',configWrite:false};
 try{
  if(process.env.OPENCLAW_CONFIG_PATH||process.env.OPENCLAW_STATE_DIR||process.env.OPENCLAW_PROFILE)
   return {...out,state:'blocked',reason:'custom_profile'};
  const p=await preflight();
  if(p?.config!=='regular_private'||p?.ollama!=='reachable'||
     p?.provider!=='target'||p?.agents!=='present'||
     !['gemma4:26b-a4b','gpt-oss:20b'].every(m=>p.installed?.includes(m)))
   return {...out,state:'blocked',reason:'preflight_changed'};
  const roster=compatibleDevRoster(await rpc('config.get',{}));
  if(!roster)return {...out,state:'blocked',reason:'roster_or_revision_changed'};
  if(await aliceWorkspace('alice-ai')!=='present_private')
   return {...out,state:'blocked',reason:'alice_workspace_unavailable'};
  if(await workspace()!=='missing_target_safe_parent')
   return {...out,state:'blocked',reason:'dev_workspace_not_empty'};
  const backupState=await backupCache();
  if(backupState!=='safe')
   return {...out,state:'blocked',reason:['volume_redirected','cache_redirected',
    'cache_not_plain_directory','cache_owner_mismatch','cache_other_write',
    'path_unavailable'].includes(backupState)?backupState:'backup_cache_not_safe'};
  return {...out,state:'ready',agent:'openclaw-dev',mainPreserved:true,alicePreserved:true,
   writeApproved:false};
 }catch{return {...out,state:'inconclusive',reason:'preflight_unavailable'};}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 preflightDev().then(x=>console.log(JSON.stringify(x))).catch(()=>
  console.log(JSON.stringify({audit:'IOANT_OPENCLAW_DEV_PREFLIGHT',schemaVersion:1,
   readOnly:true,agent:'openclaw-dev',configWrite:false,state:'inconclusive',reason:'unexpected_error'})));
}
