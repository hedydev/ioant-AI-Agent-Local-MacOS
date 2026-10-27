import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {validateIsolatedProjectScope,sameIsolatedProjectChat,
 isolatedProjectAllowsAction} from '../stage2/project-worker-scope.mjs';
import {actionFromJson} from '../stage2/protocol.mjs';
const root=resolve(import.meta.dirname,'..');
const manifest=JSON.parse(readFileSync(resolve(root,'config/chat-projects.json'),'utf8'));
const alice=manifest.projects.find(x=>x.key==='alice-ai');
const ops=manifest.projects.find(x=>x.key==='openclaw-workflow');
const base={projectKey:'alice-ai',url:alice.chatUrl,mode:'watch',initialize:false,
 devAgent:null,enableGuiReadonly:true,enableAlicePreflight:false,
 enableAliceLabStartupProbe:false,enableMintDiagnostics:false,enableSelfUpdate:false,
 enableOpenClawProvision:false,enableOpenClawAgentCreate:false,
 enableOpenClawDevCreate:false};
const trusted=()=>validateIsolatedProjectScope(base,manifest,'chrome');
test('AliceAI scope comes solely from pinned local Project registry, not task text',()=>{
 const result=trusted();
 assert.equal(result.agentId,'alice-ai');
 assert.equal(result.conversationId,'6ade11a5-f0c0-83ec-add1-8a0cff00c938');
 assert.ok(sameIsolatedProjectChat(result,alice.chatUrl));
 assert.ok(sameIsolatedProjectChat(result,alice.chatUrl.replace('-ai-mc-alice/','-renamed/')));
 assert.equal(sameIsolatedProjectChat(result,ops.chatUrl),false);
 assert.equal(sameIsolatedProjectChat(result,'https://chatgpt.com/c/'+result.conversationId),false);
 assert.equal(sameIsolatedProjectChat(result,alice.chatUrl+'?token=bad'),false);
});
test('AliceAI scope forbids privileged flags, initialization and other project routes',()=>{
 for(const field of ['enableAlicePreflight','enableAliceLabStartupProbe','enableMintDiagnostics',
  'enableSelfUpdate','enableOpenClawProvision','enableOpenClawAgentCreate','enableOpenClawDevCreate']){
  assert.throws(()=>validateIsolatedProjectScope({...base,[field]:true},manifest,'chrome'),/unsafe_alice_worker_options/);
 }
 for(const change of [{initialize:true},{devAgent:'alice-ai'},{enableGuiReadonly:false},
  {projectKey:'openclaw-workflow'},{url:ops.chatUrl},{mode:'list'}]){
  assert.throws(()=>validateIsolatedProjectScope({...base,...change},manifest,'chrome'));
 }
 assert.throws(()=>validateIsolatedProjectScope(base,manifest,'openclaw'));
 const tampered={...manifest,projects:manifest.projects.map(x=>x.key==='alice-ai'?{...x,agentId:'main'}:x)};
 assert.throws(()=>validateIsolatedProjectScope(base,tampered,'chrome'));
});
test('only bounded GUI observation is allowed from AliceAI assistant, never ops or host tools',()=>{
 const scope=trusted();
 for(const action of ['project-head','project-tests','project-update-verify','mac-terminal',
  'mac-window-text','openclaw-alice-dev-discuss','openclaw-agent-dev-discuss',
  'alice-witness-preflight','mint-bds-process-identity','openclaw-alice-create']){
  const t=actionFromJson(JSON.stringify({protocol:'ioant-mac-ops-v1',
   id:'alice-scope-test-001',action,
   ...(action==='mac-terminal'?{command:'echo UNSAFE',cwd:'workspace'}:{}),
   ...(action==='mac-window-text'?{app:'terminal',text:'NO',submit:false}:{}),
   ...(['openclaw-agent-dev-discuss','openclaw-alice-dev-discuss'].includes(action)?{prompt:'Hello'}:{})
  }));
  assert.equal(isolatedProjectAllowsAction(scope,t,base),false,action);
 }
 const probe=actionFromJson(JSON.stringify({protocol:'ioant-mac-ops-v1',
  id:'alice-safe-probe-002',action:'openclaw-gui-readonly-probe'}));
 assert.equal(isolatedProjectAllowsAction(scope,probe,base),true);
});
test('runner dispatch preserves scope restriction before any implementation branch',()=>{
 const src=readFileSync(resolve(root,'stage2/chatgpt-loop.mjs'),'utf8');
 assert.match(src,/const scopedAuthorized=authorized&&/);
 assert.match(src,/!isolatedProjectScope\|\|isolatedProjectAllowsAction\(isolatedProjectScope,task,opts\)/);
 assert.match(src,/if\(!scopedAuthorized\) \{/);
 assert.match(src,/sameIsolatedProjectChat\(isolatedProjectScope,matches\[0\]\?\.url\)/);
 assert.match(src,/sameIsolatedProjectChat\(isolatedProjectScope,parsed.url\)/);
 assert.match(src,/!isolatedProjectScope\)\{/);
});

test('new Project validation cannot execute before the existing unique-tab guard',()=>{
 const src=readFileSync(resolve(root,'stage2/chatgpt-loop.mjs'),'utf8');
 const count=src.indexOf('if(matches.length!==1)');
 const project=src.indexOf('if(isolatedProjectScope&&!sameIsolatedProjectChat');
 const target=src.indexOf('const id=matches[0].suggestedTargetId');
 assert.ok(count>0&&project>count&&target>project);
 const deny=src.indexOf('if(!scopedAuthorized) {');
 const action=src.indexOf("}else if(task.action==='alice-lab-startup-probe')",deny);
 assert.ok(deny>0&&action>deny);
});
