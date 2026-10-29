import test from 'node:test';
import assert from 'node:assert/strict';
import {projectBinding,projectWorkspacePolicy} from '../integrations/chatgpt-openclaw/project-binding.mjs';
import {messageDirectAgent} from '../integrations/chatgpt-openclaw/agent.mjs';
import {computerAgentPolicy} from '../integrations/chatgpt-openclaw/computer-agent.mjs';

test('project selection is a fixed local binding, not a remote Agent selector',()=>{
 const ops=projectBinding(),alice=projectBinding('alice-ai');
 assert.equal(ops.agentId,'openclaw-dev');assert.equal(alice.agentId,'alice-ai');
 assert.notEqual(ops.workspace,alice.workspace);
 assert.throws(()=>projectBinding('mac-computer'));
 assert.throws(()=>projectBinding('../../other'));
});

test('same conversation key cannot share a session across project Agents',async()=>{
 const seen=[];
 const reply={state:'reply',data:{status:'ok',result:{payloads:[{text:'READY'}],
  meta:{agentMeta:{provider:'ollama',model:'gemma4:26b-a4b'}}}}};
 for(const binding of [projectBinding(),projectBinding('alice-ai')]){
  const result=await messageDirectAgent({conversation_key:'same_key_123',message:'READY'},
   {binding,inspect:async()=>({state:'ready',toolsEnabled:false}),invoke:async(args)=>{
    seen.push({agent:args[args.indexOf('--agent')+1],session:args[args.indexOf('--session-key')+1]});
    return reply;
   }});
  assert.equal(result.project,binding.projectKey);
 }
 assert.notEqual(seen[0].agent,seen[1].agent);
 assert.notEqual(seen[0].session,seen[1].session);
});

test('overlapping workspace or state directory is rejected without broadening tools',()=>{
 const ops=projectBinding(),alice=projectBinding('alice-ai');
 const config={agents:{entries:{[ops.agentId]:{workspace:ops.workspace},
  [alice.agentId]:{workspace:alice.workspace}}}};
 assert.equal(projectWorkspacePolicy(config,ops),true);
 config.agents.entries[alice.agentId].workspace=ops.workspace;
 assert.equal(projectWorkspacePolicy(config,ops),false);
 config.agents.entries[alice.agentId].workspace=alice.workspace;
 config.agents.entries[ops.agentId].agentDir='/same-state';
 config.agents.entries[alice.agentId].agentDir='/same-state';
 assert.equal(projectWorkspacePolicy(config,ops),false);
 assert.equal(computerAgentPolicy(config,ops),false);
});
