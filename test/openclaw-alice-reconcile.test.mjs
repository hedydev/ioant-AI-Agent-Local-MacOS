import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyLive,compareDiskSnapshots,inspectDisk,inspectWorkspace,
 summarizeReconciliation,reconcileAlice} from '../stage2/openclaw-alice-reconcile.mjs';
import {fixedPatch} from '../stage2/openclaw-alice-create.mjs';
import {actionFromJson} from '../stage2/protocol.mjs';
import {actionPlan} from '../stage2/runner.mjs';

const ID='alice-ai';
const ALICE=fixedPatch().agents.entries[ID];
const MAIN={name:'Main',model:'SECRET-PRIVATE-PROVIDER',tools:{profile:'full'}};
const BINDINGS=[{agentId:'main',match:{channel:'PRIVATE_CHANNEL'}}];
const BEFORE={agents:{entries:{main:MAIN}},models:{providers:{ollama:{apiKey:'PRIVATE_SECRET'}}},bindings:BINDINGS};
const AFTER={
 ...BEFORE,
 agents:{ownership:'explicit',defaults:{systemAgent:{agentId:'main'}},
 entries:{main:MAIN,[ID]:ALICE}}
};
const gateway={valid:true,exists:true,sourceConfig:AFTER,config:AFTER,parsed:{},resolved:{
 ...AFTER,agents:{...AFTER.agents,entries:{...AFTER.agents.entries,
  [ID]:{...ALICE,tools:{...ALICE.tools,clientDefault:'NORMALIZED_RUNTIME'}}}}}};
const LIVE=classifyLive(gateway);
const DISK=compareDiskSnapshots(BEFORE,AFTER);
function fsStat(mode=0o600,kind='file'){
 return {mode,size:160,uid:typeof process.getuid==='function'?process.getuid():0,
  isFile:()=>kind==='file',isDirectory:()=>kind==='directory',isSymbolicLink:()=>false};
}
function diskFixture(before=BEFORE,after=AFTER,opts={}){
 const backup='/Volumes/LunaDrive/DeveloperCache/openclaw-agent-backups/';
 return {
  canonical:async x=>x,
  stat:async x=>x===backup.slice(0,-1)?fsStat(0o700,'directory'):fsStat(0o600),
  list:async()=>opts.list??['openclaw-before-alice-0123456789abcdef.json'],
  read:async p=>Buffer.from(JSON.stringify(p.startsWith(backup)?before:after)),
  ...opts
 };
}

