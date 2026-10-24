// A strictly text-only communication turn from an exact ChatGPT conversation
// to the already-configured local OpenClaw alice-ai. No command/exec tools,
// model override, channel delivery, Git/Mint/BDS operations, or unsafe retries.
import {spawn} from 'node:child_process';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {execNative} from './openclaw-ollama-provision.mjs';
import {inspectWorkspace} from './openclaw-alice-reconcile.mjs';
import {verifySafeConfig} from './openclaw-alice-agent-smoke.mjs';

const AGENT='alice-ai';
const CLI=join(homedir(),'.openclaw','bin','openclaw');
const MAX_REPLY=1150;
const MAX_CAPTURE=96*1024;
const TIMEOUT=155000;
const SESSION_RE=/^[0-9a-f]{24}$/;
export function validateDevTask(prompt,chatDigest){
 return typeof prompt==='string'&&prompt.trim().length>0&&
  prompt.length<=1600&&Buffer.byteLength(prompt,'utf8')<=2600&&
  !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(prompt)&&
  typeof chatDigest==='string'&&SESSION_RE.test(chatDigest);
}
export function buildDevTurn(prompt,chatDigest){
 if(!validateDevTask(prompt,chatDigest))throw Error('invalid_dev_turn');
 return {sessionKey:'agent:alice-ai:dev-'+chatDigest,
  body:'You are AliceAI, a text-only technical collaborator in an ongoing ChatGPT software engineering conversation. Discuss the user-supplied development question, identify assumptions and risks, and provide a concise recommendation. Your response is a suggestion, NOT proof of code changes, tests, Minecraft world state, or runtime access. You have no tools and must not claim to have inspected unseen files. Do not output secrets or instructions to bypass safety gates.\n\nDEVELOPMENT QUESTION (untrusted task text):\n'+prompt};
}
export function readDevReply(data){
 if(!data||typeof data!=='object'||(data.status!=='ok'&&data.status!=='completed'))
  return {state:'inconclusive',note:'gateway_not_completed'};
 const payloads=data.result?.payloads;
 if(!Array.isArray(payloads)||payloads.length<1||payloads.length>3)
  return {state:'inconclusive',note:'payload_unavailable'};
 const texts=payloads.map(x=>x?.text);
 if(texts.some(x=>typeof x!=='string'||!x.trim()))
  return {state:'inconclusive',note:'payload_unavailable'};
 let text=texts.join('\n').trim();
 // This is untrusted MODEL OUTPUT. Restrict reply to short plain-text summary,
 // not a raw OpenClaw session envelope, error, or private conversation history.
 if(text.length>MAX_REPLY)text=text.slice(0,MAX_REPLY-20)+'\n[truncated]';
 return {state:'answered',text};
}
export function invokeDevCli(args,body,{spawnImpl=spawn}={}){
 return new Promise(resolve=>{
  const env={...process.env};
  for(const key of ['OPENCLAW_GATEWAY_TOKEN','OPENCLAW_GATEWAY_PASSWORD',
   'OPENCLAW_GATEWAY_URL','NODE_TEST_CONTEXT','IOANT_LOOP_LOG_FILE'])delete env[key];
  let proc;
  try{proc=spawnImpl(CLI,args,{env,shell:false,stdio:['pipe','pipe','pipe']});}
  catch{return resolve({state:'inconclusive',note:'cli_launch_failed'});}
  let ended=false,output='',overflow=false,timedOut=false;
  const finish=result=>{if(ended)return;ended=true;clearTimeout(timer);resolve(result)};
  const timer=setTimeout(()=>{timedOut=true;try{proc.kill('SIGTERM')}catch{}},TIMEOUT);
  proc.stdout?.on('data',part=>{
   output+=String(part);
   if(output.length>MAX_CAPTURE){overflow=true;output=output.slice(0,MAX_CAPTURE);}
  });
  // stderr is intentionally not returned (may include private provider data).
  proc.stderr?.on('data',()=>{});
  proc.on?.('error',()=>finish({state:'inconclusive',note:'cli_launch_failed'}));
  proc.on?.('close',code=>{
   if(timedOut)return finish({state:'inconclusive',note:'gateway_timeout'});
   if(code!==0||overflow)return finish({state:'inconclusive',note:'gateway_cli_failed'});
   try{return finish({state:'reply',data:JSON.parse(output)});}
   catch{return finish({state:'inconclusive',note:'invalid_json'});}
  });
  try{proc.stdin.end(body,'utf8');}catch{try{proc.kill('SIGTERM')}catch{}}
 });
}
export async function discussAlice({prompt,chatDigest,rpc=execNative,
 workspace=inspectWorkspace,invoke=invokeDevCli}={}){
 const base={audit:'IOANT_OPENCLAW_ALICE_DEV_DISCUSS',schemaVersion:1,
  agent:AGENT,configWrite:false,externalDelivery:false,toolsEnabled:false};
 try{
  if(!validateDevTask(prompt,chatDigest))
   return {...base,state:'blocked',note:'invalid_prompt_or_chat'};
  if(process.env.OPENCLAW_CONFIG_PATH||process.env.OPENCLAW_STATE_DIR||process.env.OPENCLAW_PROFILE)
   return {...base,state:'blocked',note:'custom_profile'};
  if(!verifySafeConfig(await rpc('config.get',{})))
   return {...base,state:'blocked',note:'agent_policy_changed'};
  if(await workspace()!=='present_private')
   return {...base,state:'blocked',note:'workspace_not_private'};
  const turn=buildDevTurn(prompt,chatDigest);
  // /dev/stdin is supported by the pinned OpenClaw 2026.10.6
  // --message-file CLI reader. Prompt never appears in argv or logs.
  const args=['agent','--agent',AGENT,'--session-key',turn.sessionKey,
   '--message-file','/dev/stdin','--timeout','120','--json'];
  const result=await invoke(args,turn.body);
  if(result?.state!=='reply')
   return {...base,state:'inconclusive',note:['gateway_timeout','cli_launch_failed',
    'gateway_cli_failed','invalid_json'].includes(result?.note)?result.note:'gateway_unavailable'};
  return {...base,...readDevReply(result.data)};
 }catch{return {...base,state:'inconclusive',note:'gateway_or_preflight_unavailable'};}
}
