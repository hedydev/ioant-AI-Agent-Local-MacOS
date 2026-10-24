import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProvider,parseAgents,planFromEvidence,probeOpenClaw} from '../stage2/openclaw-config-preflight.mjs';
import {actionFromJson} from '../stage2/protocol.mjs';
import {actionPlan} from '../stage2/runner.mjs';

test('fixed preflight action is read-only and accepts no page supplied host/path/argv',()=>{
  const t=actionFromJson(JSON.stringify({protocol:'ioant-mac-ops-v1',id:'openclaw-preflight-test-001',action:'openclaw-config-preflight'}));
  assert.equal(t.authorized,true);
  const plan=actionPlan(t.action,'/repo');
  assert.equal(plan.bin,process.execPath);
  assert.deepEqual(plan.args,['stage2/openclaw-config-preflight.mjs']);
  assert.throws(()=>actionFromJson(JSON.stringify({
    protocol:'ioant-mac-ops-v1',id:t.id,action:t.action,model:'ollama/gemma4:26b-a4b'
  })),/Malformed/);
  assert.equal(actionFromJson(JSON.stringify({protocol:'ioant-mac-ops-v1',id:'aaa-0001',action:'openclaw-config-apply'})).authorized,false);
});

test('provider status cannot claim the expected endpoint from wrong native API or JSON text',()=>{
  assert.equal(parseProvider(JSON.stringify({api:'ollama',baseUrl:'http://127.0.0.1:11435',apiKey:'private-token'})),'target');
  assert.equal(parseProvider(JSON.stringify({api:'openai-completions',baseUrl:'http://127.0.0.1:11435/v1'})),'different');
  assert.equal(parseProvider(JSON.stringify({api:'ollama',baseUrl:'http://other-host:11435'})),'different');
  assert.equal(parseProvider('private-token'),'unknown');
  assert.equal(parseAgents(JSON.stringify([{id:'main'},{id:'alice-ai'}])),'present');
  assert.equal(parseAgents(JSON.stringify({agents:[{id:'main'}]})),'absent');
  assert.equal(parseAgents('{"sessions":[{"id":"alice-ai"}]}'),'unknown');
});

test('preflight returns only safelisted model identifiers and booleans, never CLI secrets',async()=>{
 const seen=[];
 const result=await probeOpenClaw({
  home:'/tmp/test-home',
  configFileStatus:async()=> 'regular_private',
  fetchImpl:async url=>{
   assert.equal(url,'http://127.0.0.1:11435/api/tags');
   return {models:[{name:'gemma4:26b-a4b'},{name:'gpt-oss:20b'},{name:'private-token-for-provider'}]};
  },
  execImpl:async(bin,args)=>{
   seen.push({bin,args});
   return args[0]==='config'?JSON.stringify({api:'ollama',baseUrl:'http://127.0.0.1:11435',apiKey:'very-private'}):
   JSON.stringify([{id:'main',token:'very-private',name:'private-nickname'}]);
  }
 });
 assert.equal(result.audit,'IOANT_OPENCLAW_CONFIG_PREFLIGHT');
 assert.equal(result.schemaVersion,1);
 assert.equal(result.readOnly,true);
 assert.equal(result.next,'eligible_for_separate_write_approval');
 assert.deepEqual(result.installed,['gemma4:26b-a4b','gpt-oss:20b']);
 assert.equal(result.agents,'absent');
 assert.equal(seen.length,2);
 assert.equal(JSON.stringify(result).includes('very-private'),false);
 assert.equal(JSON.stringify(result).includes('private-nickname'),false);
 assert.equal(JSON.stringify(result).includes('private-token-for-provider'),false);
});

test('unsafe/missing config never runs OpenClaw CLI or authorizes write',async()=>{
 for(const config of ['missing','unsafe','permission_review','unavailable']){
  let calls=0;
  const result=await probeOpenClaw({configFileStatus:async()=>config,
   execImpl:async()=>{calls++;throw Error('must not be invoked')},
   fetchImpl:async()=>({models:[]})});
  assert.equal(result.config,config);
  assert.equal(result.next,'manual_review');
  assert.equal(calls,0);
 }
});

test('pre-existing target agent or different provider mandates manual review',()=>{
 const common={config:'regular_private',ollama:'reachable',provider:'target',agents:'absent'};
 assert.equal(planFromEvidence(common),'eligible_for_separate_write_approval');
 assert.equal(planFromEvidence({...common,agents:'present'}),'manual_review');
 assert.equal(planFromEvidence({...common,provider:'different'}),'manual_review');
 assert.equal(planFromEvidence({...common,agents:'unknown'}),'manual_review');
});