test('reconcile action is auto-allowed and strictly argumentless',()=>{
 const t={protocol:'ioant-mac-ops-v1',id:'alice-reconcile-0001',action:'openclaw-alice-reconcile'};
 assert.equal(actionFromJson(JSON.stringify(t)).authorized,true);
 assert.deepEqual(actionPlan(t.action,'/fixed').args,['stage2/openclaw-alice-reconcile.mjs']);
 assert.throws(()=>actionFromJson(JSON.stringify({...t,agent:'evil'})),/Malformed/);
});
test('live Gateway reports source/config/parsed/resolved independently, no other agent data',()=>{
 assert.equal(LIVE.status,'observed');
 assert.equal(LIVE.roots.sourceConfig.alice.status,'present');
 assert.equal(LIVE.roots.sourceConfig.alice.policyExact,'yes');
 assert.equal(LIVE.roots.parsed.alice.status,'missing');
 assert.equal(LIVE.roots.resolved.alice.policyExact,'no');
 assert.equal(LIVE.roots.config.alice.denyAll,'yes');
 assert.doesNotMatch(JSON.stringify(LIVE),/SECRET|PRIVATE|NORMALIZED_RUNTIME/);
});
test('offline before/after comparison detects unchanged main, defaults, routes and provider',()=>{
 assert.equal(DISK.status,'compared');
 for(const k of ['mainPreserved','bindingsPreserved','modelDefaultsPreserved','modelProvidersPreserved','systemMain','alicePersisted'])
  assert.equal(DISK[k],'yes');
 assert.equal(DISK.otherAgentsIntroduced,'no');
 assert.doesNotMatch(JSON.stringify(DISK),/SECRET|PRIVATE/);
});
test('main, provider, channel or model changes are never mislabeled preserved',()=>{
 assert.equal(compareDiskSnapshots(BEFORE,{...AFTER,
  agents:{...AFTER.agents,entries:{...AFTER.agents.entries,main:{name:'changed'}}}}).mainPreserved,'no');
 assert.equal(compareDiskSnapshots(BEFORE,{...AFTER,bindings:[]}).bindingsPreserved,'no');
 assert.equal(compareDiskSnapshots(BEFORE,{...AFTER,models:{providers:{}}}).modelProvidersPreserved,'no');
 const modelDefaults={...BEFORE,agents:{...BEFORE.agents,defaults:{model:{primary:'private'}}}};
 assert.equal(compareDiskSnapshots(modelDefaults,AFTER).modelDefaultsPreserved,'no');
});
test('no source main or missing persisted main never qualifies as preserved',()=>{
 const without={...BEFORE,agents:{entries:{}}};
 assert.equal(compareDiskSnapshots(without,AFTER).mainPreserved,'no');
 assert.equal(compareDiskSnapshots(BEFORE,{...AFTER,agents:{...AFTER.agents,
  entries:{[ID]:ALICE}}}).mainPreserved,'no');
});
test('private known preimage and live authored config are compared in memory',async()=>{
 const d=await inspectDisk(diskFixture());
 assert.equal(d.status,'compared');
 assert.equal(d.mainPreserved,'yes');
 assert.equal(d.alicePersisted,'yes');
});
test('multiple backups, inaccessible bytes, or JSON5 are unknown, never auto-write',async()=>{
 assert.equal((await inspectDisk(diskFixture(BEFORE,AFTER,{list:async()=>[]}))).status,'backup_missing');
 assert.equal((await inspectDisk(diskFixture(BEFORE,AFTER,{list:async()=>[
  'openclaw-before-alice-0123456789abcdef.json','openclaw-before-alice-fedcba9876543210.json']}))).status,'backup_ambiguous');
 assert.equal((await inspectDisk(diskFixture(BEFORE,AFTER,{read:async()=>Buffer.from('{bareKey:1}')}))).status,'json5_or_non_json');
 assert.equal((await inspectDisk(diskFixture(BEFORE,AFTER,{canonical:async()=>'/wrong/symlink'}))).status,'backup_dir_unsafe');
 assert.equal((await inspectDisk(diskFixture(BEFORE,AFTER,{stat:async()=>fsStat(0o644)}))).status,'backup_dir_unsafe');
});
test('workspaces require private directory and 0600 instruction file',async()=>{
 const path='/Volumes/LunaDrive/DeveloperCache/openclaw-agents/alice-ai';
 const r=await inspectWorkspace({canonical:async x=>x,
  stat:async x=>x===path?fsStat(0o700,'directory'):fsStat(0o600)});
 assert.equal(r,'present_private');
 const fail=await inspectWorkspace({canonical:async()=>'/other/location',stat:async()=>fsStat(0o700,'directory')});
 assert.equal(fail,'unsafe_or_missing');
});
test('safe persisted source can be confirmed without requiring resolved normalization equality',()=>{
 const result=summarizeReconciliation(LIVE,DISK,'present_private');
 assert.equal(result.status,'verified_persisted');
 assert.equal(result.gatewaySourcePolicyConfirmed,'yes');
 assert.equal(result.diskPreservationConfirmed,'yes');
});
test('any incomplete backup verification or missing explicit deny policy requires manual review',()=>{
 assert.equal(summarizeReconciliation(LIVE,{status:'json5_or_non_json'},'present_private').status,'review_required');
 const altered=classifyLive({sourceConfig:{...AFTER,agents:{...AFTER.agents,
  entries:{...AFTER.agents.entries,[ID]:{...ALICE,tools:{profile:'full'}}}}},
  config:AFTER,parsed:{},resolved:AFTER,valid:true});
 assert.equal(summarizeReconciliation(altered,DISK,'present_private').status,'review_required');
});
test('reconcile uses one read-only Gateway RPC and returns only bounded flags',async()=>{
 const seen=[];
 const result=await reconcileAlice({call:async(m,p)=>{seen.push([m,p]);return gateway},
  disk:async()=>DISK,workspace:async()=> 'present_private'});
 assert.deepEqual(seen,[['config.get',{}]]);
 assert.equal(result.readOnly,true);
 assert.equal(result.status,'verified_persisted');
 assert.doesNotMatch(JSON.stringify(result),/SECRET|PRIVATE|token|apiKey/);
});
test('RPC failure or unexpected envelope cannot be labeled persisted',async()=>{
 const err=await reconcileAlice({call:async()=>{throw Error('PRIVATE_SECRET')},disk:async()=>DISK});
 assert.equal(err.status,'diagnostic_unavailable');
 assert.doesNotMatch(JSON.stringify(err),/PRIVATE_SECRET/);
 const r=await reconcileAlice({call:async()=>({payload:null}),disk:async()=>DISK,
   workspace:async()=> 'present_private'});
 assert.equal(r.status,'review_required');
});
