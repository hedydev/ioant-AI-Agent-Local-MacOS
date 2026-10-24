import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {actionFromJson} from '../stage2/protocol.mjs';
import {runAction} from '../stage2/runner.mjs';
import {agentPolicy,verifyBoundAgentConfig} from '../stage2/development-agent-route.mjs';
import {devPatch,compatibleDevRoster,verifyDevCreated,createOpenClawDev,inspectDevTarget}
 from '../stage2/openclaw-dev-create.mjs';

const HASH='W/"fixed-private-revision-2026"';
const MAIN={name:'Primary Owner',model:'different/private',identity:{token:'SECRET_MAIN_ID'}};
const ALICE=agentPolicy('alice-ai');
const DEV=agentPolicy('openclaw-dev');
const bindings=[{agentId:'main',match:{channel:'private'}}];
const root=()=>({agents:{ownership:'explicit',
  defaults:{systemAgent:{agentId:'main'},model:{primary:'existing'}},
  entries:{main:structuredClone(MAIN),'alice-ai':structuredClone(ALICE)}},
  bindings:structuredClone(bindings),gateway:{auth:{token:'SECRET_GATEWAY'}},
  models:{providers:{ollama:{baseUrl:'http://127.0.0.1:11435'}}}});
const before=()=>({valid:true,exists:true,hash:HASH,
  sourceConfig:root(),config:root(),parsed:root(),resolved:root()});
const after=()=>{const b=before();
 for(const name of ['sourceConfig','config','parsed','resolved'])
  b[name].agents.entries['openclaw-dev']=structuredClone(DEV);
 return b;
};
const pre={config:'regular_private',ollama:'reachable',provider:'target',
 agents:'present',installed:['gemma4:26b-a4b','gpt-oss:20b']};
