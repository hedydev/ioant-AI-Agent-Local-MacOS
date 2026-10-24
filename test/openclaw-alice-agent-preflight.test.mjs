import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyAgentSnapshot,inspectWorkspace,preflightAlice}
 from '../stage2/openclaw-alice-agent-preflight.mjs';
import {actionFromJson} from '../stage2/protocol.mjs';
import {actionPlan} from '../stage2/runner.mjs';

const READY={config:'regular_private',ollama:'reachable',provider:'target',agents:'absent',
 installed:['gemma4:26b-a4b','gpt-oss:20b']};
const roots={agents:{entries:{main:{model:'PRIVATE',tools:{apiKey:'SECRET'}}}},
 bindings:[{agentId:'main',destination:'SECRET'}]};
const SNAP={valid:true,exists:true,sourceConfig:roots,config:roots,parsed:roots,resolved:roots};
const WORK={status:'missing_target_safe_parent'};

test('read-only preflight task uses exact command with no untrusted arguments',()=>{
 const cmd={protocol:'ioant-mac-ops-v1',id:'alice-preflight-0001',action:'openclaw-alice-agent-preflight'};
 assert.equal(actionFromJson(JSON.stringify(cmd)).authorized,true);
 assert.deepEqual(actionPlan(cmd.action,'/fixed').args,['stage2/openclaw-alice-agent-preflight.mjs']);
 assert.throws(()=>actionFromJson(JSON.stringify({...cmd,workspace:'/private/SECRET'})),/Malformed/);
});

test('v2026.10.6 agent entries are map: classify only structural flags and strip all names/credentials',()=>{
 const r=classifyAgentSnapshot({payload:SNAP});
 assert.equal(r.status,'observed');
 assert.equal(r.roots.sourceConfig.mainExplicit,true);
 assert.equal(r.roots.sourceConfig.aliceExplicit,false);
 assert.equal(r.roots.sourceConfig.ownerMode,'unset');
 assert.equal(r.roots.sourceConfig.entryCount,1);
 assert.doesNotMatch(JSON.stringify(r),/PRIVATE|SECRET|destination/);
});

test('implicit main and other agents are not silently treated as identical layouts',()=>{
 const a=classifyAgentSnapshot({sourceConfig:{},config:{},parsed:{},resolved:{}});
 assert.equal(a.roots.sourceConfig.entryCount,0);
 const b=classifyAgentSnapshot({sourceConfig:{agents:{ownership:'explicit',
  entries:{main:{},research:{secret:'PRIVATE'}}}}});
 assert.equal(b.roots.sourceConfig.ownerMode,'explicit');
 assert.equal(b.roots.sourceConfig.otherCount,1);
 assert.doesNotMatch(JSON.stringify(b),/research|PRIVATE/);
});

test('existing Alice, Alice bindings and unsafe roster block creation planning',async()=>{
 for(const change of [
  {sourceConfig:{agents:{entries:{main:{},'alice-ai':{}}}}},
  {config:{bindings:[{agentId:'alice-ai',token:'PRIVATE'}]}},
  {parsed:{agents:{entries:[]}}}
 ]){
  const r=await preflightAlice({preflight:async()=>READY,rpc:async()=>({...SNAP,...change}),
   workspace:async()=>WORK});
  assert.equal(r.status,'observed');
  assert.equal(r.safeToPlan,false);
  assert.doesNotMatch(JSON.stringify(r),/PRIVATE/);
 }
});

test('safe explicit-main roster and missing child workspace are eligible only for planning',async()=>{
 const calls=[];
 const r=await preflightAlice({preflight:async()=>READY,rpc:async(m,p)=>{
  calls.push([m,p]);return SNAP;
 },workspace:async()=>WORK});
 assert.deepEqual(calls,[['config.get',{}]]);
 assert.equal(r.status,'observed');
 assert.equal(r.safeToPlan,true);
 assert.equal(r.agentLayout,'main_authored_in_some_roots');
 assert.equal(r.readOnly,true);
});

test('missing mounted cache, unsafe folders and existing target are fail-closed',async()=>{
 const original={getuid:typeof process.getuid==='function'?process.getuid():0};
 const good={isDirectory:()=>true,isSymbolicLink:()=>false,mode:0o700,uid:original.getuid};
 const testFs={canonical:async p=>p,
   stat:async p=>{
    if(p==='/Volumes/LunaDrive/DeveloperCache')return good;
    const error=new Error('not found');error.code='ENOENT';throw error;
   }};
 assert.equal((await inspectWorkspace(testFs)).status,'missing_target_safe_parent');
 assert.equal((await inspectWorkspace({...testFs,canonical:async()=>{throw Error('volume absent')}})).status,'volume_or_cache_unavailable');
 assert.equal((await inspectWorkspace({...testFs,stat:async()=>({...good,mode:0o777})})).status,'unsafe_cache');
 assert.equal((await inspectWorkspace({...testFs,stat:async()=>good})).status,'target_exists');
});

test('any missing approved prerequisite or RPC failure stops before creation planning',async()=>{
 let called=0;
 for(const override of [{provider:'absent'},{ollama:'unavailable'},{agents:'present'},{installed:[]}]){
  const r=await preflightAlice({preflight:async()=>({...READY,...override}),
   rpc:async()=>{called++;throw Error('unauthorized')}});
  assert.equal(r.status,'precondition_blocked');
 }
 assert.equal(called,0);
 const r=await preflightAlice({preflight:async()=>READY,rpc:async()=>{throw Error('PRIVATE')},
  workspace:async()=>WORK});
 assert.equal(r.status,'diagnostic_unavailable');
 assert.doesNotMatch(JSON.stringify(r),/PRIVATE/);
});
