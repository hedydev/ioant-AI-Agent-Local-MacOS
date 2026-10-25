import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,mkdir,rm,readFile,lstat,realpath,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {parseProjectChatUrl} from '../stage2/project-chat-routing.mjs';
import {recordHandoffText,verifyNewProjectChat,confirmHandoffReceipt,acknowledgeAgentRouting} from '../stage2/chat-handoff.mjs';
import {getHandoffStatus,beginHandoff,advanceHandoff,markHandoffPressIntent,readHandoffPrivate} from '../stage2/handoff-journal.mjs';

const manifest=JSON.parse(readFileSync(resolve(import.meta.dirname,'..','config/chat-projects.json'),'utf8'));
const key='openclaw-workflow';
const original=parseProjectChatUrl(manifest.projects[0].chatUrl);
const successor=original.projectUrl+'/c/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const id='handoff-test-journal-1';
const handoff='本项目负责 OpenClaw 与 ChatGPT 的多项目通信集成、Project ID 与会话 ID 独立路由。'+
  '已完成的事实是本地项目注册测试通过；浏览器自动创建新 Chat 以及接收回执仍未完成真实验收。'+
  '下一步按安全方式持续开发日志、页面限额检测与 Agent 同步，禁止自动执行任意命令或接管其他项目。';
process.env.IOANT_HANDOFF_TEST_ROOT='1';
const fixture=async fn=>{
 const created=await mkdtemp(join(tmpdir(),'ioant-private-handoff-'));
 // macOS tempdir() can start at /var while its canonical APFS path is /private/var.
 // The production journal deliberately rejects symlinked parent paths.
 const parent=await realpath(created);
 const root=join(parent,'store','handoffs');
 try{return await fn(root,parent)}finally{await rm(parent,{recursive:true,force:true})}
};

