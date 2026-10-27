#!/usr/bin/env node
// Reusable fixed entrypoint for task 075. No authored config writes or external delivery.
// Executes one isolated continuation test only after checking that main is idle.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

const exec=promisify(execFile);
const CLI=join(homedir(),'.openclaw','bin','openclaw');
const BASE=/^agent:main:off-base-[0-9a-f]{12}$/;
const report=(state,fields={})=>({audit:'IOANT_MAIN_CONTINUATION_BENCHMARK',schemaVersion:1,
  state,configWrite:false,channelDelivery:false,...fields});
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const sessions=x=>isObj(x)&&Array.isArray(x.sessions)?x.sessions:null;
const sessionKey=x=>x?.key??x?.sessionKey;

export async function gatewayRpc(method,params,timeoutMs=16000){
 const args=['gateway','call',method,'--json','--timeout',String(timeoutMs),
   '--params',JSON.stringify(params)];
 const env={...process.env};
 for(const k of ['OPENCLAW_GATEWAY_TOKEN','OPENCLAW_GATEWAY_PASSWORD',
   'OPENCLAW_GATEWAY_URL','NODE_TEST_CONTEXT','IOANT_LOOP_LOG_FILE'])delete env[k];
 const {stdout}=await exec(CLI,args,{timeout:timeoutMs+7000,maxBuffer:512*1024,env});
 const response=JSON.parse(stdout);
 return isObj(response?.payload)?response.payload:response;
}

export async function runMainContinuationBenchmark({rpc=gatewayRpc,now=()=>performance.now(),
  uid=randomUUID}={}){
 try{
  const busy=await rpc('sessions.list',{activeOnly:true,limit:100});
  const active=sessions(busy);
  if(!active)return report('blocked',{reason:'active_query_unavailable'});
  if(active.length||busy.hasMore)return report('skipped_busy',{priorActive:active.length});
  const prior=sessions(await rpc('sessions.list',{agentId:'main',limit:100}));
  if(!prior)return report('blocked',{reason:'session_query_unavailable'});
  const baseline=prior.find(s=>isObj(s)&&BASE.test(sessionKey(s)??''));
  if(!baseline)return report('blocked',{reason:'baseline_session_missing'});
  const key=sessionKey(baseline),start=now();
  const response=await rpc('agent',{
    agentId:'main',sessionKey:key,message:'不调用工具，只回答数字：3加3等于几？',
    thinking:'off',deliver:false,idempotencyKey:uid()
  },30000);
  if(typeof response?.runId!=='string'||!response.runId)return report('inconclusive',
    {reason:'run_id_missing',elapsedSeconds:Math.round((now()-start)/100)/10});
  const waited=await rpc('agent.wait',{runId:response.runId,timeoutMs:105000},115000);
  const elapsedSeconds=Math.round((now()-start)/10)/100;
  const after=sessions(await rpc('sessions.list',{agentId:'main',limit:100}));
  const latest=after?.find(s=>isObj(s)&&sessionKey(s)===key);
  const hist=await rpc('chat.history',{sessionKey:key,limit:6});
  const entries=Array.isArray(hist?.messages)?hist.messages:[];
  const lastAssistant=entries.slice().reverse().find(m=>m?.role==='assistant');
  const content=lastAssistant?.content;
  const answer=typeof content==='string'?content:Array.isArray(content)?
    content.filter(x=>x?.type==='text'&&typeof x.text==='string').map(x=>x.text).join(' '):'';
  const correct=/\b6\b/.test(answer.trim());
  const status=waited?.status??'unknown';
  return report(status==='ok'&&correct?'passed':'inconclusive',{
    runStatus:status,accepted:response.status??'unknown',
    baselineInputTokens:Number.isFinite(baseline.inputTokens)?baseline.inputTokens:null,
    afterInputTokens:Number.isFinite(latest?.inputTokens)?latest.inputTokens:null,
    afterOutputTokens:Number.isFinite(latest?.outputTokens)?latest.outputTokens:null,
    elapsedSeconds,historyCount:entries.length,replyChars:answer.length,correct
  });
 }catch(e){
  // Never print Gateway errors, session keys, raw response or model output.
  return report('inconclusive',{reason:'rpc_or_timeout_failure',failureType:e?.name??'Error'});
 }
}
async function directlyInvoked(){
 if(!process.argv[1])return false;
 try{return await realpath(process.argv[1])===await realpath(fileURLToPath(import.meta.url))}
 catch{return false}
}
if(await directlyInvoked()){
 const result=await runMainContinuationBenchmark();
 process.stdout.write(JSON.stringify(result)+'\n');
}
