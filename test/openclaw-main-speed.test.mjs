import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {actionFromJson} from '../stage2/protocol.mjs';
import {actionPlan} from '../stage2/runner.mjs';
import {summarizeMainConfig,summarizeOllamaPs,inspectMainSpeed}
 from '../stage2/openclaw-main-speed.mjs';

const config={payload:{valid:true,exists:true,hash:'OPAQUE_PRIVATE_REVISION',
 resolved:{
  agents:{defaults:{model:{primary:'ollama/gemma4:26b-a4b',
   fallbacks:['ollama/gpt-oss:20b']},thinkingDefault:'high',
   maxConcurrent:3,fastModeDefault:false},
   entries:{main:{model:{primary:'ollama/gemma4:26b-a4b'},
    thinkingDefault:'low',workspace:'/SECRET/WORKSPACE',apiKey:'SECRET-KEY'}}},
  models:{providers:{ollama:{api:'ollama',baseUrl:'http://127.0.0.1:11435',
   apiKey:'SECRET-KEY',models:[{id:'gemma4:26b-a4b',contextWindow:32768}]}}}
 }}};
const reply=body=>{
 const b=new TextEncoder().encode(JSON.stringify(body));
 return {ok:true,headers:{get:()=>String(b.byteLength)},
  body:new ReadableStream({start(c){c.enqueue(b);c.close();}})};
};

test('main latency probe is fixed, read-only, no user-supplied script parameters',()=>{
 const task=actionFromJson(JSON.stringify({protocol:'ioant-mac-ops-v1',
  id:'main-speed-diagnostic-001',action:'openclaw-main-speed'}));
 assert.equal(task.authorized,true);
 const plan=actionPlan(task.action,'/repo');
 assert.equal(plan.bin,process.execPath);
 assert.deepEqual(plan.args,['stage2/openclaw-main-speed.mjs','--run']);
 assert.equal(plan.reportAudit,'IOANT_OPENCLAW_MAIN_SPEED');
 assert.throws(()=>actionFromJson(JSON.stringify({protocol:task.protocol,
  id:task.id,action:task.action,cmd:'rm -rf /'})),/Malformed/);
 assert.equal(actionPlan('openclaw-config-preflight','/repo').reportAudit,
  'IOANT_OPENCLAW_CONFIG_PREFLIGHT');
});

test('Gateway main model/thinking/fast-mode/provider/concurrency are sanitized',()=>{
 const doc=summarizeMainConfig(config);
 assert.equal(doc.status,'observed');
 assert.equal(doc.mainEntry,'explicit');
 assert.equal(doc.model,'ollama/gemma4:26b-a4b');
 assert.equal(doc.modelSource,'main_override');
 assert.equal(doc.fallbackCount,1);
 assert.deepEqual(doc.thinkingDefault,{main:'low',global:'high'});
 assert.equal(doc.contextWindow,32768);
 assert.equal(doc.maxConcurrent,3);
 assert.equal(doc.provider,'expected_local');
 assert.equal(doc.sessionOverride,'unobserved');
 assert.equal(doc.fastModeDefault,'inherited_off');
 for(const secret of ['SECRET-KEY','SECRET/WORKSPACE','OPAQUE_PRIVATE_REVISION'])
  assert.ok(!JSON.stringify(doc).includes(secret));
});

test('different, absent and malicious configuration values never leak',()=>{
 const unsafe={config:{agents:{defaults:{model:{
  primary:'secret/very-private-model',fallbacks:['PRIVATE_SESSION']
 },thinkingDefault:'SECRET-THING',maxConcurrent:99999}}}};
 const summary=summarizeMainConfig(unsafe);
 assert.equal(summary.model,'other');
 assert.equal(summary.thinkingDefault.global,'other');
 assert.equal(summary.fallbackCount,1);
 assert.equal(summary.maxConcurrent,'unknown');
 assert.doesNotMatch(JSON.stringify(summary),/secret\/very-private|PRIVATE_SESSION|SECRET-THING/);
 assert.equal(summarizeMainConfig({payload:{valid:false,config:config.payload.resolved}}).status,'unavailable');
 assert.equal(summarizeMainConfig({payload:{config:'SECRET'}}).status,'unavailable');
});

