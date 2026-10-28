#!/usr/bin/env node
// Inspect the AliceAI managed browser's explicit proxy routing without
// publishing proxy endpoints, flags, credentials, arguments or config bodies.
// No navigation, config writes, SSRF relaxation, browser restart or CUA.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {realpath} from 'node:fs/promises';
import {realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile);
const CLI=join(homedir(),'.openclaw','bin','openclaw');
const RUNTIME=join(homedir(),'Library','Application Support','ioant-openclaw-ops','runtime');
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const AUDIT='IOANT_ALICE_BROWSER_PROXY_CAUSE_READONLY';
const resultBase=()=>({audit:AUDIT,schemaVersion:1,readOnly:true,
 profile:'alice-ai',credentialsRead:false,rawConfigEmitted:false,
 rawArgsEmitted:false,proxyEndpointEmitted:false,browserNavigation:false,
 browserStarted:false,profileModified:false,ssrfRelaxed:false,
 gatewayRestarted:false,chromeChanged:false,chatMessageSent:false,
 nativeComputerActInvoked:false});
const plain=x=>x&&typeof x==='object'&&!Array.isArray(x);
const flags=arr=>{
 const xs=Array.isArray(arr)?arr.filter(x=>typeof x==='string'):[];
 const named=name=>xs.some(x=>x===name||x.startsWith(name+'='));
 return {explicitProxy:named('--proxy-server')||named('--proxy-pac-url')||
   named('--proxy-auto-detect'),
   noProxy:named('--no-proxy-server'),
   proxyArgCount:Math.min(xs.filter(x=>/^--proxy-(?:server|pac-url|auto-detect|bypass-list)(?:=|$)/.test(x)).length,20)};
};
export function classifyProxyEvidence(config,status,argv=null){
 if(!plain(config)||!plain(status)||status.profile!=='alice-ai')
  return {state:'inconclusive',reason:'config_or_status_shape_unverified'};
 const browser=plain(config.browser)?config.browser:config;
 const profile=browser.profiles?.['alice-ai'];
 if(!plain(profile))return {state:'inconclusive',reason:'dedicated_profile_config_missing'};
 const global=flags(browser.extraArgs),local=flags(profile.extraArgs);
 const process=typeof argv==='string'?flags(argv.split(/\s+(?=--)/)):null;
 // Process-level evidence is only accepted if the command identifies the
 // expected managed CDP port; never report process argv, executable or PID.
 const pid=Number.isSafeInteger(status.pid)&&status.pid>0;
 const ownsPort=typeof argv==='string'&&
  /(?:^|\s)--remote-debugging-port=18801(?:\s|$)/.test(argv);
 const processChecked=pid&&ownsPort&&process!==null;
 const explicit=global.explicitProxy||local.explicitProxy||
  (processChecked&&process.explicitProxy);
 const policy=plain(browser.ssrfPolicy)?browser.ssrfPolicy:null;
 const privateOptIn=policy?.dangerouslyAllowPrivateNetwork===true?'enabled':
  policy?.dangerouslyAllowPrivateNetwork===false?'explicitly_disabled':'unset';
 return {state:'observed',reason:explicit?'explicit_proxy_routing_detected':
  'proxy_origin_not_proven_from_visible_flags',
  profileRegistered:true,browserRunning:status.running===true,
  browserHeaded:status.headless===false,cdpReady:status.cdpReady===true,
  expectedCDPPort:status.cdpPort===18801,
  globalExplicitProxyFlag:global.explicitProxy,
  profileExplicitProxyFlag:local.explicitProxy,
  processCommandAttested:processChecked,
  processExplicitProxyFlag:processChecked?process.explicitProxy:null,
  globalNoProxyFlag:global.noProxy,
  profileNoProxyFlag:local.noProxy,
  privateNetworkSSRFOptIn:privateOptIn,
  // Config and Chromium argv flags are not proof of successful network
  // egress, DNS policy enforcement, or whether a direct route can reach ChatGPT.
  directEgressVerified:false,proxySecurityVerified:false,
  nextGate:explicit?'review_scoped_proxy_routing':
    'investigate_runtime_proxy_attribution'};
}
export async function inspectAliceBrowserProxy({
 platform=process.platform,
 runtimeCheck=async()=>ROOT===RUNTIME&&await realpath(RUNTIME)===RUNTIME,
 call=async args=>{
  const {stdout}=await exec(CLI,args,{cwd:RUNTIME,timeout:16000,
   maxBuffer:1024*1024,shell:false});
  return JSON.parse(stdout);
 },
 ps=async pid=>{
  const {stdout}=await exec('/bin/ps',['-p',String(pid),'-o','command='],
   {timeout:4500,maxBuffer:65536,shell:false});
  return stdout;
 }
}={}){
 const b=resultBase();
 if(platform!=='darwin'||!await runtimeCheck().catch(()=>false))
  return {...b,state:'blocked',reason:'private_macos_runtime_required'};
 let status;
 try{status=await call(['browser','--browser-profile','alice-ai','--json','status'])}
 catch{return {...b,state:'inconclusive',reason:'managed_browser_status_unavailable'};}
 if(!plain(status)||status.profile!=='alice-ai')
  return {...b,state:'inconclusive',reason:'wrong_browser_profile'};
 let cfg;
 try{cfg=await call(['config','get','browser','--json']);}
 catch{return {...b,state:'inconclusive',reason:'browser_config_snapshot_unavailable',
  browserRunning:status.running===true};}
 let argv=null;
 if(status.running===true&&Number.isSafeInteger(status.pid)&&status.pid>0)
  try{argv=await ps(status.pid)}catch{}
 return {...b,...classifyProxyEvidence(cfg,status,argv)};
}
if(process.argv[1]&&realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url))){
 const r=process.argv.length===2?await inspectAliceBrowserProxy():
  {...resultBase(),state:'blocked',reason:'arguments_not_supported'};
 console.log(JSON.stringify(r));
 if(r.state==='inconclusive')process.exitCode=1;
}
