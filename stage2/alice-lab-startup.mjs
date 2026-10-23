// One-shot, explicitly opted-in 17880 ONLY startup probe. Never accept shell,
// paths, host, commands or actions supplied by the ChatGPT conversation.
import { lstat, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { validSshTarget, allowedAliceOrigin } from './alice-preflight.mjs';

const EXPECTED_REPORT=/^AliceAI-BDS-Lab-Startup-(check|probe)-\d{8}-\d{6}\.json$/;
const AUDIT='ALICE_BDS_LAB_STARTUP_PROBE';
const STATES=new Set(['blocked','ready_for_isolated_lab_probe','lab_shutdown_unverified',
 'lab_exited_with_error','lab_ready_not_observed','lab_script_load_error_observed',
 'lab_server_ready_module_unverified','lab_module_imports_observed']);
const REASONS=new Set(['none','missing_lab_beta_tool','lab_beta_not_enabled',
 'lab_process_guard_unavailable','lab_bds_binary_not_executable','refuse_root_python',
 'unsafe_lab_properties','duplicate_lab_property','lab_port_world_or_auth_changed',
 'unsafe_lab_allowlist','lab_probe_already_prepared','lab_probe_already_running',
 'unsafe_lab_config','lab_udp_ports_busy','invalid_action','lab_pack_not_staged',
 'unsafe_lab_instrumentation','lab_script_drift','lab_script_unexpected_imports',
 'lab_bds_is_running','bds_cwd_requires_privileged_read','bds_cwd_unverified',
 'proc_unavailable','unverified_guard','io_or_process_error']);
const BOOLS=['isolationConfigReady','serverReadyObserved','scriptModuleMessagesObserved',
 'scriptLoadErrorObserved','verifiedScriptModuleLoaded','isolatedBdsExited',
 'productionWorldModified','productionBdsRestarted','productionWitnessUsed'];

export function sanitizeLabStartup(raw,mode,now=Date.now()) {
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.audit!==AUDIT||
    raw.schemaVersion!==1||raw.mode!==mode||!STATES.has(raw.state)||
    !REASONS.has(raw.reason)||!Number.isSafeInteger(raw.observedAtUnix)||
    Math.abs(raw.observedAtUnix*1000-now)>900000 ||
    BOOLS.some(k=>typeof raw[k]!=='boolean') ||
    raw.productionWorldModified||raw.productionBdsRestarted||raw.productionWitnessUsed)
   throw Error('Unsafe, stale, or incompatible 17880 startup probe evidence');
 // Explicit allowlist: no secrets, source paths, environment or console logs.
 return Object.fromEntries([['audit',AUDIT],['schemaVersion',1],
  ['observedAtUnix',raw.observedAtUnix],['mode',mode],
  ['state',raw.state],['reason',raw.reason],
  ...BOOLS.map(k=>[k,raw[k]])]);
}
export async function readLabStartupReport(output,{home=homedir(),mode,after=0,now=Date.now()}={}) {
 const matches=[...String(output).matchAll(/^Saved sanitized 17880 startup result: (.+\.json)\s*$/gm)];
 if(matches.length!==1)throw Error('No unique sanitized 17880 startup report path in command output');
 const desktop=resolve(home,'Desktop');
 const filename=resolve(matches[0][1].trim());
 const leaf=filename.slice(desktop.length+1);
 if(!filename.startsWith(desktop+sep)||!EXPECTED_REPORT.test(leaf)||!leaf.startsWith('AliceAI-BDS-Lab-Startup-'+mode+'-'))
   throw Error('Unexpected 17880 startup report path');
 const file=await lstat(filename);
 if(!file.isFile()||file.isSymbolicLink()||file.size<100||file.size>8192||
    file.mtimeMs<after-2000||
    (typeof process.getuid==='function'&&file.uid!==process.getuid())||
    (file.mode&0o077)!==0)
   throw Error('Lab startup report is not fresh/private/regular');
 const parsed=JSON.parse(await readFile(filename,'utf8'));
 return {reportFilename:leaf,reportJson:JSON.stringify(sanitizeLabStartup(parsed,mode,now))};
}

