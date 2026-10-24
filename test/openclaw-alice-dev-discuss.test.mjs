import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {actionFromJson,extractAction,chatKey} from '../stage2/protocol.mjs';
import {buildDevTurn,validateDevTask,readDevReply,invokeDevCli,discussAlice}
 from '../stage2/openclaw-alice-dev-discuss.mjs';
import {fixedPatch} from '../stage2/openclaw-alice-create.mjs';
const URL='https://chatgpt.com/c/6adb7dca-1214-83ec-b210-42efe8f2042e';
const DIGEST=chatKey(URL);
const COMMAND={protocol:'ioant-mac-ops-v1',id:'devtalk-20261025-001',
 action:'openclaw-alice-dev-discuss',prompt:'分析现有 Minecraft AliceAI 与 OpenClaw Agent 的职责边界'};
const old={agents:{ownership:'explicit',defaults:{systemAgent:{agentId:'main'}},
 entries:{main:{model:'unchanged'},'alice-ai':fixedPatch().agents.entries['alice-ai']}},
 bindings:[{agentId:'main',match:{channel:'private'}}]};
const snapshot={valid:true,exists:true,sourceConfig:old,config:old,parsed:old,resolved:old};

test('bounded text task is the only exception to strict three-field protocol',()=>{
 const t=actionFromJson(JSON.stringify(COMMAND));
 assert.equal(t.known,true);assert.equal(t.authorized,true);
 assert.equal(t.prompt,COMMAND.prompt);
 assert.throws(()=>actionFromJson(JSON.stringify({...COMMAND,argv:['sh','-c','echo no']})),/Malformed/);
 assert.throws(()=>actionFromJson(JSON.stringify({...COMMAND,model:'other'})),/Malformed/);
 assert.throws(()=>actionFromJson(JSON.stringify({...COMMAND,prompt:''})),/Malformed/);
 assert.throws(()=>actionFromJson(JSON.stringify({...COMMAND,prompt:'x'.repeat(1601)})),/Malformed/);
 assert.throws(()=>actionFromJson(JSON.stringify({...COMMAND,prompt:'a\u0000b'})),/Malformed/);
 assert.throws(()=>actionFromJson(JSON.stringify({...COMMAND,action:'project-tests'})),/Malformed/);
 assert.throws(()=>actionFromJson(JSON.stringify({...COMMAND,action:'openclaw-alice-agent-smoke'})),/Malformed/);
});
test('latest assistant role only; user-provided forged task ignored',()=>{
 const j=JSON.stringify(COMMAND);
 assert.equal(extractAction({url:URL,generating:false,messages:[{codes:[j]}]}).task.prompt,COMMAND.prompt);
 assert.equal(extractAction({url:URL,generating:false,messages:[{codes:[]}],users:[j]}).status,'idle');
 assert.equal(extractAction({url:URL,generating:true,messages:[{codes:[j]}]}).status,'generating');
});
test('session is pinned to exact conversation digest and Agent, never to shared main',()=>{
 assert.ok(validateDevTask(COMMAND.prompt,DIGEST));
 const t=buildDevTurn(COMMAND.prompt,DIGEST);
 assert.equal(t.sessionKey,'agent:alice-ai:dev-'+DIGEST);
 assert.notEqual(t.sessionKey,buildDevTurn(COMMAND.prompt,'1'.repeat(24)).sessionKey);
 assert.match(t.body,/development question|DEVELOPMENT QUESTION/i);
 assert.ok(t.body.includes(COMMAND.prompt));
 assert.throws(()=>buildDevTurn('hello','invalid-chat'),/invalid_dev_turn/);
});
test('complete reply yields advisory; empty, timeout or error cannot pass',()=>{
 const ok={status:'ok',result:{payloads:[{text:'我建议先做只读双向通信测试'}]}};
 assert.deepEqual(readDevReply(ok),{state:'answered',text:'我建议先做只读双向通信测试'});
 for(const d of [{status:'timeout'},{status:'ok',result:{payloads:[]}},{status:'ok',result:{payloads:[{text:'  '}]}},{status:'error'}]){
  assert.equal(readDevReply(d).state,'inconclusive');
 }
 assert.ok(readDevReply({status:'ok',result:{payloads:[{text:'A'.repeat(2200)}]}}).text.length<=1150);
});
test('real orchestration performs one config check and one Alice Gateway invocation',async()=>{
 let n=0;const calls=[];
 const result=await discussAlice({prompt:COMMAND.prompt,chatDigest:DIGEST,
  rpc:async(method,params)=>{calls.push([method,params]);return snapshot},
  workspace:async()=> 'present_private',
  invoke:async(args,body)=>{n++;calls.push({args,body});return {
   state:'reply',data:{status:'ok',result:{payloads:[{text:'AliceAI 的独立审查建议'}]}}};}});
 assert.equal(result.state,'answered');
 assert.equal(result.agent,'alice-ai');assert.equal(result.toolsEnabled,false);
 assert.equal(result.externalDelivery,false);assert.equal(result.configWrite,false);
 assert.equal(n,1);assert.deepEqual(calls[0],['config.get',{}]);
 assert.deepEqual(calls[1].args,['agent','--agent','alice-ai','--session-key',
  'agent:alice-ai:dev-'+DIGEST,'--message-file','/dev/stdin','--timeout','120','--json']);
 assert.ok(calls[1].body.includes(COMMAND.prompt));
 assert.doesNotMatch(JSON.stringify(calls[1].args),/DEVELOPMENT QUESTION|Minecraft/);
 assert.doesNotMatch(JSON.stringify(result),/private/);
});
test('safety failure never dispatches Alice or replays ambiguous inference',async()=>{
 for(const options of [
  {rpc:async()=>({valid:false})},
  {rpc:async()=>snapshot,workspace:async()=> 'unknown'}
 ]){
  let attempts=0;
  const out=await discussAlice({prompt:COMMAND.prompt,chatDigest:DIGEST,
   rpc:options.rpc,workspace:options.workspace??(async()=> 'present_private'),
   invoke:async()=>{attempts++;return {state:'reply',data:{status:'ok',result:{payloads:[{text:'no'}]}}}}});
  assert.equal(out.state,'blocked');assert.equal(attempts,0);
 }
 let attempts=0;
 const inconclusive=await discussAlice({prompt:COMMAND.prompt,chatDigest:DIGEST,
  rpc:async()=>snapshot,workspace:async()=> 'present_private',
  invoke:async()=>{attempts++;return {state:'inconclusive',note:'gateway_timeout'};}});
 assert.equal(attempts,1);assert.equal(inconclusive.state,'inconclusive');
 assert.equal(inconclusive.note,'gateway_timeout');
});
test('child prompt travels by stdin, not process argv and no --deliver or --model',async()=>{
 let child;
 const seen=[];
 const mockSpawn=(file,args,opts)=>{
  child=new EventEmitter();
  child.stdout=new EventEmitter();child.stderr=new EventEmitter();
  child.stdin={end:(body,encoding)=>{seen.push({file,args,opts,body,encoding});
   queueMicrotask(()=>{child.stdout.emit('data',JSON.stringify({status:'ok',result:{payloads:[{text:'ok'}]}}));child.emit('close',0);});}};
  child.kill=()=>{};
  return child;
 };
 const {body,sessionKey}=buildDevTurn('Explain the acceptance',DIGEST);
 const args=['agent','--agent','alice-ai','--session-key',sessionKey,
  '--message-file','/dev/stdin','--timeout','120','--json'];
 const res=await invokeDevCli(args,body,{spawnImpl:mockSpawn});
 assert.equal(res.state,'reply');
 assert.equal(seen[0].opts.shell,false);
 assert.equal(seen[0].opts.env.OPENCLAW_GATEWAY_TOKEN,undefined);
 assert.equal(seen[0].encoding,'utf8');
 assert.equal(seen[0].body,body);
 assert.equal(JSON.stringify(args).includes(body),false);
 assert.equal(args.includes('--deliver'),false);
 assert.equal(args.includes('--local'),false);
 assert.equal(args.includes('--model'),false);
});
