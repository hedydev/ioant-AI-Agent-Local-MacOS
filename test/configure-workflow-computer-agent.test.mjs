import test from 'node:test';
import assert from 'node:assert/strict';
import {workflowComputerPatch} from '../scripts/configure-workflow-computer-agent.mjs';
import {projectBinding} from '../integrations/chatgpt-openclaw/project-binding.mjs';
import {projectComputerPolicy} from '../integrations/chatgpt-openclaw/agent.mjs';
const cfg={agents:{defaults:{model:'ollama/local'},entries:{
 'openclaw-dev':{workspace:projectBinding().workspace,model:'ollama/gemma4:26b-a4b',
  tools:{profile:'minimal',deny:['*'],codeMode:false,exec:{mode:'deny'},
   fs:{workspaceOnly:true},elevated:{enabled:false},agentToAgent:{send:[]}}},
 'alice-ai':{workspace:projectBinding('alice-ai').workspace,model:'ollama/gemma4:26b-a4b',tools:{deny:['*']}}
 }},models:{providers:{ollama:{baseUrl:'http://127.0.0.1:11435',api:'ollama'}}}};

test('provisioning patch changes only workflow computer permission and preserves Alice',()=>{
 const before=structuredClone(cfg),p=workflowComputerPatch(cfg);
 assert.deepEqual(cfg,before);
 assert.deepEqual(Object.keys(p.agents.entries),['openclaw-dev']);
 assert.deepEqual(p.agents.entries['openclaw-dev'].tools.allow,['computer']);
 assert.equal(p.agents.entries['openclaw-dev'].tools.exec.mode,'deny');
 assert.equal(p.agents.entries['openclaw-dev'].tools.elevated.enabled,false);
 const next=structuredClone(cfg);next.agents.entries['openclaw-dev'].tools=p.agents.entries['openclaw-dev'].tools;
 assert.equal(projectComputerPolicy(next),true);
 assert.deepEqual(next.agents.entries['alice-ai'],before.agents.entries['alice-ai']);
});
test('unexpected existing policies are reviewed rather than silently widened',()=>{
 const c=structuredClone(cfg);c.agents.entries['openclaw-dev'].tools.byProvider={};
 assert.throws(()=>workflowComputerPatch(c));
 c.agents.entries['openclaw-dev'].tools=cfg.agents.entries['openclaw-dev'].tools;
 c.models.providers.ollama.baseUrl='https://other';assert.throws(()=>workflowComputerPatch(c));
});
