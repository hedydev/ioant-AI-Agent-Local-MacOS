// Passive inventory of the existing Ops executor, not a permission grant.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {lstat,readFile,realpath} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {chatKey} from './protocol.mjs';
import {installedPlistBinding,parseLaunchdRuntime} from './ops-supervisor.mjs';
import {inspectTerminalAccess} from './mac-terminal-access.mjs';
import {inspectWindowAccess} from './mac-window-text.mjs';

const exec=promisify(execFile);
const HOME=homedir();
const PLIST=join(HOME,'Library/LaunchAgents/com.ioant.openclaw.safe-watcher.plist');
const CACHE='/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos';
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);

// Never include the input document or exception text in diagnostics.
export async function readPrivateJson(path,{stat=lstat,canonical=realpath,read=readFile}={}){
 const s=await stat(path);
 if(!s.isFile()||s.isSymbolicLink()||s.size>131072||(s.mode&0o077)!==0||
   (typeof process.getuid==='function'&&s.uid!==process.getuid())||await canonical(path)!==path)
  throw Error('private_document_unverified');
 const data=JSON.parse(await read(path,'utf8'));
 if(!plain(data))throw Error('private_document_unverified');
 return data;
}

export function summarizeCapabilities({binding,service,terminal,window,state,config}={}){
 const bound=binding?.kind==='local';
 const agents=config?.agents?.entries;
 const dev=agents?.['openclaw-dev'];
 const denied=dev?.tools?.deny?.includes('*')===true;
 const grantStatus=x=>!bound?'unverified':x?.state==='enabled'?'authorized':
  x?.state==='disabled'?'not_authorized':'unverified';
 return {
  audit:'IOANT_WORKFLOW_CAPABILITIES',schemaVersion:1,readOnly:true,
  state:bound?'observed':'inconclusive',
  modelInferenceInvoked:false,browserAccessed:false,desktopInput:false,
  chatMessageSent:false,configurationChanged:false,
  worker:{bindingVerified:bound,
   service:bound&&['running','stopped'].includes(service?.state)?service.state:'unverified',
   // A running service is not evidence it can currently read/send in ChatGPT.
   chatTransport:'not_probed',
   pendingFeedback:!bound||!plain(state)?'unverified':
    !Object.hasOwn(state,'feedbackPending')?'unverified':
     state.feedbackPending===null?'none':'present'},
  capabilities:{
   projectChecks:{executor:'worker_fixed_commands',modelRequired:false},
   terminal:{authorization:grantStatus(terminal),executor:'worker_zsh',
    modelRequired:false,scope:'current_user_permissions_not_os_sandbox'},
   windowText:{authorization:grantStatus(window),executor:'worker_window_text',
    modelRequired:false},
   nativeComputer:{executor:'openclaw_paired_mac_node',modelRequired:false,
    liveReadiness:'not_probed',backgroundChatDelivery:'not_verified'},
   agentDiscussion:{executor:'openclaw_agent',modelRequired:true,
    configured:plain(dev),tools:plain(dev)?denied?'deny_all':'review_required':'unverified',
    // The recognized installed manifest currently pins --dev-agent openclaw-dev.
    launchBinding:bound?'openclaw-dev':'unverified'},
   modelSmokeActions:{modelRequired:true,registeredInWorker:true}
  },
  inferencePolicy:{executorCanRunWithoutModel:true,
   allModelCallsDisabled:false,
   note:'discussion_and_inference_smoke_routes_still_exist'}
 };
}

export async function inspectWorkflowCapabilities({platform=process.platform,
 loadBinding=async()=>{
  const st=await lstat(PLIST);
  if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0||st.size>20000||
    st.uid!==process.getuid()||await realpath(PLIST)!==PLIST)return null;
  return installedPlistBinding(await readFile(PLIST,'utf8'));
 },
 loadService=async()=>{
  const {stdout}=await exec('/bin/launchctl',
   ['print','gui/'+process.getuid()+'/com.ioant.openclaw.safe-watcher'],
   {timeout:5000,maxBuffer:65536,shell:false});
  return parseLaunchdRuntime(stdout);
 },
 terminal=inspectTerminalAccess,window=inspectWindowAccess,
 loadState=async b=>readPrivateJson(join(CACHE,'chatgpt-loop',chatKey(b.chatUrl),'state.json')),
 loadConfig=async()=>readPrivateJson(join(HOME,'.openclaw/openclaw.json'))
}={}){
 if(platform!=='darwin')return summarizeCapabilities();
 let binding;
 try{binding=await loadBinding();}catch{return summarizeCapabilities();}
 if(binding?.kind!=='local')return summarizeCapabilities();
 const probes=await Promise.allSettled([
  loadService(),terminal({conversationUrl:binding.chatUrl}),
  window({conversationUrl:binding.chatUrl}),loadState(binding),loadConfig()
 ]);
 const [service,t,w,state,config]=probes.map(x=>x.status==='fulfilled'?x.value:undefined);
 return summarizeCapabilities({binding,service,terminal:t,window:w,state,config});
}