test('status without handoff is read-only and does not create a journal root',()=>fixture(async(root)=>{
 const empty=await getHandoffStatus(key,{root});
 assert.equal(empty.state,'idle');
 assert.equal(empty.revision,0);
 assert.equal(empty.historyCount,0);
 await assert.rejects(lstat(root),{code:'ENOENT'});
}));
test('private handoff journal begins once and preserves original project/Agent context',()=>fixture(async(root)=>{
 const a=await beginHandoff(manifest,key,{requestId:id,root});
 assert.equal(a.state,'requested');
 assert.equal(a.revision,1);
 assert.equal(a.sendPhase,'none');
 const b=await beginHandoff(manifest,key,{requestId:id,root});
 assert.deepEqual(b,a,'same request ID must be idempotent');
 await assert.rejects(beginHandoff(manifest,key,{requestId:'handoff-test-journal-2',root}),/handoff_already_active/);
 const raw=JSON.parse(await readFile(join(root,key+'.json'),'utf8'));
 assert.equal(raw.active.projectId,original.projectId);
 assert.equal(raw.active.oldConversationId,original.conversationId);
 assert.equal(raw.active.id,id);
 assert.equal((await lstat(root)).mode&0o077,0);
 assert.equal((await lstat(join(root,key+'.json'))).mode&0o077,0);
 const status=await getHandoffStatus(key,{root});
 assert.ok(!JSON.stringify(status).includes('handoffText'));
}));
test('all stage changes are revision guarded, strict and persist across fresh reads',()=>fixture(async(root)=>{
 await beginHandoff(manifest,key,{requestId:id,root});
 const request=await readHandoffPrivate(key,{root});
 const ready=recordHandoffText(request,handoff,{confirmedAssistantTurn:true});
 const a=await advanceHandoff(manifest,key,{expectedRevision:1,verifiedState:ready,root});
 assert.equal(a.state,'handoff_ready');
 assert.equal(a.revision,2);
 await assert.rejects(advanceHandoff(manifest,key,{expectedRevision:1,verifiedState:ready,root}),/handoff_stale_revision/);
 const verified=verifyNewProjectChat(await readHandoffPrivate(key,{root}),manifest,successor,{operatorApproved:true,domProjectVerified:true});
 const b=await advanceHandoff(manifest,key,{expectedRevision:2,verifiedState:verified,root});
 assert.equal(b.state,'new_chat_verified');
 assert.equal(b.toConversationId,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
 const intent=await markHandoffPressIntent(key,{expectedRevision:3,root});
 assert.equal(intent.sendPhase,'press_intent');
 assert.equal(intent.revision,4);
 await assert.rejects(markHandoffPressIntent(key,{expectedRevision:4,root}),/handoff_press_intent_not_safe/);
 const stored=await readHandoffPrivate(key,{root});
 assert.equal(stored.sendPhase,'press_intent');
 const receipt=confirmHandoffReceipt(stored,{recipientUrl:successor,userRoleReceiptFound:true});
 const c=await advanceHandoff(manifest,key,{expectedRevision:4,verifiedState:receipt,root});
 assert.equal(c.state,'receipt_verified');
 assert.equal(c.sendPhase,'confirmed');
 assert.equal(c.revision,5);
 const acknowledged=acknowledgeAgentRouting(await readHandoffPrivate(key,{root}),{
  agentId:'openclaw-dev',agentAcknowledged:true});
 const d=await advanceHandoff(manifest,key,{expectedRevision:5,verifiedState:acknowledged,root});
 assert.equal(d.state,'agent_acknowledged');
 assert.equal(d.revision,6);
 assert.equal(d.sendPhase,'confirmed');
 assert.equal(d.historyCount,0);
 assert.equal((await readHandoffPrivate(key,{root})).agentId,'openclaw-dev');
}));
test('cannot skip receipt/Agent acknowledgement or forge another Project/Agent',()=>fixture(async(root)=>{
 await beginHandoff(manifest,key,{requestId:id,root});
 const request=await readHandoffPrivate(key,{root});
 const ready=recordHandoffText(request,handoff,{confirmedAssistantTurn:true});
 await assert.rejects(advanceHandoff(manifest,key,{expectedRevision:1,verifiedState:{...ready,phase:'new_chat_verified'},root}),/unexpected_handoff_transition/);
 await assert.rejects(advanceHandoff(manifest,key,{expectedRevision:1,verifiedState:{...ready,handoffSha256:'0'.repeat(64)},root}),/handoff_transition_content_changed/);
 await advanceHandoff(manifest,key,{expectedRevision:1,verifiedState:ready,root});
 const cross='https://chatgpt.com/g/g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-other/c/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
 const forgery={...ready,phase:'new_chat_verified',newUrl:cross,newConversationId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'};
 await assert.rejects(advanceHandoff(manifest,key,{expectedRevision:2,verifiedState:forgery,root}),/cross_project_handoff/);
 const valid=verifyNewProjectChat(await readHandoffPrivate(key,{root}),manifest,successor,{operatorApproved:true,domProjectVerified:true});
 await advanceHandoff(manifest,key,{expectedRevision:2,verifiedState:valid,root});
 const pretended=confirmHandoffReceipt(await readHandoffPrivate(key,{root}),{recipientUrl:successor,userRoleReceiptFound:true});
 await assert.rejects(advanceHandoff(manifest,key,{expectedRevision:3,verifiedState:pretended,root}),/handoff_delivery_not_attempted/);
 await markHandoffPressIntent(key,{expectedRevision:3,root});
 const recipient=confirmHandoffReceipt(await readHandoffPrivate(key,{root}),{recipientUrl:successor,userRoleReceiptFound:true});
 await advanceHandoff(manifest,key,{expectedRevision:4,verifiedState:recipient,root});
 const wrongAgent=acknowledgeAgentRouting(await readHandoffPrivate(key,{root}),{agentId:'alice-ai',agentAcknowledged:true});
 await assert.rejects(advanceHandoff(manifest,key,{expectedRevision:5,verifiedState:wrongAgent,root}),/agent_route_mismatch/);
}));
test('stale root symlinks and replaced journal files block instead of following them',()=>fixture(async(root,parent)=>{
 await beginHandoff(manifest,key,{requestId:id,root});
 const file=join(root,key+'.json');
 const external=join(parent,'external.json');
 await writeFile(external,'external-sentinel',{mode:0o600});
 await rm(file);
 await symlink(external,file);
 await assert.rejects(getHandoffStatus(key,{root}),/unsafe_handoff_file/);
 assert.equal(await readFile(external,'utf8'),'external-sentinel');
 await rm(file);
 const alternate=join(parent,'elsewhere');
 await mkdir(alternate,{mode:0o700});
 await rm(root,{recursive:true});
 await symlink(alternate,root);
 await assert.rejects(getHandoffStatus(key,{root}),/unsafe_handoff_root/);
}));
test('another active lock blocks and is never deleted by competing worker',()=>fixture(async(root)=>{
 await beginHandoff(manifest,key,{requestId:id,root});
 const lock=join(root,key+'.lock');
 await mkdir(lock,{mode:0o700});
 await assert.rejects(beginHandoff(manifest,key,{requestId:'handoff-test-other',root}),/handoff_lock_busy/);
 assert.equal((await lstat(lock)).isDirectory(),true);
}));
test('caller cannot redirect private journals to an arbitrary path outside test mode',()=>fixture(async(root)=>{
 const old=process.env.IOANT_HANDOFF_TEST_ROOT;
 delete process.env.IOANT_HANDOFF_TEST_ROOT;
 try{
  await assert.rejects(beginHandoff(manifest,key,{requestId:id,root}),/test_root_not_authorized/);
 }finally{process.env.IOANT_HANDOFF_TEST_ROOT=old}
}));
