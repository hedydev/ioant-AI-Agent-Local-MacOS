#!/usr/bin/env node
// Gateway-backed Alice inference acceptance. Does not write configs or deliver to channels.
// A run can create a durable Alice-only test session. Never touches main/Minecraft/SSH.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {execNative,rpcEnvelope} from './openclaw-ollama-provision.mjs';
import {classifyLive,inspectWorkspace} from './openclaw-alice-reconcile.mjs';

const AUDIT='IOANT_OPENCLAW_ALICE_AGENT_SMOKE';
const AGENT='alice-ai';
const CLI=join(homedir(),'.openclaw','bin','openclaw');
const call=promisify(execFile);
const MAX=128*1024;
const WORKSPACE='/Volumes/LunaDrive/DeveloperCache/openclaw-agents/alice-ai';
function obj(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)}
function audited(state,extra={}){
 const out={audit:AUDIT,schemaVersion:1,configWrite:false,channelDelivery:false,
  agent:AGENT,state};
 for(const [k,v] of Object.entries(extra)){
  if(k==='note'&&typeof v==='string'&&/^[a-z_]{3,64}$/.test(v))out.note=v;
  if(k==='response'&&['matched','mismatched','unavailable'].includes(v))out.response=v;
  if(k==='gateway'&&['observed','unavailable'].includes(v))out.gateway=v;
  if(k==='configuredModel'&&v==='ollama/gemma4:26b-a4b')out.configuredModel=v;
  if(k==='durationMs'&&Number.isInteger(v)&&v>=0&&v<1e6)out.durationMs=v;
 }
 return out;
}
export function verifySafeConfig(snapshot){
 const doc=rpcEnvelope(snapshot);
 if(!obj(doc)||doc.valid!==true||doc.exists===false)return false;
 const status=classifyLive(snapshot);
 if(status.status!=='observed'||status.validity!=='valid')return false;
 for(const key of ['sourceConfig','config','parsed','resolved']){
  const root=doc[key];
  if(!obj(root))return false;
  const row=status.roots[key];
  if(row.status!=='observed'||row.main!=='yes'||
    row.alice?.status!=='present'||row.alice.model!=='yes'||
    row.alice.workspace!=='yes'||row.alice.denyAll!=='yes'||
    row.alice.execDenied!=='yes'||row.alice.codeModeOff!=='yes'||
    row.alice.elevatedOff!=='yes'||row.alice.modelAllow!=='yes'||
    row.alice.subagentsDenied!=='yes'||row.alice.skillsEmpty!=='yes'||
    row.explicitOwnership!=='yes'||row.mainSystemOwner!=='yes'||
    row.aliceBinding!=='no'||row.otherAgents!==0)return false;
  if(['sourceConfig','config'].includes(key)&&row.alice.policyExact!=='yes')return false;
  if(root.agents?.entries?.[AGENT]?.workspace!==WORKSPACE)return false;
 }
 return true;
}
export function makeChallenge(nonce){
 if(typeof nonce!=='string'||!/^[a-f0-9]{12}$/.test(nonce))throw Error('unsafe_nonce');
 const target='ALICE_READY_'+nonce.toUpperCase();
 return {target,
  prompt:'OpenClaw local text-only acceptance test. Do not use tools. Reply with exactly the following token and nothing else: '+target};
}
export function interpretReply(data,target){
 if(!obj(data))return {status:'invalid_json'};
 if(data.status!=='ok'&&data.status!=='completed')return {status:'not_completed'};
 const payloads=data.result?.payloads;
 if(!Array.isArray(payloads)||payloads.length!==1)return {status:'no_single_reply'};
 const p=payloads[0];
 if(typeof p?.text!=='string'||p.text.length>3000)return {status:'reply_missing_or_large'};
 const normalized=p.text.trim().replace(/^[\x60]+|[\x60]+$/g,'').trim();
 return {status:normalized===target?'matched':'mismatched'};
}
export async function viaGateway({cli=CLI,execImpl=call,args}={}){
 const env={...process.env};
 for(const key of ['OPENCLAW_GATEWAY_TOKEN','OPENCLAW_GATEWAY_PASSWORD',
  'OPENCLAW_GATEWAY_URL','NODE_TEST_CONTEXT','IOANT_LOOP_LOG_FILE'])delete env[key];
 try{
  const r=await execImpl(cli,args,{timeout:155000,maxBuffer:MAX,env});
  if(typeof r.stdout!=='string'||r.stdout.length>MAX)return {status:'invalid_json'};
  let doc;try{doc=JSON.parse(r.stdout)}catch{return {status:'invalid_json'}}
  return {status:'reply',data:doc};
 }catch{return {status:'cli_failure'}}
}
export async function smokeAlice({rpc=execNative,workspace=inspectWorkspace,
 execute=viaGateway,nonceSource=()=>randomBytes(6).toString('hex'),
 now=()=>Date.now()}={}){
 const start=now();
 try{
  if(process.env.OPENCLAW_CONFIG_PATH||process.env.OPENCLAW_STATE_DIR||process.env.OPENCLAW_PROFILE)
   return audited('blocked',{note:'custom_profile_review'});
  const cfg=await rpc('config.get',{});
  if(!verifySafeConfig(cfg))return audited('blocked',{note:'agent_safety_preflight'});
  if(await workspace()!=='present_private')return audited('blocked',{note:'workspace_not_private'});
  const {prompt,target}=makeChallenge(nonceSource());
  // Fresh Alice-owned session, no delivery; only one dispatch per script execution.
  const sessionKey='agent:alice-ai:smoke-'+target.slice('ALICE_READY_'.length).toLowerCase();
  const args=['agent','--agent',AGENT,'--session-key',sessionKey,
   '--message',prompt,'--timeout','120','--json'];
  const result=await execute({args});
  if(result?.status!=='reply')
   return audited('inconclusive',{gateway:'observed',note:result?.status==='cli_failure'
    ?'gateway_cli_failed':'invalid_response'});
  const observation=interpretReply(result.data,target);
  if(observation.status!=='matched')
   return audited('inconclusive',{gateway:'observed',response:observation.status==='mismatched'
    ?'mismatched':'unavailable',note:observation.status==='mismatched'
      ?'challenge_mismatch':'reply_not_completed'});
  return audited('passed',{gateway:'observed',response:'matched',
   configuredModel:'ollama/gemma4:26b-a4b',durationMs:Math.max(0,Math.round(now()-start))});
 }catch{return audited('inconclusive',{note:'gateway_or_preflight_unavailable'})}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 smokeAlice().then(x=>process.stdout.write(JSON.stringify(x)+'\n')).catch(()=>
  process.stdout.write(JSON.stringify(audited('inconclusive',{note:'unexpected_error'}))+'\n'));
}
