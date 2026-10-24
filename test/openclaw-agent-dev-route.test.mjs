import test from 'node:test';
import assert from 'node:assert/strict';
import {fixedPatch} from '../stage2/openclaw-alice-create.mjs';
import {tabVisibility} from '../stage2/tab-visibility.mjs';
import {actionFromJson,chatKey} from '../stage2/protocol.mjs';
import {validDevAgent,agentPolicy,isBoundDevDiscussion,verifyBoundAgentConfig,inspectBoundWorkspace}
 from '../stage2/development-agent-route.mjs';
import {buildBoundTurn,discussBoundAgent} from '../stage2/openclaw-agent-dev-discuss.mjs';

const url='https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/6adbf632-37f0-83ec-b4b1-86931b5d3aec';
const aliceUrl='https://chatgpt.com/c/6adbf632-37f0-83ec-b4b1-86931b5d3aec';
const digest=chatKey(url);
const devCommand={protocol:'ioant-mac-ops-v1',id:'dev-dialogue-20261025-065',
 action:'openclaw-agent-dev-discuss',prompt:'Please review the staged bridge boundaries'};
function config(agentId){
 const entries={main:{name:'main'},'alice-ai':fixedPatch().agents.entries['alice-ai']};
 if(agentId==='openclaw-dev')entries['openclaw-dev']=agentPolicy('openclaw-dev');
 const layer={agents:{ownership:'explicit',defaults:{systemAgent:{agentId:'main'}},
  entries},bindings:[{agentId:'main'}]};
 // These must simulate four independent Gateway snapshots.
 // A shared object wrongly makes a parsed-only mutation also modify source/config.
 return {valid:true,exists:true,
  sourceConfig:structuredClone(layer),config:structuredClone(layer),
  parsed:structuredClone(layer),resolved:structuredClone(layer)};
}
test('only Mac-pinned fixed dev agents can be routed',()=>{
 assert.equal(validDevAgent('openclaw-dev'),true);
 assert.equal(validDevAgent('alice-ai'),true);
 for(const v of ['main','anything','alice-ai;sh',undefined]){
  assert.equal(validDevAgent(v),false);
  assert.throws(()=>agentPolicy(v));
 }
});
test('legacy Alice discussion cannot execute on an OpenClaw infrastructure Agent',()=>{
 assert.equal(isBoundDevDiscussion('openclaw-agent-dev-discuss','openclaw-dev'),true);
 assert.equal(isBoundDevDiscussion('openclaw-agent-dev-discuss','alice-ai'),true);
 assert.equal(isBoundDevDiscussion('openclaw-alice-dev-discuss','alice-ai'),true);
 assert.equal(isBoundDevDiscussion('openclaw-alice-dev-discuss','openclaw-dev'),false);
 assert.equal(isBoundDevDiscussion('openclaw-agent-dev-discuss','main'),false);
 assert.equal(isBoundDevDiscussion('project-tests','alice-ai'),false);
});
test('new discussion protocol does not accept an agent ID or arbitrary argv',()=>{
 const t=actionFromJson(JSON.stringify(devCommand));
 assert.equal(t.action,'openclaw-agent-dev-discuss');
 assert.equal(t.prompt,devCommand.prompt);
 for(const extras of [{agent:'alice-ai'},{model:'ollama/other'},{argv:['date']},{shell:'sh'}])
  assert.throws(()=>actionFromJson(JSON.stringify({...devCommand,...extras})),/Malformed/);
 assert.throws(()=>actionFromJson(JSON.stringify({...devCommand,action:'project-tests'})),/Malformed/);
});
test('the agent and exact chat URL together isolate every model session',()=>{
 const d=buildBoundTurn('Review code',digest,'openclaw-dev');
 const a=buildBoundTurn('Review code',digest,'alice-ai');
 assert.equal(d.sessionKey,'agent:openclaw-dev:dev-'+digest);
 assert.notEqual(d.sessionKey,a.sessionKey);
 assert.notEqual(d.sessionKey,buildBoundTurn('Review code',chatKey(aliceUrl),'openclaw-dev').sessionKey);
 assert.throws(()=>buildBoundTurn('Review code',digest,'main'));
});
test('route config checks explicit main owner, exact model policy, denial and no bindings in all four roots',()=>{
 assert.equal(verifyBoundAgentConfig(config('alice-ai'),'alice-ai'),true);
 assert.equal(verifyBoundAgentConfig(config('openclaw-dev'),'openclaw-dev'),true);
 assert.equal(verifyBoundAgentConfig(config('alice-ai'),'openclaw-dev'),false);
 const changed=structuredClone(config('openclaw-dev'));
 changed.parsed.agents.entries['openclaw-dev'].tools.deny=[];
 assert.equal(verifyBoundAgentConfig(changed,'openclaw-dev'),false);
 const other=structuredClone(config('openclaw-dev'));
 other.config.bindings.push({agentId:'openclaw-dev'});
 assert.equal(verifyBoundAgentConfig(other,'openclaw-dev'),false);
 const model=structuredClone(config('openclaw-dev'));
 model.resolved.agents.entries['openclaw-dev'].model='ollama/other';
 assert.equal(verifyBoundAgentConfig(model,'openclaw-dev'),false);
});
test('OpenClaw Dev missing or unsafe never invokes model or changes config',async()=>{
 let n=0;
 const rpc=async()=>config('alice-ai');
 const invoke=async()=>{n++;return {state:'reply',data:{status:'ok',result:{payloads:[{text:'never'}]}}};};
 const missing=await discussBoundAgent({agentId:'openclaw-dev',prompt:devCommand.prompt,
  chatDigest:digest,rpc,workspace:async()=> 'present_private',invoke});
 assert.equal(missing.state,'blocked');assert.equal(missing.note,'agent_missing_or_unsafe');
 const wrong=await discussBoundAgent({agentId:'main',prompt:devCommand.prompt,
  chatDigest:digest,rpc,workspace:async()=> 'present_private',invoke});
 assert.equal(wrong.state,'blocked');
 assert.equal(n,0);
});
test('successful bound development turn invokes selected agent only once without delivery',async()=>{
 let calls=0;
 const result=await discussBoundAgent({agentId:'openclaw-dev',prompt:devCommand.prompt,
  chatDigest:digest,rpc:async()=>config('openclaw-dev'),
  workspace:async(id)=>id==='openclaw-dev'?'present_private':'unavailable',
  invoke:async(args,body)=>{
   calls++;
   assert.deepEqual(args,['agent','--agent','openclaw-dev','--session-key',
    'agent:openclaw-dev:dev-'+digest,'--message-file','/dev/stdin','--timeout','120','--json']);
   assert.equal(args.includes('--deliver'),false);
   assert.equal(args.includes('--model'),false);
   assert.ok(body.includes(devCommand.prompt));
   return {state:'reply',data:{status:'ok',result:{payloads:[{text:'Bound advice'}]}}};
  }});
 assert.equal(calls,1);assert.equal(result.state,'answered');
 assert.equal(result.text,'Bound advice');assert.equal(result.configWrite,false);
 assert.equal(result.toolsEnabled,false);assert.equal(result.externalDelivery,false);
});
test('private workspace is inspected without creating directories',async()=>{
 const base='/Volumes/LunaDrive/DeveloperCache/openclaw-agents';
 const stat=async p=>p.endsWith('AGENTS.md')?
  {isFile:()=>true,isDirectory:()=>false,isSymbolicLink:()=>false,mode:0o100600,size:200,uid:0}:
  {isFile:()=>false,isDirectory:()=>true,isSymbolicLink:()=>false,mode:0o40700,uid:0};
 // Fixture expects current uid for private paths; emulate this safely.
 const uid=typeof process.getuid==='function'?process.getuid():0;
 const own=async p=>({...await stat(p),uid});
 assert.equal(await inspectBoundWorkspace('openclaw-dev',{stat:own,canonical:async p=>p}),'present_private');
 assert.equal(await inspectBoundWorkspace('not-allowed',{stat:own,canonical:async p=>p}),'invalid_agent');
});
test('missing tab identifies browser profile and visibility without exposing unrelated URLs',()=>{
 const foreign='https://example.com/path?token=sensitive';
 const t=tabVisibility([{url:foreign}],url,'chrome');
 assert.equal(t.code,'no_chatgpt_tab_visible');
 assert.equal(t.profile,'chrome');
 assert.equal(t.chatgptTabs,0);
 assert.doesNotMatch(JSON.stringify(t),/example.com|sensitive/);
 const same=tabVisibility([{url:aliceUrl}],url,'chrome');
 assert.equal(same.code,'same_chat_different_url');assert.equal(same.sameIdTabs,1);
 const other=tabVisibility([{url:'https://chatgpt.com/c/6aabb632-37f0-83ec-b4b1-86931b5d3aec'}],url,'openclaw');
 assert.equal(other.code,'different_chat_visible');
 const exact=tabVisibility([{url}],url,'chrome');assert.equal(exact.code,'exact_match');
 assert.equal(tabVisibility([{url},{url}],url,'chrome').code,'duplicate_exact');
});

