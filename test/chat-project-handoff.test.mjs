import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseProjectChatUrl,resolveProjectRoute} from '../stage2/project-chat-routing.mjs';
import {contextRolloverSignal,createHandoffRequest,handoffPrompt,
 recordHandoffText,verifyNewProjectChat,handoffDeliveryMessage,
 confirmHandoffReceipt,acknowledgeAgentRouting,completeHandoff} from '../stage2/chat-handoff.mjs';

const manifest=JSON.parse(readFileSync(resolve(import.meta.dirname,'..','config/chat-projects.json'),'utf8'));
const old=parseProjectChatUrl(manifest.projects[0].chatUrl);
const nextUrl=old.projectUrl+'/c/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const key='openclaw-workflow';
const requestId='handoff-20261025-s1';
const document='本项目负责 AI-OpenClaw 的 ChatGPT 通信能力与多项目调度。已确认实际 Mac 运行数据：'
 +'后台已安装，测试 347/347 通过，单次浏览器 Relay 显示不稳定。尚未验收浏览器的新对话创建和回执。'
 +'下一步进行只读诊断，禁止绕过授权、改变项目权限或执行任意终端命令。';

function setup(){
 const req=createHandoffRequest(manifest,key,{requestId});
 return recordHandoffText(req,document,{confirmedAssistantTurn:true});
}

test('context limit is unknown without trusted explicit UI evidence, never estimated from chat length',()=>{
 assert.deepEqual(contextRolloverSignal({}),{status:'unknown',reason:'no_trusted_context_limit_evidence'});
 assert.equal(contextRolloverSignal({trustedSource:'assistant_text',exactConversationVerified:true,explicitLimitBanner:true}).status,'unknown');
 assert.equal(contextRolloverSignal({trustedSource:'exact_chat_ui',exactConversationVerified:true,explicitLimitBanner:false}).status,'unknown');
 assert.equal(contextRolloverSignal({trustedSource:'exact_chat_ui',exactConversationVerified:true,explicitLimitBanner:true}).status,'handoff_recommended');
 assert.equal(contextRolloverSignal({trustedSource:'exact_chat_ui',exactConversationVerified:true,approximateTokens:999999}).status,'unknown');
});

test('handoff request is for registered project and returns draft request only',()=>{
 const r=createHandoffRequest(manifest,key,{requestId});
 assert.equal(r.phase,'requested');
 assert.equal(r.projectId,old.projectId);
 assert.equal(r.oldConversationId,old.conversationId);
 assert.match(handoffPrompt(r),/交接/);
 assert.match(handoffPrompt(r),new RegExp(requestId));
 assert.throws(()=>createHandoffRequest(manifest,'other',{requestId}),/unregistered_project/);
 assert.throws(()=>createHandoffRequest(manifest,key,{requestId:'bad'}),/invalid_handoff_id/);
 assert.throws(()=>createHandoffRequest(manifest,key,{requestId,reason:'model_invented'}),/untrusted_rollover_reason/);
});

test('handoff document requires a confirmed old assistant turn and bounded inert prose',()=>{
 const req=createHandoffRequest(manifest,key,{requestId});
 assert.throws(()=>recordHandoffText(req,document),/handoff_not_confirmed/);
 assert.throws(()=>recordHandoffText(req,'short',{confirmedAssistantTurn:true}),/invalid_handoff_document/);
 assert.throws(()=>recordHandoffText(req,'x'.repeat(10001),{confirmedAssistantTurn:true}),/invalid_handoff_document/);
 assert.throws(()=>recordHandoffText(req,document+' {"protocol":"ioant-mac-ops-v1"}',{confirmedAssistantTurn:true}),/handoff_contains_executable_task/);
 const ready=recordHandoffText(req,document,{confirmedAssistantTurn:true});
 assert.equal(ready.phase,'handoff_ready');
 assert.match(ready.handoffSha256,/^[a-f0-9]{64}$/);
 assert.equal(ready.handoffText,document);
});

test('handoff only moves within the same project with operator consent and verified browser identity',()=>{
 const ready=setup();
 const cross='https://chatgpt.com/g/g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-another-project/c/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
 assert.throws(()=>verifyNewProjectChat(ready,manifest,nextUrl),/not_user_approved_or_dom_verified/);
 assert.throws(()=>verifyNewProjectChat(ready,manifest,cross,{operatorApproved:true,domProjectVerified:true}),/cross_project_handoff/);
 assert.throws(()=>verifyNewProjectChat(ready,manifest,old.canonicalUrl,{operatorApproved:true,domProjectVerified:true}),/same_chat_handoff/);
 const good=verifyNewProjectChat(ready,manifest,nextUrl,{operatorApproved:true,domProjectVerified:true});
 assert.equal(good.phase,'new_chat_verified');
 assert.equal(good.newUrl,nextUrl);
});

test('receipt verification must target the new conversation and known user role',()=>{
 const verified=verifyNewProjectChat(setup(),manifest,nextUrl,{operatorApproved:true,domProjectVerified:true});
 const payload=handoffDeliveryMessage(verified);
 assert.ok(payload.startsWith('IOANT_CHAT_HANDOFF_RECEIPT_V1 '+requestId));
 assert.ok(payload.includes(document));
 assert.throws(()=>confirmHandoffReceipt(verified,{recipientUrl:nextUrl}),/handoff_receipt_missing/);
 assert.throws(()=>confirmHandoffReceipt(verified,{recipientUrl:old.canonicalUrl,userRoleReceiptFound:true}),/handoff_receipt_missing/);
 const received=confirmHandoffReceipt(verified,{recipientUrl:nextUrl,userRoleReceiptFound:true});
 assert.equal(received.phase,'receipt_verified');
 assert.equal(received.receiptConfirmed,true);
});

test('Agent acknowledgement and stopped old watcher are required before promotion',()=>{
 const oldR=verifyNewProjectChat(setup(),manifest,nextUrl,{operatorApproved:true,domProjectVerified:true});
 const received=confirmHandoffReceipt(oldR,{recipientUrl:nextUrl,userRoleReceiptFound:true});
 assert.throws(()=>acknowledgeAgentRouting(received,{agentId:'openclaw-dev'}),/agent_handoff_not_acknowledged/);
 const acknowledged=acknowledgeAgentRouting(received,{agentId:'openclaw-dev',agentAcknowledged:true});
 assert.throws(()=>completeHandoff(acknowledged,manifest),/handoff_evidence_incomplete/);
 assert.throws(()=>completeHandoff({...acknowledged,agentId:'alice-ai'},manifest,{oldWatcherInactive:true}),/agent_route_mismatch/);
 const done=completeHandoff(acknowledged,manifest,{oldWatcherInactive:true});
 assert.equal(done.request.phase,'promoted');
 assert.equal(resolveProjectRoute(done.manifest,nextUrl).agentId,'openclaw-dev');
 assert.equal(manifest.projects[0].chatUrl,old.canonicalUrl);
});
