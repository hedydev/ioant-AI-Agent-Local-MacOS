import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseProjectChatUrl,validateProjectRoutes,resolveProjectRoute,
 proposedSuccessor,promoteProjectChat,projectChatFingerprint} from '../stage2/project-chat-routing.mjs';

const ROOT=resolve(import.meta.dirname,'..');
const real=JSON.parse(readFileSync(resolve(ROOT,'config/chat-projects.json'),'utf8'));
const original=real.projects[0].chatUrl;
const parsed=parseProjectChatUrl(original);
const moved='https://chatgpt.com/g/'+parsed.projectId+'/c/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const otherProject='https://chatgpt.com/g/g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-other-project/c/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

test('seed registry binds this project chat to fixed local advisor and repository',()=>{
 const items=validateProjectRoutes(real);
 assert.equal(items.length,2);
 assert.equal(items[0].key,'openclaw-workflow');
 assert.equal(items[0].role,'ops-platform');
 assert.equal(items[0].agentId,'openclaw-dev');
 assert.equal(items[0].repo,'hedydev/ioant-AI-Agent-Local-MacOS');
 assert.equal(resolveProjectRoute(real,original).conversationId,parsed.conversationId);
});

test('URL path captures stable Project ID and changing chat ID',()=>{
 assert.equal(parsed.projectId,'g-p-6adbdb6e70348191bc5acb11efb0db5d');
 assert.equal(parsed.canonicalUrl,original);
 assert.equal(parsed.projectUrl,original.split('/c/')[0]);
 assert.equal(parseProjectChatUrl(original+'?utm_source=chatgpt.com',{allowTracking:true}).canonicalUrl,original);
 assert.equal(projectChatFingerprint(original),projectChatFingerprint(original+'?utm_source=chatgpt.com'));
 assert.notEqual(projectChatFingerprint(original),projectChatFingerprint(moved));
 assert.equal(parseProjectChatUrl(moved).projectId,parsed.projectId);
});

test('reject tracking in policy registry and unexpected URL origins, paths, or queries',()=>{
 const invalid=[
  original+'?utm_source=foo',original+'?utm_source=chatgpt.com&utm_source=chatgpt.com',
  original+'?token=secret',original+'#hash',original.replace('https:','http:'),
  original.replace('chatgpt.com','chatgpt.com.evil.example'),
  'https://chatgpt.com/c/'+parsed.conversationId,
  'https://chatgpt.com/g/'+parsed.projectId+'/settings',
  'https://chatgpt.com/g/'+parsed.projectId+'/c/short'
 ];
 for(const url of invalid)assert.throws(()=>parseProjectChatUrl(url,{allowTracking:true}),url);
 assert.throws(()=>parseProjectChatUrl(original+'?utm_source=chatgpt.com'));
});

test('an inactive successor and unregistered Project may NOT receive old route',()=>{
 assert.throws(()=>resolveProjectRoute(real,moved),/inactive_project_conversation/);
 assert.throws(()=>resolveProjectRoute(real,otherProject),/unregistered_project/);
 assert.throws(()=>proposedSuccessor(real,'openclaw-workflow',otherProject),/cross_project_handoff/);
 assert.throws(()=>proposedSuccessor(real,'openclaw-workflow',original),/same_chat_handoff/);
 assert.throws(()=>proposedSuccessor(real,'unregistered',moved),/unregistered_project/);
});

test('registry validation rejects duplicate project, conversation and unapproved Agent policies',()=>{
 assert.throws(()=>validateProjectRoutes({...real,unexpected:true}));
 assert.throws(()=>validateProjectRoutes({schemaVersion:1,projects:[...real.projects,structuredClone(real.projects[0])]}));
 for(const bad of [
  {...real.projects[0],agentId:'shell-admin'},
  {...real.projects[0],repo:'unknown/private'},
  {...real.projects[0],role:'root'},
  {...real.projects[0],key:'../escape'},
  {...real.projects[0],extraPolicy:true},
  {...real.projects[0],chatUrl:original+'?utm_source=chatgpt.com'}
 ])assert.throws(()=>validateProjectRoutes({schemaVersion:1,projects:[bad]}));
});

test('successful promotion updates just one chat route without changing Agent or repository',()=>{
 const proposal=proposedSuccessor(real,'openclaw-workflow',moved);
 assert.equal(proposal.projectId,parsed.projectId);
 assert.equal(proposal.agentId,'openclaw-dev');
 const good={oldWatcherInactive:true,newProjectChatVerified:true,
   handoffReceiptVerified:true,agentRouteAcknowledged:true};
 for(const field of Object.keys(good))assert.throws(
  ()=>promoteProjectChat(real,proposal,{...good,[field]:false}),/handoff_evidence_incomplete/);
 assert.throws(()=>promoteProjectChat(real,{...proposal,agentId:'alice-ai'},good),/stale_handoff_proposal/);
 const promoted=promoteProjectChat(real,proposal,good);
 assert.equal(promoted.projects[0].chatUrl,moved);
 assert.equal(promoted.projects[0].repo,real.projects[0].repo);
 assert.equal(promoted.projects[0].agentId,'openclaw-dev');
 assert.equal(real.projects[0].chatUrl,original,'do not mutate running watcher registry');
 assert.equal(resolveProjectRoute(promoted,moved).conversationId,proposal.toConversationId);
 assert.throws(()=>resolveProjectRoute(promoted,original),/inactive_project_conversation/);
});

test('AliceAI project is separately registered with a scoped advisor and no cross-project promotion',()=>{
 const routes=validateProjectRoutes(real);
 const alice=routes.find(x=>x.key==='alice-ai');
 const ops=routes.find(x=>x.key==='openclaw-workflow');
 assert.ok(alice&&ops);
 assert.equal(alice.repo,'hedydev/ioant-AI-Minecraft-Alice');
 assert.equal(alice.agentId,'alice-ai');
 assert.equal(alice.role,'project-lead');
 assert.equal(alice.projectId,'g-p-6acaef839af081919426a885b3209f54');
 assert.equal(alice.conversationId,'6ade11a5-f0c0-83ec-add1-8a0cff00c938');
 assert.notEqual(alice.projectId,ops.projectId);
 assert.notEqual(alice.conversationId,ops.conversationId);
 assert.equal(resolveProjectRoute(real,alice.chatUrl).agentId,'alice-ai');
 assert.throws(()=>proposedSuccessor(real,'alice-ai',ops.chatUrl),/cross_project_handoff/);
 assert.throws(()=>proposedSuccessor(real,'openclaw-workflow',alice.chatUrl),/cross_project_handoff/);
 const next=alice.projectUrl+'/c/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
 const proposed=proposedSuccessor(real,'alice-ai',next);
 const updated=promoteProjectChat(real,proposed,{oldWatcherInactive:true,
  newProjectChatVerified:true,handoffReceiptVerified:true,agentRouteAcknowledged:true});
 assert.equal(resolveProjectRoute(updated,next).agentId,'alice-ai');
 assert.equal(resolveProjectRoute(updated,ops.chatUrl).agentId,'openclaw-dev');
 assert.equal(real.projects.find(x=>x.key==='alice-ai').chatUrl,alice.chatUrl);
});