export async function aliceLabStartupProbe({execute,home=homedir(),sshTarget,now=()=>Date.now()}){
 if(!validSshTarget(sshTarget))return {status:'approval_required',reason:'A valid local ALICE_SSH_TARGET is required for the separate 17880 lab probe.'};
 const repo=resolve(home,'Documents/workspace/ioant-AI-Minecraft-Alice');
 const script='games/minecraft-ai/scripts/alice-mac.sh';
 const env={ALICE_SSH_TARGET:sshTarget};
 let output='',labAttempted=false;
 const step=async(label,bin,args,timeout)=>{
   const result=await execute({bin,args,cwd:repo,env,timeout});
   // Do not forward raw SSH/sudo output, command transcripts or Mint paths
   // into ChatGPT. Fixed labels + status are sufficient; the validated JSON
   // carries the real, bounded lab evidence.
   output=(output+'\n'+label+': '+(result.status??'unknown')+
     ' (exit '+(result.exitCode??'unknown')+')').slice(-3500);
   if(result.status!=='passed')throw Object.assign(new Error(label+' '+result.status+
    ' (exit '+(result.exitCode??'unknown')+'); if probe was attempted, inspect 17880 BDS process before any new run'),{exitCode:result.exitCode??1});
   return result;
 };
 try{
  const origin=await step('verify-origin','git',['remote','get-url','origin'],12000);
  if(!allowedAliceOrigin(origin.output))throw Error('Alice origin is not the exact approved repository');
  const branch=await step('verify-main','git',['branch','--show-current'],12000);
  if(branch.output.trim()!=='main')throw Error('Alice checkout is not on main');
  const clean=await step('verify-clean','git',['status','--porcelain','--untracked-files=no'],12000);
  if(clean.output.trim())throw Error('Alice tracked worktree is not clean; no sync');
  await step('git-fetch','git',['fetch','origin','main'],90000);
  await step('git-pull-ff-only','git',['pull','--ff-only','origin','main'],90000);
  const updated=await step('verify-post-pull-clean','git',['status','--porcelain','--untracked-files=no'],12000);
  if(updated.output.trim())throw Error('Alice checkout became dirty; no sync');
  await step('alice-sync','bash',[script,'sync'],300000);
  // The existing Alice Mint guard is responsible for verifying isolated 17880
  // process identity and clone state. This is read-only and NEVER a substitute
  // for the second guard in the actual probe.
  const checkStart=now();
  const check=await step('17880-startup-check','bash',[script,'witness-lab-startup-check'],120000);
  const checked=await readLabStartupReport(check.output,{home,mode:'check',after:checkStart,now:now()});
  const checkData=JSON.parse(checked.reportJson);
  if(checkData.state!=='ready_for_isolated_lab_probe'||checkData.reason!=='none')
    return {status:'failed',reason:'17880 startup readiness guard refused the probe; no BDS launched',exitCode:1,
      ...checked,output:output.slice(-4500)};
  // A successful check may report isolationConfigReady=false: probe itself
  // one-time hardens a previously unprepared disposable clone, with backups.
  // Do not treat this check flag as permission to change production.
  labAttempted=true;
  const probeStart=now();
  const launched=await step('17880-startup-probe','bash',[script,'witness-lab-startup-probe'],120000);
  const observed=await readLabStartupReport(launched.output,{home,mode:'probe',after:probeStart,now:now()});
  const data=JSON.parse(observed.reportJson);
  const safeExit=data.isolatedBdsExited===true && data.state!=='lab_shutdown_unverified';
  const confirmed=data.state==='lab_module_imports_observed'&&
    data.serverReadyObserved&&data.verifiedScriptModuleLoaded&&!data.scriptLoadErrorObserved&&safeExit;
  return {
    status:confirmed?'passed':'failed',exitCode:confirmed?0:1,
    reason:confirmed?'17880 lab script imports verified and test BDS exited. No gameplay evidence.':
     '17880 lab startup did not meet readiness/import/shutdown proof. Do not repeat automatically; review report and lab process.',
    ...observed,output:output.slice(-4500)
  };
 }catch(error){
  return {status:'failed',exitCode:error.exitCode??1,
   reason:(labAttempted?'17880 probe attempt needs operator verification; no automatic retry. ':'')+error.message,
   output:output.slice(-4500)};
 }
}
