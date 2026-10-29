import test from 'node:test';
import assert from 'node:assert/strict';
import {directAgentPolicy,messageDirectAgent,spawnAgentWithoutTransportSecrets}
 from '../integrations/chatgpt-openclaw/agent.mjs';
import {callTool,tools} from '../integrations/chatgpt-openclaw/server.mjs';

const config={agents:{defaults:{model:'ollama/local'},entries:{'openclaw-dev':{
 model:'ollama/gemma4:26b-a4b',tools:{deny:['*'],exec:{mode:'deny'}}}}},
 models:{providers:{ollama:{baseUrl:'http://127.0.0.1:11435',api:'ollama'}}}};
const input={conversation_key:'test_chat_123',message:'Reply READY'};
const inspect=async()=>({state:'ready',toolsEnabled:false});
const response={state:'reply',data:{status:'ok',result:{payloads:[{text:'READY'}],
 meta:{agentMeta:{provider:'ollama',model:'gemma4:26b-a4b'}}}}};

test('direct adapter rejects cloud routing, fallbacks and broadened advisor tools',()=>{
 assert.equal(directAgentPolicy(config),true);
 for(const change of [c=>c.models.providers.ollama.baseUrl='https://other',
  c=>c.agents.entries['openclaw-dev'].model='openai/cloud',
  c=>c.agents.defaults.model={primary:'ollama/local',fallbacks:['openai/cloud']},
  c=>c.agents.entries['openclaw-dev'].tools.deny=[]]){
  const c=structuredClone(config);change(c);assert.equal(directAgentPolicy(c),false);
 }
});

test('one direct Gateway invocation uses fixed local agent/model and stdin',async()=>{
 let calls=0;
 const r=await messageDirectAgent(input,{inspect,invoke:async(args,body)=>{
  calls++;assert.equal(body,input.message);
  assert.equal(args.includes(input.message),false);
  assert.equal(args.includes('--deliver'),false);
  assert.equal(args[args.indexOf('--agent')+1],'openclaw-dev');
  assert.equal(args[args.indexOf('--model')+1],'ollama/gemma4:26b-a4b');
  return response;
 }});
 assert.equal(calls,1);assert.equal(r.state,'answered');assert.equal(r.workerUsed,false);
 assert.equal(r.computerControlEnabled,false);
});

test('caller cannot supply an agent, command, route, session path or oversized payload',async()=>{
 let calls=0;
 for(const data of [{...input,agent:'main'},{...input,command:'run'},
  {...input,conversation_key:'../../private'},{...input,message:'a'.repeat(4001)}]){
  const r=await messageDirectAgent(data,{inspect,invoke:async()=>{calls++;return response;}});
  assert.equal(r.state,'blocked');
 }
 assert.equal(calls,0);
});

test('timeout or unexpected backend does not retry or expose raw metadata',async()=>{
 let calls=0;
 const fail=await messageDirectAgent(input,{inspect,invoke:async()=>{calls++;throw Error('secret');}});
 assert.equal(calls,1);assert.equal(fail.state,'inconclusive');
 const bad=structuredClone(response);bad.data.result.meta.agentMeta.provider='other';
 const r=await messageDirectAgent(input,{inspect,invoke:async()=>bad});
 assert.equal(r.state,'inconclusive');assert.equal(JSON.stringify(r).includes('secret'),false);
});

test('MCP exposes two bounded tools and requires no model for readiness',async()=>{
 assert.equal(tools.length,2);
 assert.equal(tools[1].annotations.readOnlyHint,false);
 let calls=0;
 const r=await callTool('openclaw_agent_status',{},
  {status:async()=>({state:'ready'}),message:async()=>{calls++;}});
 assert.equal(r.isError,false);assert.equal(calls,0);
 assert.equal((await callTool('unknown',{})).isError,true);
});

test('tunnel runtime credentials never reach the OpenClaw Agent subprocess',()=>{
 const env={HOME:'/home/test',PATH:'/usr/bin',CONTROL_PLANE_API_KEY:'private',
  OPENAI_API_KEY:'private',OPENCLAW_GATEWAY_TOKEN:'private',OTHER_SECRET:'private'};
 let checked=false;
 spawnAgentWithoutTransportSecrets('/fixed/cli',['agent'],{env,shell:false},
  (file,args,opts)=>{
   checked=true;assert.equal(file,'/fixed/cli');assert.deepEqual(args,['agent']);
   assert.deepEqual(opts.env,{HOME:'/home/test',PATH:'/usr/bin'});
   assert.equal(opts.shell,false);
  });
 assert.equal(checked,true);
 assert.equal(env.CONTROL_PLANE_API_KEY,'private');
});
