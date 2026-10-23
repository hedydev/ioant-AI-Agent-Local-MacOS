// Fixed, operator-opted-in AliceAI workflow. ChatGPT supplies ONLY the action ID;
// it never supplies paths, arguments, SSH hosts, Git remotes, or shell fragments.
import { lstat, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const EXPECTED='hedydev/ioant-AI-Minecraft-Alice';
const FILENAME=/^AliceAI-BDS-Witness-Preflight-\d{8}-\d{6}\.json$/;
const AUDIT='ALICE_BDS_SILENT_WITNESS_READ_ONLY';
const BETA=new Set(['enabled_in_level_dat','disabled_in_level_dat','not_declared_in_level_dat','unverified']);
const SAFE_FIELDS=new Set([
  'audit','schemaVersion','observedAtUnix','readOnly','safeToApplyWorldChanges',
  'bdsRootMatchesExpected','propertiesMatchProduction17879BedrockLevel','targetWorldStructurallyPresent',
  'targetWorldPackListState','alreadyAttached','packSourceAndRestrictedHttpPolicyValid',
  'modulePermissionsAlreadyPresent','targetPackDirectoryExists','receiverPrivateConfigExists',
  'receiverPrivateTokenExists','receiverLoopbackPortConfigured','betaApisExperiment',
  'betaModulesLoaded','verifiedOfflineWorldBackup','processes'
]);

export function validSshTarget(target){
  return typeof target==='string' && /^[a-zA-Z_][a-zA-Z0-9_.-]{0,63}@[a-zA-Z0-9][a-zA-Z0-9.:-]{0,128}$/.test(target);
}
export function allowedAliceOrigin(input){
  return ['https://github.com/'+EXPECTED+'.git','https://github.com/'+EXPECTED,
    'git@github.com:'+EXPECTED+'.git','git@github.com:'+EXPECTED].includes(String(input).trim());
}

export function sanitizePreflight(raw, now=Date.now()){
  if (!raw || typeof raw!=='object' || Array.isArray(raw) ||
    raw.audit!==AUDIT || raw.schemaVersion!==2 || raw.readOnly!==true ||
    raw.safeToApplyWorldChanges!==false || !Number.isInteger(raw.observedAtUnix) ||
    Math.abs(raw.observedAtUnix*1000-now)>900000 || !BETA.has(raw.betaApisExperiment)){
    throw Error('Preflight JSON was not a fresh schemaVersion 2 read-only witness report');
  }
  const clean={};
  for(const [k,value] of Object.entries(raw)){
    if(!SAFE_FIELDS.has(k)) continue;
    if(k==='processes'){
      if(value && typeof value==='object' &&
        ['unknown','found_running','not_found_not_offline_proof'].includes(value.state) &&
        (value.count===null || Number.isInteger(value.count) && value.count>=0 && value.count<=10000)) {
        clean.processes={state:value.state,count:value.count};
      }
    } else if(value===null || typeof value==='boolean' || typeof value==='number' && Number.isFinite(value) ||
              typeof value==='string' && /^[a-z0-9_]{1,90}$/i.test(value)) clean[k]=value;
  }
  return clean;
}

// execute is the fixed-argv spawn runner; injectable only in isolated tests.
export async function aliceWitnessPreflight({execute,home=homedir(),sshTarget,now=()=>Date.now()}){
  if(!validSshTarget(sshTarget))return {status:'approval_required',reason:'Set a valid ALICE_SSH_TARGET locally before enabling Alice preflight.'};
  const repo=resolve(home,'Documents/workspace/ioant-AI-Minecraft-Alice');
  const desktop=resolve(home,'Desktop');
  const script='games/minecraft-ai/scripts/alice-mac.sh';
  const env={ALICE_SSH_TARGET:sshTarget};
  let output='';
  const step=async(label,bin,args,timeout,vars={})=>{
    const result=await execute({bin,args,cwd:repo,timeout,env:{...env,...vars}});
    output=(output+'\n=== '+label+' ===\n'+(result.output??'')).slice(-9000);
    if(result.status!=='passed')throw Object.assign(new Error(label+' failed ('+result.status+', exit '+(result.exitCode??'unknown')+')'),{exitCode:result.exitCode??1});
    return result;
  };
  try{
    // Verify this is EXACTLY the expected checked-out project and branch, not any arbitrary cwd.
    const origin=await step('verify-origin','git',['remote','get-url','origin'],12000);
    if(!allowedAliceOrigin(origin.output))throw Error('Alice repo origin is not the expected hedydev project');
    const branch=await step('verify-main','git',['branch','--show-current'],12000);
    if(branch.output.trim()!=='main')throw Error('Alice checkout is not on main; refusing to switch branches');
    const dirty=await step('verify-clean','git',['status','--porcelain','--untracked-files=no'],12000);
    if(dirty.output.trim())throw Error('Alice checkout has tracked local changes; refusing to pull or sync');
    await step('git-fetch','git',['fetch','origin','main'],90000);
    await step('git-pull-ff-only','git',['pull','--ff-only','origin','main'],90000);
    // Recheck after update, before invoking the repo's vetted sync entrypoint.
    const clean=await step('verify-post-pull-clean','git',['status','--porcelain','--untracked-files=no'],12000);
    if(clean.output.trim())throw Error('Alice checkout became dirty after pull; refusing sync');
    await step('alice-sync','bash',[script,'sync'],300000);
    const start=now();
    const witness=await step('witness-preflight','bash',[script,'witness-preflight'],90000);
    const match=witness.output.match(/^Saved to Mac Desktop: (.+\.json)\s*$/m);
    if(!match)throw Error('No exact new witness-preflight report path in CLI output');
    const file=resolve(match[1].trim());
    if(!file.startsWith(desktop+sep)||!FILENAME.test(file.slice(desktop.length+1)))
      throw Error('Unexpected witness-preflight report destination or duplicate filename');
    const info=await lstat(file);
    if(!info.isFile()||info.isSymbolicLink()||info.size>16384||info.size<50||info.mtimeMs<start-2000)
      throw Error('Preflight report is not a new, regular, bounded file');
    const parsed=sanitizePreflight(JSON.parse(await readFile(file,'utf8')),now());
    return {status:'passed',exitCode:0,output:output.slice(-5000),reportFilename:file.slice(desktop.length+1),reportJson:JSON.stringify(parsed),reportPath:file};
  }catch(error){
    return {status:'failed',exitCode:error.exitCode??1,reason:error.message,output:output.slice(-6000)};
  }
}
