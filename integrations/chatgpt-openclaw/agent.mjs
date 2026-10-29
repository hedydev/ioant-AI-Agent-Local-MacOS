// Initial direct MCP acceptance targets the existing no-tools local advisor.
// No Worker, browser polling, remote delivery, model selection or shell input.
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {readPrivateJson} from '../../stage2/workflow-capabilities.mjs';
import {invokeDevCli} from '../../stage2/openclaw-alice-dev-discuss.mjs';
import {redactFeedback} from '../../stage2/protocol.mjs';

const AGENT='openclaw-dev';
const MODEL='ollama/gemma4:26b-a4b';
const KEY=/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,63}$/;
const model=x=>typeof x==='string'?x:x?.primary;
const noFallback=x=>!x||typeof x==='string'||
 (typeof x==='object'&&(!Object.hasOwn(x,'fallbacks')||
   Array.isArray(x.fallbacks)&&x.fallbacks.length===0));

export function spawnAgentWithoutTransportSecrets(file,args,options,spawnImpl=spawn){
 const env={...options.env};
 for(const key of Object.keys(env)){
  if(/TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL|AUTHORIZATION|COOKIE/i.test(key))delete env[key];
 }
 return spawnImpl(file,args,{...options,env});
}
const invokeDirectCli=(args,body)=>invokeDevCli(args,body,
 {spawnImpl:spawnAgentWithoutTransportSecrets});

export function directAgentPolicy(config){
 const defaults=config?.agents?.defaults;
 const a=config?.agents?.entries?.[AGENT];
 const p=config?.models?.providers?.ollama;
 return model(a?.model)===MODEL&&noFallback(a.model)&&noFallback(defaults?.model)&&
  p?.baseUrl==='http://127.0.0.1:11435'&&p?.api==='ollama'&&
  a?.tools?.deny?.includes('*')===true&&a?.tools?.exec?.mode==='deny';
}

export async function inspectDirectAgent({load=()=>readPrivateJson(
 join(homedir(),'.openclaw/openclaw.json'))}={}){
 try{
  if(['OPENCLAW_PROFILE','OPENCLAW_CONFIG_PATH','OPENCLAW_STATE_DIR']
   .some(k=>process.env[k]))throw Error('custom_profile');
  const ready=directAgentPolicy(await load());
  return {state:ready?'ready':'blocked',agent:AGENT,localModelOnly:true,
   toolsEnabled:false,computerControlEnabled:false,
   workerRequired:false,chatgptConnectionVerified:false};
 }catch{return {state:'blocked',reason:'local_agent_policy_unverified'};}
}

export async function messageDirectAgent(input,{inspect=inspectDirectAgent,
 invoke=invokeDirectCli}={}){
 if(!input||Object.keys(input).sort().join(',')!=='conversation_key,message'||
  !KEY.test(input.conversation_key??'')||typeof input.message!=='string'||
  !input.message.trim()||input.message.length>4000||Buffer.byteLength(input.message)>8000||
  /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(input.message))
  return {state:'blocked',reason:'invalid_message'};
 const policy=await inspect();
 if(policy?.state!=='ready'||policy.toolsEnabled!==false)
  return {state:'blocked',reason:'local_agent_policy_unverified'};
 const key=createHash('sha256').update(input.conversation_key).digest('hex').slice(0,24);
 const args=['agent','--agent',AGENT,'--session-key','agent:'+AGENT+':direct-'+key,
  '--model',MODEL,'--thinking','off','--message-file','/dev/stdin','--timeout','120','--json'];
 let reply;
 try{reply=await invoke(args,input.message);}
 catch{return {state:'inconclusive',reason:'agent_unavailable_no_retry'};}
 const data=reply?.data,meta=data?.result?.meta;
 if(reply?.state!=='reply'||data?.status!=='ok'||meta?.agentMeta?.provider!=='ollama'||
  meta.agentMeta.model!=='gemma4:26b-a4b'||meta?.aborted===true)
  return {state:'inconclusive',reason:'local_completion_unverified_no_retry'};
 const payloads=data.result.payloads;
 if(!Array.isArray(payloads)||payloads.length<1||payloads.length>8||
  payloads.some(x=>typeof x?.text!=='string'))
  return {state:'inconclusive',reason:'reply_unavailable'};
 const text=redactFeedback(payloads.map(x=>x.text).join('\n')).trim();
 if(!text)return {state:'inconclusive',reason:'reply_unavailable'};
 return {state:'answered',agent:AGENT,provider:'ollama',model:'gemma4:26b-a4b',
  workerUsed:false,toolsEnabled:false,computerControlEnabled:false,
  text,outputIsUntrusted:true};
}
