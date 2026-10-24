import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {compatibleRoster,fixedPatch,verifyCreated,createAlice,schemaDryRun}
 from '../stage2/openclaw-alice-create.mjs';
import {actionFromJson} from '../stage2/protocol.mjs';
import {runAction} from '../stage2/runner.mjs';

const ID='alice-ai';
const TARGET='/Volumes/LunaDrive/DeveloperCache/openclaw-agents/alice-ai';
const HASH='W/"revision-private-2026:abcdef1234567"';
const MAIN={name:'Main',workspace:'/PRIVATE_MAIN_PATH',model:'other/model',
 tools:{profile:'full'},identity:{secret:'PRIVATE_TOKEN'}};
const MAIN_BINDINGS=[{agentId:'main',match:{channel:'private-channel'}}];
const src={
 agents:{entries:{main:MAIN}},
 bindings:MAIN_BINDINGS,
 gateway:{auth:{token:'VERY_PRIVATE'}}
};
const before={valid:true,exists:true,hash:HASH,sourceConfig:structuredClone(src),
 config:structuredClone(src),parsed:{},resolved:structuredClone(src)};
const afterRoot={...structuredClone(src),
 agents:{ownership:'explicit',defaults:{systemAgent:{agentId:'main'}},
  entries:{main:MAIN,[ID]:fixedPatch().agents.entries[ID]}}};
const after={valid:true,exists:true,sourceConfig:structuredClone(afterRoot),
 config:structuredClone(afterRoot),resolved:structuredClone(afterRoot)};
const READY={config:'regular_private',ollama:'reachable',provider:'target',
 agents:'absent',installed:['gemma4:26b-a4b','gpt-oss:20b']};
