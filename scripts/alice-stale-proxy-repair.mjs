#!/usr/bin/env node
// Strictly scoped repair for the stale GLOBAL managed-Chromium proxy flag.
// PLAN (default) is read-only. APPLY requires a fresh plan, a private
// rollback snapshot, conditional Gateway config set, and no other live
// managed browser profiles. Never weaken Browser SSRF or navigate a page.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {realpath,mkdir,lstat,writeFile} from 'node:fs/promises';
import {realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {connect} from 'node:net';
import {randomBytes} from 'node:crypto';
const exec=promisify(execFile);
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(homedir(),'Library','Application Support','ioant-openclaw-ops','runtime');
const CLI=join(homedir(),'.openclaw','bin','openclaw');
const AUDIT='IOANT_ALICE_STALE_PROXY_REPAIR';
const base=mode=>({audit:AUDIT,schemaVersion:1,mode,privateBrowserProfile:'alice-ai',
 proxyAddressEmitted:false,proxyPortEmitted:false,credentialsRead:false,
 rawConfigEmitted:false,rawProcessArgumentsEmitted:false,chatContentRead:false,
 browserNavigation:false,nativeComputerActInvoked:false,ssrfRelaxed:false,
 systemProxyChanged:false,tailscaleChanged:false,dailyChromeChanged:false,
 aliceCoordinatorChanged:false,chatMessageSent:false});
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const localPort=x=>{const n=Number(x);return /^\d{1,5}$/.test(String(x))&&
 Number.isSafeInteger(n)&&n>0&&n<65536?n:null};
export function parseLocalChromeProxy(flag){
 if(typeof flag!=='string')return null;
 const m=/^--proxy-server=(?:(http):\/\/)?(127\.0\.0\.1|localhost):([0-9]{1,5})$/.exec(flag);
 if(!m)return null;
 const port=localPort(m[3]);
 return port?{port,scheme:'http'}:null;
}
export function parseSystemHttpsProxy(text){
 if(typeof text!=='string')return null;
 const get=k=>new RegExp('(?:^|\\n)\\s*'+k+'\\s*:\\s*([^\\r\\n]+)').exec(text)?.[1]?.trim();
 const host=get('HTTPSProxy'),port=localPort(get('HTTPSPort'));
 return get('HTTPSEnable')==='1'&&['127.0.0.1','localhost'].includes(host)&&port?
  {port,host}:null;
}
export function candidateProxyPatch(args,sys){
 if(!Array.isArray(args)||args.length>64||args.some(x=>typeof x!=='string'||x.length>2048))
  return {state:'blocked',reason:'browser_extra_args_shape_unverified'};
 const idx=args.map((x,i)=>x.startsWith('--proxy-server=')?i:-1)
  .filter(i=>i>=0);
 const incompatible=args.some(x=>/^--proxy-(?:pac-url|auto-detect|bypass-list)(?:=|$)/.test(x)||
   x==='--no-proxy-server');
 if(idx.length!==1||incompatible)return {state:'blocked',
  reason:'proxy_flag_cardinality_or_conflict'};
 const old=parseLocalChromeProxy(args[idx[0]]);
 if(!old||!sys)return {state:'blocked',reason:'proxy_endpoints_not_simple_local_http'};
 if(old.port===sys.port)return {state:'no_change_needed',reason:'proxy_ports_already_match'};
 const next=[...args];
 next[idx[0]]='--proxy-server=http://127.0.0.1:'+sys.port;
 return {state:'candidate',reason:'one_local_proxy_flag_replacement',
  original:args,next,unchangedArgumentCount:args.length-1,
  targetPort:sys.port,stalePort:old.port};
}
function cmd(args,timeout=22000){
 return exec(CLI,args,{cwd:RUNTIME,timeout,maxBuffer:1048576,shell:false})
 .then(x=>x.stdout);
}
async function jsonCli(args){return JSON.parse(await cmd(args));}
async function listener(port){
 return new Promise(resolve=>{
  const s=connect({host:'127.0.0.1',port},()=>{s.destroy();resolve(true)});
  s.setTimeout(900,()=>{s.destroy();resolve(false)});
  s.on('error',()=>resolve(false));
 });
}
async function readSystem(){
 const {stdout}=await exec('/usr/sbin/scutil',['--proxy'],
  {timeout:7000,maxBuffer:65536,shell:false});
 return parseSystemHttpsProxy(stdout);
}
export function summarizeOtherProfiles(catalog,statusByName){
 const body=catalog?.result??catalog;
 const rows=Array.isArray(body)?body:Array.isArray(body?.profiles)?body.profiles:null;
 if(!rows||rows.length>64)return {state:'blocked',reason:'profile_catalog_unverified'};
 const names=new Set();let others=0,live=0;
 for(const p of rows){
  const name=p?.name,driver=p?.driver??p?.type;
  if(typeof name!=='string'||!name||names.has(name))
   return {state:'blocked',reason:'profile_identity_ambiguous'};
  names.add(name);
  if(name==='alice-ai')continue;
  if(['extension','existing-session'].includes(driver))continue;
  if(!['openclaw','managed','openclaw-managed'].includes(driver))
   return {state:'blocked',reason:'other_profile_driver_unknown'};
  others++;
  const s=statusByName?.[name];
  if(!plain(s)||s.profile!==name||typeof s.running!=='boolean')
   return {state:'blocked',reason:'other_managed_profile_status_unverified'};
  if(s.running)live++;
 }
 if(!names.has('alice-ai'))return {state:'blocked',reason:'alice_profile_not_registered'};
 return {state:live===0?'ready':'blocked',
  reason:live===0?'no_other_managed_browser_running':'other_managed_browser_running',
  otherManagedProfileCount:others,otherManagedProfilesRunning:live};
}
async function assess({
 call=jsonCli,run=cmd,system=readSystem,isListening=listener
}={}){
 const [status,config,profiles,sys]=await Promise.all([
  call(['browser','--browser-profile','alice-ai','--json','status']),
  call(['config','get','browser.extraArgs','--json']),
  call(['browser','--json','profiles']),system()
 ]);
 if(!plain(status)||status.profile!=='alice-ai'||status.driver!=='openclaw'||
  status.engine!=='chromium'||status.running!==true||status.headless!==false||
  status.cdpReady!==true||status.cdpPort!==18801||
  !Number.isSafeInteger(status.pid)||status.pid<=0)
  return {state:'blocked',reason:'owned_alice_browser_identity_not_verified'};
 if(!sys)return {state:'blocked',reason:'local_system_https_proxy_unverified'};
 const current=Array.isArray(config)?config:config?.result??config;
 const patch=candidateProxyPatch(current,sys);
 if(patch.state!=='candidate')return {state:patch.state,reason:patch.reason};
 const catalog=profiles?.result??profiles;
 const rows=Array.isArray(catalog)?catalog:catalog?.profiles;
 if(!Array.isArray(rows))return {state:'blocked',reason:'profile_catalog_unverified'};
 const byName={};
 for(const p of rows){
  if(p?.name==='alice-ai'||['extension','existing-session'].includes(p?.driver??p?.type))continue;
  if(!['openclaw','managed','openclaw-managed'].includes(p?.driver??p?.type))
   return {state:'blocked',reason:'other_profile_driver_unknown'};
  if(typeof p.name!=='string'||!p.name)return {state:'blocked',reason:'profile_identity_ambiguous'};
  try{byName[p.name]=await call(['browser','--browser-profile',p.name,'--json','status'])}
  catch{return {state:'blocked',reason:'other_managed_profile_status_unverified'};}
 }
 const others=summarizeOtherProfiles(profiles,byName);
 if(others.state!=='ready')return {state:'blocked',reason:others.reason,
  otherManagedProfileCount:others.otherManagedProfileCount??null,
  otherManagedProfilesRunning:others.otherManagedProfilesRunning??null};
 const [oldUp,newUp]=await Promise.all([
  isListening(patch.stalePort),isListening(patch.targetPort)]);
 if(oldUp||!newUp)return {state:'blocked',reason:'stale_or_current_proxy_listener_changed'};
 // Reject stale config when the running browser uses a different proxy
 // port than the one the conditional write intends to replace.
 let ps='';
 try{ps=(await exec('/bin/ps',['-p',String(status.pid),'-o','command='],
  {timeout:7000,maxBuffer:65536,shell:false})).stdout}
 catch{return {state:'blocked',reason:'alice_process_args_unavailable'};}
 if(!ps.includes('--remote-debugging-port=18801'))
  return {state:'blocked',reason:'managed_process_port_attestation_missing'};
 const values=ps.match(/--proxy-server=(?:(?:http):\/\/)?(?:127\.0\.0\.1|localhost):[0-9]{1,5}/g)??[];
 if(values.length!==1||parseLocalChromeProxy(values[0])?.port!==patch.stalePort)
  return {state:'blocked',reason:'running_proxy_and_config_mismatch'};
 // Validate the exact proposed authored path without applying it.
 try{await run(['config','set','browser.extraArgs',
  JSON.stringify(patch.next),'--strict-json','--dry-run'],45000)}
 catch{return {state:'blocked',reason:'config_patch_dry_run_rejected'};}
 return {state:'ready_for_scoped_apply',reason:'single_stale_proxy_flag_and_live_replacement',
  otherManagedProfileCount:others.otherManagedProfileCount,
  otherManagedProfilesRunning:0,currentProxyListening:true,staleProxyListening:false,
  originalFlagCount:patch.original.length,unchangedFlagCount:patch.unchangedArgumentCount,
  dryRunPassed:true,oldArgs:patch.original,newArgs:patch.next};
}
async function backupOriginal(original){
 const dir=join(homedir(),'Library','Application Support','ioant-openclaw-ops','private-recovery');
 await mkdir(dir,{recursive:true,mode:0o700});
 const st=await lstat(dir);
 if(!st.isDirectory()||st.isSymbolicLink()||await realpath(dir)!==dir)
  throw Error('recovery_location_not_private');
 const file=join(dir,'alice-browser-extraargs-'+Date.now()+'-'+
  randomBytes(5).toString('hex')+'.json');
 await writeFile(file,JSON.stringify({schemaVersion:1,configKey:'browser.extraArgs',
  original})+'\n',{mode:0o600,flag:'wx'});
 return file;
}
export async function runRepair({
 mode='plan',platform=process.platform,runtimeCheck=async()=>ROOT===RUNTIME&&
  await realpath(RUNTIME)===RUNTIME,
 assessFn=assess,doBackup=backupOriginal,run=cmd,read=jsonCli
}={}){
 const b=base(mode);
 if(!['plan','apply'].includes(mode))return {...b,state:'blocked',reason:'mode_unrecognized'};
 if(platform!=='darwin'||!await runtimeCheck().catch(()=>false))
  return {...b,state:'blocked',reason:'private_macos_runtime_required'};
 let x;
 try{x=await assessFn()}
 catch{return {...b,state:'inconclusive',reason:'proxy_assessment_unavailable'};}
 if(x.state!=='ready_for_scoped_apply')return {...b,state:x.state,
  reason:x.reason,otherManagedProfileCount:x.otherManagedProfileCount??null,
  otherManagedProfilesRunning:x.otherManagedProfilesRunning??null};
 const safe={otherManagedProfileCount:x.otherManagedProfileCount,
  otherManagedProfilesRunning:0,staleProxyListening:false,currentProxyListening:true,
  originalFlagCount:x.originalFlagCount,unchangedFlagCount:x.unchangedFlagCount,
  dryRunPassed:true,globalBrowserConfigImpact:true};
 if(mode==='plan')return {...b,...safe,state:'ready_for_scoped_apply',
  configChanged:false,backupSaved:false,ownedBrowserRestarted:false};
 let backup=false;
 try{await doBackup(x.oldArgs);backup=true;}
 catch{return {...b,...safe,state:'blocked',reason:'private_rollback_backup_failed',
  configChanged:false,backupSaved:false};}
 try{
  await run(['config','set','browser.extraArgs',JSON.stringify(x.newArgs),
   '--strict-json','--expect-current-json',JSON.stringify(x.oldArgs)],50000);
 }catch{return {...b,...safe,state:'inconclusive',
  reason:'conditional_config_write_failed_or_unverified',backupSaved:backup,
  configChanged:null,ownedBrowserRestarted:false};}
 try{
  const v=await read(['config','get','browser.extraArgs','--json']);
  const actual=Array.isArray(v)?v:v?.result??v;
  if(JSON.stringify(actual)!==JSON.stringify(x.newArgs))
   return {...b,...safe,state:'inconclusive',reason:'postwrite_config_mismatch',
    backupSaved:backup,configChanged:null,ownedBrowserRestarted:false};
 }catch{return {...b,...safe,state:'inconclusive',
  reason:'postwrite_config_read_unavailable',backupSaved:backup,
  configChanged:null,ownedBrowserRestarted:false};}
 return {...b,...safe,state:'scoped_config_updated',
  backupSaved:backup,configChanged:true,ownedBrowserRestarted:false,
  browserProcessRestartRequired:true,loginVerified:false,
  browserAutomaticNavigationAuthorized:false};
}
if(process.argv[1]&&realpathSync(process.argv[1])===
 realpathSync(fileURLToPath(import.meta.url))){
 const mode=process.argv.length===3?process.argv[2]:'';
 const result=await runRepair({mode});
 console.log(JSON.stringify(result));
 if(!['ready_for_scoped_apply','scoped_config_updated'].includes(result.state))
  process.exitCode=1;
}
