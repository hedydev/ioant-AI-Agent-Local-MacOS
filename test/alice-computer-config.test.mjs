import test from 'node:test';
import assert from 'node:assert/strict';
import {aliceComputerPatch,ALICE_COMPUTER_TOOLS} from '../scripts/configure-alice-computer-agent.mjs';
import {projectBinding} from '../integrations/chatgpt-openclaw/project-binding.mjs';
const config=()=>({agents:{defaults:{model:'ollama/local'},entries:{'alice-ai':{
 workspace:projectBinding('alice-ai').workspace,model:'ollama/gemma4:26b-a4b',skills:[],subagents:{allowAgents:[]},
 tools:{profile:'minimal',deny:['*'],codeMode:false,exec:{mode:'deny'},fs:{workspaceOnly:true},elevated:{enabled:false},agentToAgent:{send:[]}}},
 'openclaw-dev':{workspace:projectBinding().workspace,model:'ollama/gemma4:26b-a4b',tools:{allow:['computer']}},
 'local-chat':{model:'ollama/gpt-oss:20b'}}},models:{providers:{ollama:{api:'ollama',baseUrl:'http://127.0.0.1:11435'}}}});
test('Alice migration changes only its exact tool entry and never mutates the input fleet',()=>{
 const c=config(),before=structuredClone(c),p=aliceComputerPatch(c);assert.deepEqual(c,before);
 assert.deepEqual(Object.keys(p.agents.entries),['alice-ai']);assert.deepEqual(p.agents.entries['alice-ai'].tools.allow,['computer']);
 assert.equal(p.agents.entries['alice-ai'].tools.exec.mode,'deny');assert.equal(p.agents.entries['alice-ai'].tools.elevated.enabled,false);
 assert.deepEqual(p.agents.entries['alice-ai'].tools.agentToAgent.send,[]);
 p.agents.entries['alice-ai'].tools.allow.push('unexpected');assert.deepEqual(ALICE_COMPUTER_TOOLS.allow,['computer']);
});
test('unexpected privileges, delegation or policy fields require review before Alice migration',()=>{
 for(const change of [c=>c.agents.entries['alice-ai'].tools.exec.mode='allow',
  c=>c.agents.entries['alice-ai'].tools.alsoAllow=['read'],c=>c.agents.entries['alice-ai'].skills=['extra'],
  c=>c.agents.entries['alice-ai'].subagents.allowAgents=['main']]){
  const c=config();change(c);assert.throws(()=>aliceComputerPatch(c),/precondition/);
 }
});
test('cloud routing, fallback or overlapping project workspace blocks Alice migration',()=>{
 for(const change of [c=>c.models.providers.ollama.baseUrl='https://example.com',
  c=>c.agents.defaults.model={primary:'ollama/local',fallbacks:['openai/cloud']},
  c=>c.agents.entries['openclaw-dev'].workspace=projectBinding('alice-ai').workspace]){
  const c=config();change(c);assert.throws(()=>aliceComputerPatch(c),/precondition/);
 }
});