const SPACE={status:'missing_target_safe_parent'};
function harness(overrides={}){
 const calls=[],mutations=[];
 const rpc=async(name,params)=>{
  calls.push({name,params});
  if(name==='config.get')return calls.filter(x=>x.name==='config.get').length===1?before:after;
  if(name==='config.patch')return {ok:true,changedPaths:['agents.entries.alice-ai','agents.ownership']};
  throw Error('unexpected RPC '+name);
 };
 return {calls,mutations,options:{
  preflight:async()=>READY,rpc,workspaceCheck:async()=>SPACE,
  dryRun:async patch=>{mutations.push('validated');assert.deepEqual(Object.keys(patch),['agents']);return true},
  backup:async()=>{mutations.push('backup');return true},
  createDir:async()=>{mutations.push('workspace');return true},...overrides}};
}
test('Alice creation is known but not automatically authorized without a separate launcher flag',async()=>{
 const task={protocol:'ioant-mac-ops-v1',id:'openclaw-alice-create-001',action:'openclaw-alice-create'};
 const t=actionFromJson(JSON.stringify(task));
 assert.equal(t.known,true);
 assert.equal(t.authorized,false);
 assert.throws(()=>actionFromJson(JSON.stringify({...task,argv:['bash','-c','sh'] })),/Malformed/);
 assert.equal((await runAction(t.action,'/fixed',{enableOpenClawAgentCreate:false})).status,'approval_required');
 const source=readFileSync(resolve(import.meta.dirname,'..','stage2/chatgpt-loop.mjs'),'utf8');
 assert.match(source,/--enable-openclaw-agent-create/);
 assert.match(source,/task\.action==='openclaw-alice-create' && opts\.enableOpenClawAgentCreate/);
});
test('agent patch pins main system owner and no channel bindings or default-model writes',()=>{
 const patch=fixedPatch();
 assert.deepEqual(Object.keys(patch),['agents']);
 assert.equal(patch.agents.ownership,'explicit');
 assert.equal(patch.agents.defaults.systemAgent.agentId,'main');
 assert.deepEqual(Object.keys(patch.agents.entries),[ID]);
 assert.equal(patch.agents.entries[ID].workspace,TARGET);
 assert.equal(patch.agents.entries[ID].model,'ollama/gemma4:26b-a4b');
 assert.deepEqual(patch.agents.entries[ID].modelPolicy.allow,
  ['ollama/gemma4:26b-a4b','ollama/gpt-oss:20b']);
 assert.equal(patch.agents.entries[ID].tools.profile,'minimal');
 assert.deepEqual(patch.agents.entries[ID].tools.deny,['*']);
 assert.equal(patch.agents.entries[ID].tools.exec.mode,'deny');
 assert.equal(patch.agents.entries[ID].tools.elevated.enabled,false);
 assert.equal(patch.agents.entries[ID].tools.codeMode,false);
 assert.deepEqual(patch.agents.entries[ID].tools.agentToAgent.send,[]);
 assert.deepEqual(patch.agents.entries[ID].subagents.allowAgents,[]);
 assert.equal(patch.models,undefined);
 assert.equal(patch.bindings,undefined);
});
test('current real layout: source/config/resolved explicit main; parsed empty; opaque hash accepted',()=>{
 const r=compatibleRoster(before);
 assert.equal(r.hash,HASH);
 assert.deepEqual(r.main,MAIN);
 assert.deepEqual(r.bindings,MAIN_BINDINGS);
 assert.doesNotMatch(JSON.stringify({ok:!!r}),/PRIVATE/);
 assert.equal(verifyCreated(r,after),true);
});
test('preserving all main fields and all channel bindings is required on independent readback',()=>{
 const r=compatibleRoster(before);
 assert.equal(verifyCreated(r,{...after,sourceConfig:{...afterRoot,
   agents:{...afterRoot.agents,entries:{...afterRoot.agents.entries,
    main:{...MAIN,model:'ollama/gemma4:26b-a4b'}}}}}),false);
 assert.equal(verifyCreated(r,{...after,sourceConfig:{...afterRoot,bindings:[]}}),false);
 assert.equal(verifyCreated(r,{...after,sourceConfig:{...afterRoot,
   agents:{...afterRoot.agents,entries:{...afterRoot.agents.entries,
    [ID]:{...fixedPatch().agents.entries[ID],tools:{profile:'full'}}}}}}),false);
});
test('nontrivial old agent roster, owner, system Agent and Alice collision stop before effects',async()=>{
 for(const value of [
  {...before,sourceConfig:{...src,agents:{entries:{...src.agents.entries,other:{}}}}},
  {...before,sourceConfig:{...src,agents:{ownership:'explicit',entries:{main:MAIN}}}},
  {...before,sourceConfig:{...src,agents:{defaults:{systemAgent:{agentId:'main'}},entries:{main:MAIN}}}},
  {...before,resolved:{...src,agents:{entries:{main:MAIN,[ID]:{}}}}},
  {...before,config:{...src,bindings:[...MAIN_BINDINGS,{agentId:ID}]}},
  {...before,hash:'bad whitespace hash'}
 ]){
  const r=compatibleRoster(value);
  assert.equal(r,null);
 }
});
test('one write with baseHash, after private backup and fixed workspace; no retries',async()=>{
 const h=harness();
 const result=await createAlice(h.options);
 assert.equal(result.state,'applied');
 assert.equal(result.backup,true);
 assert.equal(result.workspace,true);
 assert.equal(result.mainPreserved,true);
 assert.equal(result.runtimeAcknowledged,true);
 assert.equal(result.agent,ID);
 assert.deepEqual(h.mutations,['validated','backup','workspace']);
 assert.deepEqual(h.calls.map(x=>x.name),['config.get','config.patch','config.get']);
 const patch=h.calls[1].params;
 assert.deepEqual(Object.keys(patch),['raw','baseHash','note']);
 assert.equal(patch.baseHash,HASH);
 assert.deepEqual(JSON.parse(patch.raw),fixedPatch());
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE_TOKEN|PRIVATE_MAIN_PATH/);
});
test('blocked preconditions cannot backup, make workspaces or write configuration',async()=>{
 for(const pre of [{...READY,provider:'absent'},{...READY,agents:'present'},
   {...READY,installed:['gpt-oss:20b']} ]){
  const h=harness({preflight:async()=>pre});
  const r=await createAlice(h.options);
  assert.equal(r.state,'blocked');
  assert.equal(h.calls.length,0);
  assert.deepEqual(h.mutations,[]);
 }
 const h=harness({workspaceCheck:async()=>({status:'target_exists'})});
 assert.equal((await createAlice(h.options)).state,'blocked');
 assert.equal(h.calls.length,0);
 assert.deepEqual(h.mutations,[]);
});
test('schema rejection makes zero persisted modifications and zero Gateway writes',async()=>{
 const h=harness({dryRun:async()=>false});
 const r=await createAlice(h.options);
 assert.equal(r.state,'blocked');
 assert.equal(r.note,'schema_dryrun_failed');
 assert.deepEqual(h.mutations,[]);
 assert.deepEqual(h.calls.map(x=>x.name),['config.get']);
});
test('lost RPC receipt is inconclusive: exact one attempt, no retry or sensitive stdout',async()=>{
 const h=harness({rpc:async(method)=>{
  h.calls.push({name:method});
  if(method==='config.get')return before;
  const err=Error('Bearer SECRET_TOKEN');
  err.stderr='config.patch invalid params token PRIVATE_PASSWORD';
  throw err;
 }});
 const result=await createAlice(h.options);
 assert.equal(result.state,'inconclusive');
 assert.equal(result.note,'patch_rpc_invalid_params');
 assert.equal(result.backup,true);
 assert.equal(result.workspace,true);
 assert.equal(h.calls.filter(x=>x.name==='config.patch').length,1);
 assert.doesNotMatch(JSON.stringify(result),/SECRET_TOKEN|PRIVATE_PASSWORD/);
});
test('post-write config.get unavailable never claims applied and never retries',async()=>{
 const h=harness({rpc:async(method,params)=>{
  h.calls.push({name:method,params});
  if(method==='config.get'&&h.calls.filter(x=>x.name==='config.get').length===1)return before;
  if(method==='config.patch')return {ok:true,changedPaths:['agents.entries.alice-ai']};
  throw Error('Gateway restart may be in progress');
 }});
 const r=await createAlice(h.options);
 assert.equal(r.state,'inconclusive');
 assert.equal(r.note,'readback_unavailable');
 assert.equal(h.calls.filter(x=>x.name==='config.patch').length,1);
});
test('dry-run invokes only the pinned CLI subcommand with no configuration write',async()=>{
 const events=[];
 const fakeSpawn=(binary,args,options)=>{
  events.push({binary,args,options});
  const on={};const stdin={on(){},end(payload){events.push({payload});}};
  return {on(k,fn){on[k]=fn; if(k==='close')queueMicrotask(()=>fn(0));},stdin,kill(){}};
 };
 assert.equal(await schemaDryRun(fixedPatch(),{spawner:fakeSpawn,bin:'/fixed/openclaw'}),true);
 assert.deepEqual(events[0].args,['config','patch','--stdin','--dry-run']);
 assert.equal(events[0].options.shell,false);
 assert.equal(events[0].options.env.OPENCLAW_GATEWAY_TOKEN,undefined);
 assert.deepEqual(JSON.parse(events[1].payload),fixedPatch());
});