test('main agent can appear in official entries array or inherit shared defaults',()=>{
 const doc={payload:{resolved:{agents:{defaults:{model:'ollama/gpt-oss:20b',
  thinkingDefault:'off'},entries:[{id:'main',thinkingDefault:'minimal'}]}}}};
 const x=summarizeMainConfig(doc);
 assert.equal(x.model,'ollama/gpt-oss:20b');
 assert.equal(x.modelSource,'global_default');
 assert.deepEqual(x.thinkingDefault,{main:'minimal',global:'off'});
});

test('Ollama residency counts do not leak other models, tokens or paths',()=>{
 const doc=summarizeOllamaPs({models:[
  {name:'gemma4:26b-a4b',context_length:16384,path:'/VERY_PRIVATE'},
  {name:'SECRET_OTHER_LOCAL_MODEL',token:'PRIVATE_TOKEN'}
 ]},'ollama/gemma4:26b-a4b');
 assert.deepEqual(doc,{status:'observed',residentCount:2,mainModelResident:'yes',
  otherModelsResident:1,mainModelContext:16384});
 assert.doesNotMatch(JSON.stringify(doc),/SECRET|VERY_PRIVATE/);
 assert.equal(summarizeOllamaPs({models:'SECRET'},'ollama/gemma4:26b-a4b').status,'unavailable');
 assert.equal(summarizeOllamaPs({models:[]},'other').mainModelResident,'unknown');
});

test('read-only main speed probe reports RPC and Ollama query latency, never creates a model',async()=>{
 const methods=[];let fetches=[];let now=100;
 const result=await inspectMainSpeed({customProfile:false,
  clock:()=>{now+=11;return now;},
  rpc:async(method,params)=>{methods.push([method,params]);return config;},
  request:async(url,opts)=>{fetches.push([url,opts.method]);return reply({
   models:[{name:'gemma4:26b-a4b',context_length:8192}]
  });}
 });
 assert.equal(result.audit,'IOANT_OPENCLAW_MAIN_SPEED');
 assert.equal(result.status,'observed');
 assert.equal(result.readOnly,true);
 assert.equal(result.modelGeneration,false);
 assert.equal(result.agentInvocation,false);
 assert.equal(result.configWrite,false);
 assert.equal(result.configElapsedMs,11);
 assert.equal(result.ollamaPsElapsedMs,11);
 assert.deepEqual(methods,[['config.get',{}]]);
 assert.deepEqual(fetches,[['http://127.0.0.1:11435/api/ps','GET']]);
 assert.equal(result.ollama.mainModelResident,'yes');
});

test('unavailable Gateway or custom profile fails closed and does not call tools',async()=>{
 const a=await inspectMainSpeed({customProfile:true,
  rpc:async()=>{throw Error('called')},request:async()=>{throw Error('called')}});
 assert.equal(a.status,'custom_profile_review');
 let queried=0;
 const b=await inspectMainSpeed({customProfile:false,
  rpc:async()=>{throw Error('PRIVATE_TOKEN')},
  request:async()=>{queried++;return reply({models:[]});}});
 assert.equal(b.status,'partial');
 assert.equal(b.config.status,'unavailable');
 assert.equal(queried,1);
 assert.doesNotMatch(JSON.stringify(b),/PRIVATE_TOKEN/);
});

test('empty stdout of preflight is no longer accepted as a successful diagnostic',()=>{
 const source=readFileSync(resolve(import.meta.dirname,'../stage2/runner.mjs'),'utf8');
 assert.match(source,/if\(plan\.reportAudit\)/);
 assert.match(source,/reportOk=obj&&typeof obj==='object'/);
 assert.match(source,/reason:'missing_or_invalid_diagnostic_report'/);
});