test('selected Alice rejects an unsafe Dev, and selected Dev rejects an unsafe Alice',()=>{
 const modifiedDev=structuredClone(config('openclaw-dev'));
 modifiedDev.sourceConfig.agents.entries['openclaw-dev'].tools.deny=[];
 assert.equal(verifyBoundAgentConfig(modifiedDev,'alice-ai'),false);
 const modifiedAlice=structuredClone(config('openclaw-dev'));
 modifiedAlice.config.agents.entries['alice-ai'].tools.exec.mode='allow';
 assert.equal(verifyBoundAgentConfig(modifiedAlice,'openclaw-dev'),false);
 const boundOther=structuredClone(config('openclaw-dev'));
 boundOther.parsed.bindings.push({agentId:'alice-ai'});
 assert.equal(verifyBoundAgentConfig(boundOther,'openclaw-dev'),false);
});
test('inconsistent Agent roster across four Gateway snapshots is rejected',()=>{
 const snap=config('openclaw-dev');
 assert.notStrictEqual(snap.sourceConfig,snap.config);
 assert.notStrictEqual(snap.parsed,snap.config);
 assert.notStrictEqual(snap.parsed.agents.entries,snap.sourceConfig.agents.entries);
 const partial=structuredClone(config('openclaw-dev'));
 delete partial.parsed.agents.entries['openclaw-dev'];
 assert.equal(verifyBoundAgentConfig(partial,'alice-ai'),false);
 const foreign=structuredClone(config('openclaw-dev'));
 foreign.resolved.agents.entries['unexpected-ai']={tools:{deny:['*']}};
 assert.equal(verifyBoundAgentConfig(foreign,'alice-ai'),false);
 const noDev=structuredClone(config('alice-ai'));
 assert.equal(verifyBoundAgentConfig(noDev,'alice-ai'),true);
 assert.equal(verifyBoundAgentConfig(noDev,'openclaw-dev'),false);
});
