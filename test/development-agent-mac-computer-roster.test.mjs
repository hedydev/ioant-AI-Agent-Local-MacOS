import test from 'node:test';
import assert from 'node:assert/strict';
import {agentPolicy,verifyBoundAgentConfig} from '../stage2/development-agent-route.mjs';

function snapshot({computer=true}={}){
 const entries={
  main:{name:'Main'},
  'alice-ai':agentPolicy('alice-ai'),
  'openclaw-dev':agentPolicy('openclaw-dev')
 };
 if(computer)entries['mac-computer']={
  name:'Mac Computer',model:'ollama/gemma4:26b-a4b',
  workspace:'/Volumes/LunaDrive/DeveloperCache/openclaw-agents/mac-computer',
  tools:{opaqueCapability:true,exec:{mode:'ask'}}
 };
 const config={agents:{ownership:'explicit',defaults:{systemAgent:{agentId:'main'}},
  entries},bindings:[]};
 return {valid:true,exists:true,sourceConfig:structuredClone(config),
  config:structuredClone(config),parsed:structuredClone(config),resolved:structuredClone(config)};
}
test('known mac-computer roster coexists with advisor agents without delegation',()=>{
 const s=snapshot();
 assert.equal(verifyBoundAgentConfig(s,'alice-ai'),true);
 assert.equal(verifyBoundAgentConfig(s,'openclaw-dev'),true);
 assert.equal(verifyBoundAgentConfig(s,'mac-computer'),false);
 const old=snapshot({computer:false});
 assert.equal(verifyBoundAgentConfig(old,'alice-ai'),true);
});
test('unknown fifth agent, changed computer policy or missing policy identity fail closed',()=>{
 const s=snapshot();
 s.sourceConfig.agents.entries['unknown-agent']={};
 assert.equal(verifyBoundAgentConfig(s,'alice-ai'),false);
 const changed=snapshot();
 changed.resolved.agents.entries['mac-computer'].tools.exec.mode='allow';
 assert.equal(verifyBoundAgentConfig(changed,'alice-ai'),false);
 const missing=snapshot();
 missing.parsed.agents.entries['mac-computer'].model='';
 assert.equal(verifyBoundAgentConfig(missing,'alice-ai'),false);
 const workspace=snapshot();
 workspace.sourceConfig.agents.entries['mac-computer'].workspace=agentPolicy('alice-ai').workspace;
 assert.equal(verifyBoundAgentConfig(workspace,'alice-ai'),false);
});
test('advisor exact tool boundary is not weakened by additional computer identity',()=>{
 const mutated=snapshot();
 mutated.config.agents.entries['alice-ai'].tools.deny=[];
 assert.equal(verifyBoundAgentConfig(mutated,'alice-ai'),false);
 const injected=snapshot();
 injected.sourceConfig.bindings.push({agentId:'openclaw-dev',channel:'external'});
 assert.equal(verifyBoundAgentConfig(injected,'openclaw-dev'),false);
 const unverified=snapshot();
 unverified.config.agents.entries['openclaw-dev'].tools.agentToAgent.send=['mac-computer'];
 assert.equal(verifyBoundAgentConfig(unverified,'alice-ai'),false);
});
test('untrusted or missing layer and missing selected advisor is rejected',()=>{
 const s=snapshot();delete s.sourceConfig;
 assert.equal(verifyBoundAgentConfig(s,'alice-ai'),false);
 const noAlice=snapshot();delete noAlice.config.agents.entries['alice-ai'];
 assert.equal(verifyBoundAgentConfig(noAlice,'alice-ai'),false);
});
