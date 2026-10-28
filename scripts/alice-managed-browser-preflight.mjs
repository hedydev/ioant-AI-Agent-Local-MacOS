#!/usr/bin/env node
// Read-only inspection of a dedicated OpenClaw-managed Alice browser profile.
// Never starts a browser, imports credentials, reads tabs, changes config,
// opens a URL, or uses native CUA. CLI profiles are not CUA authorization.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {realpath,realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile);
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(homedir(),'Library','Application Support','ioant-openclaw-ops','runtime');
const CLI=join(homedir(),'.openclaw','bin','openclaw');
const NAME='alice-ai';
const AUDIT='IOANT_ALICE_MANAGED_BROWSER_PREFLIGHT';
const base=()=>({audit:AUDIT,schemaVersion:1,mode:'inspect_only',
 profileName:NAME,readOnly:true,profileCreated:false,browserStarted:false,
 browserWindowOpened:false,loginAttempted:false,credentialsCopied:false,
 importedCookies:false,chromeProfileModified:false,configChanged:false,
 defaultProfileChanged:false,browserTabsRead:false,browserPageRead:false,
 chatMessageSent:false,nativeComputerActInvoked:false,
 nativeCUAAuthorizationVerified:false,aliceCoordinatorChanged:false});
const record=x=>x&&typeof x==='object'&&!Array.isArray(x);
export function summarizeProfileCatalog(raw){
 const body=raw?.result??raw;
 const rows=Array.isArray(body)?body:Array.isArray(body?.profiles)?body.profiles:
  Array.isArray(body?.items)?body.items:null;
 if(!rows||rows.length>128)return {state:'inconclusive',reason:'profile_catalog_shape_unknown'};
 const matches=rows.filter(x=>record(x)&&x.name===NAME);
 if(matches.length!==1){
  if(matches.length===0)return {state:'profile_not_registered',reason:'dedicated_profile_missing',
   namedProfileFound:false,profileCountBounded:Math.min(rows.length,128)};
  return {state:'blocked',reason:'duplicate_dedicated_profile',
   namedProfileFound:true,profileCountBounded:Math.min(rows.length,128)};
 }
 const p=matches[0];
 const kind=typeof p.driver==='string'?p.driver:
  typeof p.type==='string'?p.type:null;
 // Missing driver metadata does not prove that the profile is managed.
 const managed=kind==='managed'||kind==='openclaw-managed';
 // 'cdp' alone can also mean a remote/custom endpoint: not managed proof.
 const explicitlyOther=['existing-session','extension','remote','browserless']
  .includes(kind);
 return {state:explicitlyOther?'blocked':'profile_registered',
  reason:explicitlyOther?'profile_has_incompatible_driver':
   managed?'managed_driver_reported':'driver_not_independently_verified',
  namedProfileFound:true,profileCountBounded:Math.min(rows.length,128),
  driverClass:managed?'managed':explicitlyOther?'non_managed':'unknown',
  profileMustNotBeOverwritten:true};
}
export function summarizeProfileStatus(raw){
 const x=raw?.result??raw;
 if(!record(x))return {statusState:'unknown',reason:'profile_status_shape_unknown'};
 const running=x.running===true?true:x.running===false?false:null;
 const headless=x.headless===true?true:x.headless===false?false:null;
 return {statusState:running===true&&headless===false?
  'headed_browser_running':'headed_login_not_ready',
  browserRunning:running,visibleWindowMode:headless===false,
  headlessState:headless===null?'unknown':headless?'yes':'no',
  headlessSource:['env','profile','config','request','default']
   .includes(x.headlessSource)?x.headlessSource:'unreported'};
}
export async function inspectAliceManagedBrowser({
 platform=process.platform,
 runtimeCheck=async()=>ROOT===RUNTIME&&
  await promisify(realpath)(RUNTIME)===RUNTIME,
 call=async args=>{
  const {stdout}=await exec(CLI,args,{cwd:RUNTIME,timeout:18000,
   maxBuffer:1024*1024,shell:false});
  return JSON.parse(stdout);
 }}={}){
 const b=base();
 if(platform!=='darwin'||!await runtimeCheck().catch(()=>false))
  return {...b,state:'blocked',reason:'private_macos_runtime_required'};
 let catalog;
 try{catalog=summarizeProfileCatalog(await call(['browser','--json','profiles']))}
 catch{return {...b,state:'inconclusive',reason:'browser_profiles_unavailable'};}
 if(catalog.state!=='profile_registered')return {...b,...catalog};
 if(catalog.driverClass==='unknown')return {...b,...catalog,
  state:'inconclusive',reason:'profile_driver_unverified'};
 let status;
 try{status=summarizeProfileStatus(await call([
  'browser','--browser-profile',NAME,'--json','status']))}
 catch{return {...b,...catalog,state:'inconclusive',
  reason:'managed_browser_status_unavailable'};}
 return {...b,...catalog,...status,
  state:status.statusState==='headed_browser_running'?
   'headed_profile_exists':'headed_profile_not_ready',
  reason:status.statusState==='headed_browser_running'?
   'ready_for_separately_authorized_login_window':
   'visible_managed_browser_preparation_required'};
}
if(process.argv[1]&&realpathSync(process.argv[1])===
 realpathSync(fileURLToPath(import.meta.url))){
 const r=process.argv.length===2?await inspectAliceManagedBrowser():
  {...base(),state:'blocked',reason:'unexpected_arguments'};
 console.log(JSON.stringify(r));
 if(r.state==='inconclusive')process.exitCode=1;
}
