import test from 'node:test';
import assert from 'node:assert/strict';
import {classifySnapshot,inspectConfigRpc} from '../stage2/openclaw-config-rpc-diagnostic.mjs';
import {actionFromJson} from '../stage2/protocol.mjs';
import {actionPlan} from '../stage2/runner.mjs';

const HASH='f'.repeat(64);
test('read-only RPC structural diagnostic is fixed and never authorizes a write',()=>{
 const task=actionFromJson(JSON.stringify({protocol:'ioant-mac-ops-v1',id:'rpc-diagnostic-0001',action:'openclaw-config-rpc-diagnostic'}));
 assert.equal(task.authorized,true);
 const plan=actionPlan(task.action,'/repo');
 assert.equal(plan.bin,process.execPath);
 assert.deepEqual(plan.args,['stage2/openclaw-config-rpc-diagnostic.mjs']);
 assert.throws(()=>actionFromJson(JSON.stringify({...task,params:{raw:'secret'}})),/Malformed/);
});

test('valid Gateway payload is reduced to status flags, never config data or hash',()=>{
 const sensitive={payload:{hash:HASH,valid:true,exists:true,config:{
  gateway:{auth:{token:'TOP_SECRET_GATEWAY_TOKEN'}},
  models:{providers:{not_ollama:{apiKey:'PRIVATE_SECRET'}}}
 }}};
 const r=classifySnapshot(sensitive);
 assert.equal(r.status,'observed');
 assert.equal(r.hashKind,'hex_compatible');
 assert.equal(r.provider,'absent');
 assert.equal(r.previousGuard,'accepted');
 assert.equal(r.wrapped,true);
 assert.equal(r.sources.config,'object');
 assert.equal(r.sources.parsed,'absent');
 assert.equal(JSON.stringify(r).includes('PRIVATE_SECRET'),false);
 assert.equal(JSON.stringify(r).includes('TOP_SECRET'),false);
 assert.equal(JSON.stringify(r).includes(HASH),false);
 assert.deepEqual(Object.keys(r.sources),['config','parsed','resolved','sourceConfig']);
});

test('opaque hash is classified, not leaked, while existing Ollama is recorded present',()=>{
 const raw='opaque-rev-not-hex-!SECRET';
 const r=classifySnapshot({hash:raw,valid:true,parsed:{models:{providers:{ollama:{
   api:'ollama',apiKey:'PRIVATE_SECRET',baseUrl:'http://127.0.0.1:11435'
 }}}}});
 assert.equal(r.hashKind,'opaque_non_hex');
 assert.equal(r.previousGuard,'rejected');
 assert.equal(r.provider,'present');
 assert.equal(r.sources.parsed,'object');
 assert.equal(JSON.stringify(r).includes(raw),false);
 assert.equal(JSON.stringify(r).includes('PRIVATE_SECRET'),false);
});

test('missing snapshot and broken RPC are safe, still no content or arbitrary source keys',async()=>{
 const r=classifySnapshot({hash:HASH,valid:false,config:null});
 assert.equal(r.previousGuard,'rejected');
 assert.equal(r.provider,'unresolved');
 assert.equal(r.validFlag,'false');
 assert.equal(classifySnapshot({payload:'malformed'}).status,'invalid_envelope');
 const failed=await inspectConfigRpc({call:async()=>{throw Error('password=secret')}});
 assert.equal(failed.status,'rpc_unavailable');
 assert.equal(JSON.stringify(failed).includes('secret'),false);
});
