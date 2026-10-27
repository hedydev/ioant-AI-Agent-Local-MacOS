// Alice Project Chat receives a bounded, read-only LOCAL AGENT advisory packet.
// This is NOT an approval action, an OpenClaw Agent instruction, or an ops-chat
// route. Existing Chrome Relay exact-Project checks must pass before dispatch.
import {readFile,lstat,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {inspectWorkflow} from './workflow-store.mjs';
import {readyTasks} from './workflow-engine.mjs';

const BASE='/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos/chat-projects/workflows';
const WORKFLOW='alice-local-pilot',TASK='requirements';
const OWNER='6ade11a5-f0c0-83ec-add1-8a0cff00c938';
const RECEIPT=/^receipt-lease-([0-9a-f]{24})$/;
const sha=x=>createHash('sha256').update(x).digest('hex');
const priv=s=>s.isFile()&&!s.isSymbolicLink()&&
 (s.mode&0o077)===0&&s.size<=4096&&
 (typeof process.getuid!=='function'||s.uid===process.getuid());
const safeScope=scope=>scope?.key==='alice-ai'&&
 scope.conversationId===OWNER&&typeof scope.projectId==='string'&&
 scope.projectId==='g-p-6acaef839af081919426a885b3209f54';
const base={audit:'IOANT_ALICE_CHAT_OWNER_REVIEW_PACKET',schemaVersion:1,
 ownerChatOnly:true,readOnly:true,executionAuthorized:false,
 approvalGranted:false,workflowId:WORKFLOW,taskId:TASK};
export function reviewPacketFromEvidence(snapshot,bytes,{scope}={}){
 if(!safeScope(scope))throw Error('owner_scope_unverified');
 if(!snapshot||snapshot.id!==WORKFLOW||snapshot.revision!==24||
  snapshot.receipts?.length!==1||snapshot.tasks?.length!==7||
  readyTasks(snapshot).length!==0)throw Error('unexpected_workflow_revision');
 const task=snapshot.tasks.find(x=>x.id===TASK);
 const receipt=snapshot.receipts[0];
 if(!task||task.status!=='verification_pending'||task.receiptId!==receipt.id||
  task.workerId!=='analysis-worker'||task.attempt!==1||
  !RECEIPT.test(receipt.id)||receipt.taskId!==TASK||
  receipt.workerId!=='analysis-worker'||receipt.attempt!==1||
  receipt.result!=='passed'||typeof receipt.evidenceSha256!=='string'||
  !/^[a-f0-9]{64}$/.test(receipt.evidenceSha256))
  throw Error('receipt_unverified');
 if(!Buffer.isBuffer(bytes)||bytes.length>4096||bytes.length===0||
  sha(bytes)!==receipt.evidenceSha256)throw Error('evidence_digest_mismatch');
 const doc=JSON.parse(bytes.toString('utf8'));
 if(doc?.schemaVersion!==1||doc.workflowId!==WORKFLOW||
  doc.projectKey!=='alice-ai'||doc.taskId!==TASK||
  doc.leaseId!=='lease-'+RECEIPT.exec(receipt.id)[1]||
  doc.agentId!=='alice-ai'||doc.result!=='passed'||
  doc.untrustedModelText!==true||typeof doc.reply!=='string'||
  doc.reply.length<1||doc.reply.length>1150||
  doc.reply.includes('\x00'))throw Error('evidence_invalid');
 return Object.freeze({...base,revision:24,receiptId:receipt.id,
  evidenceSha256:receipt.evidenceSha256,taskStatus:task.status,
  modelSource:'local_openclaw_alice_ai_advisor',
  modelReplyTruncated:doc.reply.includes('[truncated]'),
  reviewRequiredBy:'ChatGPT AliceAI Project Chat',
  modelReply:doc.reply});
}
export async function inspectAliceOwnerReviewPacket(scope,{store}={}){
 if(!safeScope(scope))return {status:'approval_required',reason:'owner_chat_scope_unverified'};
 if(process.env.IOANT_WORKFLOW_TEST_ROOT==='1')
  return {status:'approval_required',reason:'test_environment_cannot_read_live_evidence'};
 try{
  if(process.env.PROJECT_DEV_CACHE!==
    '/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos'||
    process.env.IOANT_DEV_VOLUME!=='/Volumes/LunaDrive')
   throw Error('untrusted_cache');
  const {snapshot}=await inspectWorkflow(WORKFLOW,store);
  const receipt=snapshot.receipts[0];
  const match=RECEIPT.exec(receipt?.id??'');
  if(!match)throw Error('receipt_unverified');
  const filename='alice-requirements-lease-'+match[1]+'.json';
  const path=join(BASE,filename);
  if(await realpath(BASE)!==BASE||await realpath(path)!==path||
    !priv(await lstat(path)))throw Error('evidence_private_check_failed');
  const packet=reviewPacketFromEvidence(snapshot,await readFile(path),{scope});
  // report output is untrusted model advice; caller uses bounded/redacted
  // existing same-Chat feedback pipeline, not a new browser writer.
  return {status:'passed',output:JSON.stringify(packet)};
 }catch{
  return {status:'inconclusive',reason:'owner_review_evidence_unavailable'};
 }
}
