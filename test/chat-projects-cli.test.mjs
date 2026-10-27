import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const command=resolve(root,'stage2/chat-projects-cli.mjs');
const src=readFileSync(command,'utf8');
const manifest=JSON.parse(readFileSync(resolve(root,'config/chat-projects.json'),'utf8'));
const url=manifest.projects[0].chatUrl;
const project=url.split('/c/')[0];
const newUrl=project+'/c/cccccccc-cccc-cccc-cccc-cccccccccccc';

function run(...args){
 const p=spawnSync(process.execPath,[command,...args],{cwd:root,encoding:'utf8',timeout:5000});
 const out=JSON.parse(p.stdout.trim());
 return {...out,exitCode:p.status,stderr:p.stderr};
}

test('read-only status lists isolated OpenClaw and AliceAI project bindings',()=>{
 const a=run('status');
 assert.equal(a.exitCode,0,a.stderr);
 assert.equal(a.audit,'IOANT_CHAT_PROJECT_ROUTER');
 assert.equal(a.state,'read_only');
 assert.equal(a.routes.length,2);
 const ops=a.routes.find(r=>r.key==='openclaw-workflow');
 const alice=a.routes.find(r=>r.key==='alice-ai');
 assert.ok(ops&&alice);
 assert.equal(ops.agentId,'openclaw-dev');
 assert.equal(ops.repo,'hedydev/ioant-AI-Agent-Local-MacOS');
 assert.equal(alice.agentId,'alice-ai');
 assert.equal(alice.repo,'hedydev/ioant-AI-Minecraft-Alice');
 assert.equal(alice.role,'project-lead');
 assert.notEqual(ops.projectId,alice.projectId);
 assert.notEqual(ops.conversationId,alice.conversationId);
});

test('inspect recognises same project and safely strips ChatGPT utm_source',()=>{
 const before=run('inspect',url);
 assert.equal(before.state,'active_project_chat');
 assert.equal(before.trackingRemoved,false);
 const tracked=run('inspect',url+'?utm_source=chatgpt.com');
 assert.equal(tracked.state,'active_project_chat');
 assert.equal(tracked.trackingRemoved,true);
 assert.equal(tracked.conversationId,before.conversationId);
 const future=run('inspect',newUrl);
 assert.equal(future.state,'inactive_project_chat');
 const other=run('inspect','https://chatgpt.com/g/g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-another-project/c/cccccccc-cccc-cccc-cccc-cccccccccccc');
 assert.equal(other.state,'unregistered_project');
});

test('preview is side-effect free and never claims to create or send a new chat',()=>{
 const a=run('preview','openclaw-workflow','handoff-20261025-preview');
 assert.equal(a.exitCode,0);
 assert.equal(a.state,'proposal_only');
 assert.match(a.prompt,/交接/);
 const b=run('check-successor','openclaw-workflow',newUrl);
 assert.equal(b.exitCode,0);
 assert.equal(b.state,'candidate_only');
 assert.equal(b.newConversationId,'cccccccc-cccc-cccc-cccc-cccccccccccc');
 assert.doesNotMatch(src,/\b(?:click|type|press|spawn|execFile|writeFile|unlink|rm)\(/);
});

test('invalid project or unapproved new URL is rejected without leaking browser data',()=>{
 for(const args of [
  ['preview','other','handoff-20261025-preview'],
  ['inspect','https://bad.example/'],
  ['inspect',url+'?session=private'],
  ['check-successor','openclaw-workflow','https://chatgpt.com/g/g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-other-project/c/cccccccc-cccc-cccc-cccc-cccccccccccc'],
  ['check-successor','openclaw-workflow',url],
  ['unsafe-operation']
 ]){
  const result=run(...args);
  assert.equal(result.exitCode,1,JSON.stringify(args));
  assert.equal(result.state,'blocked');
  assert.equal(typeof result.reason,'string');
 }
});

test('handoff-status remains read-only and never exposes the private handoff document',()=>{
 const env={...process.env,
  IOANT_DEV_VOLUME:'/ioant-nonexistent-volume-for-readonly-test',
  PROJECT_DEV_CACHE:'/ioant-nonexistent-volume-for-readonly-test/DeveloperCache/projects/ioant-ai-agent-local-macos'};
 const p=spawnSync(process.execPath,[command,'handoff-status','openclaw-workflow'],{
  cwd:root,encoding:'utf8',timeout:5000,env});
 assert.equal(p.status,0,p.stderr);
 const state=JSON.parse(p.stdout.trim());
 assert.equal(state.audit,'IOANT_HANDOFF_JOURNAL');
 assert.equal(state.state,'idle');
 assert.equal(state.revision,0);
 assert.equal(state.historyCount,0);
 assert.ok(!p.stdout.includes('handoffText'));
 const wrong=run('handoff-status','nonexistent-project');
 assert.equal(wrong.exitCode,1);
 assert.equal(wrong.state,'blocked');
 assert.doesNotMatch(src,/\b(?:click|type|press|writeFile|unlink|rm)\(/);
});