const WORKSPACE='missing_target_safe_parent';
function harness(overrides={}){
 const calls=[],side=[];
 let reads=0;
 const rpc=async(method,params)=>{
  calls.push({method,params});
  if(method==='config.get')return ++reads===1?before():after();
  if(method==='config.patch')return {ok:true,changedPaths:['agents.entries.openclaw-dev']};
  throw Error('wrong_RPC');
 };
 return {calls,side,opts:{
  preflight:async()=>pre,rpc,
  workspaceCheck:async()=>WORKSPACE,aliceWorkspace:async()=> 'present_private',
  dryRun:async patch=>{side.push('dry-run');assert.deepEqual(patch,devPatch());return true},
  backup:async()=>{side.push('backup');return true},
  createDir:async()=>{side.push('workspace');return true},
  ...overrides}};
}
test('new OpenClaw Dev creation is known, separate opt-in, and never auto authorized',async()=>{
 const task={protocol:'ioant-mac-ops-v1',id:'openclaw-dev-create-0001',action:'openclaw-dev-create'};
 const parsed=actionFromJson(JSON.stringify(task));
 assert.equal(parsed.known,true);assert.equal(parsed.authorized,false);
 assert.throws(()=>actionFromJson(JSON.stringify({...task,agentId:'main'})),/Malformed/);
 assert.throws(()=>actionFromJson(JSON.stringify({...task,model:'other'})),/Malformed/);
 assert.throws(()=>actionFromJson(JSON.stringify({...task,argv:['sh']})),/Malformed/);
 const rejected=await runAction(task.action,'/tmp',{enableOpenClawDevCreate:false});
 assert.equal(rejected.status,'approval_required');
 const repo=resolve(import.meta.dirname,'..');
 const loop=readFileSync(resolve(repo,'stage2/chatgpt-loop.mjs'),'utf8');
 assert.match(loop,/--enable-openclaw-dev-create/);
 assert.match(loop,/task\.action==='openclaw-dev-create' && opts\.enableOpenClawDevCreate/);
 assert.match(loop,/if\(state\.devAgentCreationAttempted\)/);
 assert.match(loop,/state\.devAgentCreationAttempted=\{id:task\.id,at:new Date\(\)\.toISOString\(\)\}/);
 assert.match(loop,/await atomicState\(stateFile,state\);\s*recordDiagnosticEvent\('openclaw_dev_create_claimed'/);
});
test('patch touches only fixed new Agent, preserving original roles and default',()=>{
 assert.deepEqual(Object.keys(devPatch()),['agents']);
 assert.deepEqual(Object.keys(devPatch().agents),['entries']);
 assert.deepEqual(Object.keys(devPatch().agents.entries),['openclaw-dev']);
 assert.equal(devPatch().agents.entries['openclaw-dev'].workspace,
  '/Volumes/LunaDrive/DeveloperCache/openclaw-agents/openclaw-dev');
 assert.deepEqual(DEV.tools.deny,['*']);
 assert.equal(DEV.tools.exec.mode,'deny');
 assert.deepEqual(DEV.modelPolicy.allow,['ollama/gemma4:26b-a4b','ollama/gpt-oss:20b']);
 assert.equal(devPatch().models,undefined);
 assert.equal(devPatch().bindings,undefined);
 assert.equal(devPatch().agents.defaults,undefined);
});
test('only the verified two-agent main+Alice layout permits adding OpenClaw Dev',()=>{
 const known=compatibleDevRoster(before());
 assert.ok(known);assert.equal(known.hash,HASH);
 assert.deepEqual(Object.keys(known.roots),['sourceConfig','config','parsed','resolved']);
 assert.equal(verifyBoundAgentConfig(before(),'alice-ai'),true);
 assert.equal(verifyBoundAgentConfig(after(),'openclaw-dev'),true);
 for(const edit of [
  x=>{x.sourceConfig.agents.entries.other={}},
  x=>{x.config.agents.entries['openclaw-dev']=DEV},
  x=>{x.parsed.agents.entries['alice-ai'].tools.deny=[]},
  x=>{x.resolved.agents.defaults.systemAgent.agentId='alice-ai'},
  x=>{x.hash='bad'},
  x=>{x.config.bindings.push({agentId:'alice-ai'})}
 ]){
  const x=before();edit(x);
  assert.equal(compatibleDevRoster(x),null);
 }
});
test('live readback must preserve main, Alice, model provider and channel bindings',()=>{
 const first=compatibleDevRoster(before());
 assert.equal(verifyDevCreated(first,after()),true);
 for(const edit of [
  x=>{x.sourceConfig.agents.entries.main.model='ollama/other'},
  x=>{x.config.agents.entries['alice-ai'].tools.deny=[]},
  x=>{x.resolved.agents.defaults.model={primary:'changed'}},
  x=>{x.parsed.models.providers.ollama.baseUrl='http://0.0.0.0:1234'},
  x=>{x.config.bindings=[]},
  x=>{delete x.sourceConfig.agents.entries.main}
 ]){
  const x=after();edit(x);
  assert.equal(verifyDevCreated(first,x),false);
 }
});
test('successful one-shot writes once after schema dry-run, backup and private workspace',async()=>{
 const h=harness();
 const out=await createOpenClawDev(h.opts);
 assert.equal(out.state,'applied');assert.equal(out.agent,'openclaw-dev');
 assert.equal(out.mainPreserved,true);assert.equal(out.alicePreserved,true);
 assert.equal(out.backup,true);assert.equal(out.workspace,true);
 assert.equal(out.runtimeAcknowledged,true);
 assert.deepEqual(h.side,['dry-run','backup','workspace']);
 assert.deepEqual(h.calls.map(x=>x.method),['config.get','config.patch','config.get']);
 assert.equal(h.calls[1].params.baseHash,HASH);
 assert.deepEqual(JSON.parse(h.calls[1].params.raw),devPatch());
 assert.doesNotMatch(JSON.stringify(out),/SECRET_MAIN_ID|SECRET_GATEWAY/);
});
test('preflight failure or an existing dev workspace prevents every mutation',async()=>{
 for(const p of [
  {...pre,agents:'absent'},{...pre,provider:'different'},
  {...pre,installed:['gpt-oss:20b']},{...pre,config:'unsafe'}
 ]){
  const h=harness({preflight:async()=>p});
  assert.equal((await createOpenClawDev(h.opts)).state,'blocked');
  assert.deepEqual(h.side,[]);assert.equal(h.calls.length,0);
 }
 const h=harness({workspaceCheck:async()=> 'target_exists'});
 assert.equal((await createOpenClawDev(h.opts)).state,'blocked');
 assert.equal(h.calls.length,0);
 const a=harness({aliceWorkspace:async()=> 'unavailable'});
 assert.equal((await createOpenClawDev(a.opts)).state,'blocked');
 assert.deepEqual(a.calls.map(x=>x.method),['config.get']);
 assert.deepEqual(a.side,[]);
});
test('schema dry-run rejection performs no config write or directory modification',async()=>{
 const h=harness({dryRun:async()=>false});
 const out=await createOpenClawDev(h.opts);
 assert.equal(out.state,'blocked');assert.equal(out.note,'schema_dryrun_failed');
 assert.deepEqual(h.calls.map(x=>x.method),['config.get']);assert.deepEqual(h.side,[]);
});
test('lost patch receipt is inconclusive and never retries or exposes credentials',async()=>{
 const h=harness({rpc:async(method,params)=>{
  h.calls.push({method,params});
  if(method==='config.get')return before();
  throw Error('Bearer SECRET_GATEWAY');
 }});
 const out=await createOpenClawDev(h.opts);
 assert.equal(out.state,'inconclusive');
 assert.equal(out.backup,true);assert.equal(out.workspace,true);
 assert.equal(h.calls.filter(x=>x.method==='config.patch').length,1);
 assert.doesNotMatch(JSON.stringify(out),/SECRET_GATEWAY/);
});
test('post-patch readback unavailable remains inconclusive, no second patch',async()=>{
 let reads=0;
 const h=harness({rpc:async(method,params)=>{
  h.calls.push({method,params});
  if(method==='config.get'&&++reads===1)return before();
  if(method==='config.patch')return {ok:true,changedPaths:['agents.entries.openclaw-dev']};
  throw Error('gateway restarting');
 }});
 const out=await createOpenClawDev(h.opts);
 assert.equal(out.state,'inconclusive');assert.equal(out.note,'readback_unavailable');
 assert.equal(h.calls.filter(x=>x.method==='config.patch').length,1);
});
test('preparation refuses symlinked or pre-existing target and never creates it',async()=>{
 const base='/Volumes/LunaDrive/DeveloperCache/openclaw-agents';
 const safeStat=async name=>name===base?{
  isDirectory:()=>true,isSymbolicLink:()=>false,mode:0o40700,uid:process.getuid?.()??0
 }:(()=>{const err=Error('no');err.code='ENOENT';throw err})();
 assert.equal(await inspectDevTarget({stat:safeStat,canonical:async x=>x}), 'missing_target_safe_parent');
 const existing=async()=>({isDirectory:()=>true,isSymbolicLink:()=>false,mode:0o40700,uid:process.getuid?.()??0});
 assert.equal(await inspectDevTarget({stat:existing,canonical:async x=>x}),'target_exists');
 assert.equal(await inspectDevTarget({stat:safeStat,canonical:async x=>x===base?'/other':x}),'unsafe_parent');
});
