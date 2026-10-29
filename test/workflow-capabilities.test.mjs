import test from 'node:test';
import assert from 'node:assert/strict';
import {readPrivateJson,summarizeCapabilities,inspectWorkflowCapabilities}
 from '../stage2/workflow-capabilities.mjs';

const binding={kind:'local',chatUrl:'https://chatgpt.com/c/test-conversation-123456'};
const ready={binding,service:{state:'running',pid:123},terminal:{state:'enabled'},
 window:{state:'disabled'},state:{feedbackPending:null},
 config:{agents:{entries:{'openclaw-dev':{tools:{deny:['*']}}}}}};

test('reports terminal authority separately from model and unproven desktop delivery',()=>{
 const r=summarizeCapabilities(ready);
 assert.equal(r.worker.service,'running');
 assert.equal(r.worker.pendingFeedback,'none');
 assert.equal(r.worker.chatTransport,'not_probed');
 assert.equal(r.capabilities.terminal.authorization,'authorized');
 assert.equal(r.capabilities.terminal.modelRequired,false);
 assert.equal(r.capabilities.windowText.authorization,'not_authorized');
 assert.equal(r.capabilities.nativeComputer.backgroundChatDelivery,'not_verified');
 assert.equal(r.capabilities.agentDiscussion.tools,'deny_all');
 assert.equal(r.capabilities.agentDiscussion.modelRequired,true);
 assert.equal(r.inferencePolicy.allModelCallsDisabled,false);
});

test('unknown and unsafe evidence never becomes an affirmative grant or no-pending proof',()=>{
 const r=summarizeCapabilities({...ready,binding:null,terminal:{state:'enabled'}});
 assert.equal(r.state,'inconclusive');
 assert.equal(r.worker.service,'unverified');
 assert.equal(r.capabilities.terminal.authorization,'unverified');
 assert.equal(r.worker.pendingFeedback,'unverified');
 assert.equal(summarizeCapabilities({...ready,state:{}}).worker.pendingFeedback,'unverified');
 assert.equal(summarizeCapabilities({...ready,state:{feedbackPending:{}}}).worker.pendingFeedback,'present');
});

test('does not serialize credentials, chat text, paths, opaque refs or untrusted exceptions',async()=>{
 const secret='SENSITIVE_SHOULD_NEVER_APPEAR';
 const r=await inspectWorkflowCapabilities({platform:'darwin',
  loadBinding:async()=>({...binding,secret}),loadService:async()=>{throw Error(secret)},
  terminal:async()=>({state:'enabled',secret}),window:async()=>{throw Error(secret)},
  loadState:async()=>({feedbackPending:{text:secret},secret}),
  loadConfig:async()=>({apiKey:secret,agents:{entries:{'openclaw-dev':{tools:{deny:['*']},secret}}}})});
 assert.equal(r.worker.service,'unverified');
 assert.equal(r.worker.pendingFeedback,'present');
 assert.equal(JSON.stringify(r).includes(secret),false);
 assert.equal(JSON.stringify(r).includes('chatgpt.com'),false);
});

test('unrecognized binding and non-macOS perform no follow-up probes',async()=>{
 let calls=0;
 const probe=async()=>{calls++;throw Error('must not run')};
 for(const options of [{platform:'linux',loadBinding:probe},
  {platform:'darwin',loadBinding:async()=>null}]){
  const r=await inspectWorkflowCapabilities({...options,loadService:probe,
   terminal:probe,window:probe,loadState:probe,loadConfig:probe});
  assert.equal(r.state,'inconclusive');
 }
 assert.equal(calls,0);
});

test('private document checks reject links, foreign owners, public mode and oversized data',async()=>{
 const good={isFile:()=>true,isSymbolicLink:()=>false,size:20,
  mode:0o600,uid:process.getuid?.()};
 const path='/private/document.json';
 const read=async()=>'{"feedbackPending":null}';
 const canonical=async()=>path;
 assert.deepEqual(await readPrivateJson(path,{stat:async()=>good,read,canonical}),{feedbackPending:null});
 for(const change of [{isSymbolicLink:()=>true},{uid:-1},{mode:0o644},{size:131073}]){
  await assert.rejects(readPrivateJson(path,{stat:async()=>({...good,...change}),read,canonical}));
 }
 await assert.rejects(readPrivateJson(path,{stat:async()=>good,read,canonical:async()=>'/other'}));
});
