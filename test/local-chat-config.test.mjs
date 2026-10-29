import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chatPatch,CHAT,thinkingMetadataPatch,qwenChatPatch} from '../scripts/configure-local-chat-agent.mjs';
const config=()=>({agents:{entries:{main:{model:'ollama/gemma4:26b-a4b'}}},
 models:{providers:{ollama:{baseUrl:'http://127.0.0.1:11435',api:'ollama'}}}});
test('Qwen selection adds only the fixed local option and retains default and tool policy',()=>{
 const c=config();c.agents.entries['local-chat']=structuredClone(CHAT);
 const before=structuredClone(c),p=qwenChatPatch(c);
 assert.deepEqual(c,before);
 assert.deepEqual(p,{agents:{entries:{'local-chat':{modelPolicy:{allow:['ollama/gpt-oss:20b','ollama/qwen3.8:27b-mlx']}}}}});
 c.agents.entries['local-chat'].tools.deny=[];assert.throws(()=>qwenChatPatch(c),/chat_policy/);
});
test('chat provisioning preserves existing fleet and rejects reuse',()=>{
 const c=config(),before=structuredClone(c),p=chatPatch(c);
 assert.deepEqual(c,before);assert.deepEqual(Object.keys(p.agents.entries),['local-chat']);
 assert.deepEqual(p.agents.entries['local-chat'].model.fallbacks,[]);
 assert.deepEqual(p.agents.entries['local-chat'].tools.deny,['*']);
 c.agents.entries['local-chat']={};assert.throws(()=>chatPatch(c),/existing_agent/);
});
test('reasoning metadata correction preserves other model records and Agent policy',()=>{
 const c=config();c.agents.entries['local-chat']=structuredClone(CHAT);
 c.models.providers.ollama.models=[{id:'gpt-oss:20b',input:['text']},{id:'other',reasoning:false}];
 const before=structuredClone(c),p=thinkingMetadataPatch(c);
 assert.deepEqual(c,before);
 assert.deepEqual(p.models.providers.ollama.models[1],before.models.providers.ollama.models[1]);
 assert.equal(p.models.providers.ollama.models[0].reasoning,true);
 c.agents.entries['local-chat'].tools.deny=[];assert.throws(()=>thinkingMetadataPatch(c),/chat_policy/);
});
test('chat provisioning rejects remote inference and workspace collisions',()=>{
 const c=config();c.models.providers.ollama.baseUrl='https://example.com';
 assert.throws(()=>chatPatch(c),/local_provider/);
 const d=config();d.agents.entries.main.workspace=CHAT.workspace;
 assert.throws(()=>chatPatch(d),/workspace_in_use/);
});
