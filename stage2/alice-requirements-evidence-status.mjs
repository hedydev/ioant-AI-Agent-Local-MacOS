#!/usr/bin/env node
// AliceAI requirements evidence integrity audit (not model content review).
// No browser, Agent invocation, workflow write, task acceptance or new identity grant.
// The Ops Chat may see only integrity metadata; model advice belongs solely to
// the already-scoped AliceAI Project owner-review message channel.
import {lstat,realpath,readFile,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectWorkflow} from './workflow-store.mjs';
import {STAGES,verifyLocalAgentBindings} from './local-agent-workflow.mjs';

const BASE='/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos/chat-projects/workflows';
const VOLUME='/Volumes/LunaDrive';
const CACHE='/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos';
const WORKFLOW='alice-local-pilot';
const RECEIPT=/^receipt-lease-([0-9a-f]{24})$/;
const DIGEST=/^[0-9a-f]{64}$/;
const safeFile=s=>s.isFile()&&!s.isSymbolicLink()&&s.size>0&&s.size<=4096&&
 (s.mode&0o077)===0&&(typeof process.getuid!=='function'||s.uid===process.getuid());
const safeDir=s=>s.isDirectory()&&!s.isSymbolicLink()&&(s.mode&0o077)===0&&
 (typeof process.getuid!=='function'||s.uid===process.getuid());
const output=(state,extra={})=>Object.freeze({
 audit:'IOANT_ALICE_REQUIREMENTS_EVIDENCE_INTEGRITY',schemaVersion:1,state,
 projectKey:'alice-ai',workflowId:WORKFLOW,taskId:'requirements',
 evidenceContentsReleased:false,modelInvoked:false,chatWritten:false,
 taskAccepted:false,executionAuthorized:false,...extra
});
const reject=s=>{throw Error(s)};
export function checkRequirementsEvidence(snapshot,bytes){
 // Imported ledger is already verified by private store; pure checks also
 // reject test fixtures with altered status, task identity or receipt fields.
 if(snapshot?.id!==WORKFLOW||snapshot.revision!==24||
    snapshot.tasks?.length!==STAGES.length||snapshot.receipts?.length!==1||
    snapshot.events?.length!==24||
    !verifyLocalAgentBindings(snapshot,{projectKey:'alice-ai'}).rolesVerified)
   reject('workflow_revision_or_roles_unverified');
 const task=snapshot.tasks.find(t=>t.id==='requirements');
 if(!task||task.status!=='verification_pending'||task.workerId!=='analysis-worker'||
    task.attempt!==1||snapshot.tasks.some(t=>
      t.id!=='requirements'&&t.status!=='pending')||
    STAGES.some(stage=>!snapshot.tasks.some(t=>t.id===stage.taskId&&
      t.kind===stage.kind&&t.agentId===stage.agentId&&
      JSON.stringify(t.dependsOn)===JSON.stringify(stage.dependsOn))))
   reject('workflow_status_unverified');
 const receipt=snapshot.receipts[0],match=RECEIPT.exec(receipt?.id??'');
 if(!match||task.receiptId!==receipt.id||
    receipt.taskId!=='requirements'||receipt.workerId!=='analysis-worker'||
    receipt.attempt!==1||receipt.result!=='passed'||
    !DIGEST.test(receipt.evidenceSha256??''))
   reject('receipt_unverified');
 if(!Buffer.isBuffer(bytes)||bytes.length<2||bytes.length>4096||
    createHash('sha256').update(bytes).digest('hex')!==receipt.evidenceSha256)
   reject('evidence_digest_mismatch');
 let doc;
 try{doc=JSON.parse(bytes.toString('utf8'))}catch{reject('evidence_json_unverified')}
 if(doc.schemaVersion!==1||doc.projectKey!=='alice-ai'||
    doc.workflowId!==WORKFLOW||doc.taskId!=='requirements'||
    doc.leaseId!=='lease-'+match[1]||doc.agentId!=='alice-ai'||
    doc.result!=='passed'||doc.untrustedModelText!==true||
    typeof doc.reply!=='string'||doc.reply.length===0||doc.reply.length>1150||
    doc.reply.includes('\x00'))
   reject('evidence_schema_unverified');
 return output('verified',{revision:24,taskStatus:'verification_pending',
  receiptCount:1,evidenceHashVerified:true,privateEvidenceValidated:true,
  ownerReviewStillRequired:true,readyTaskCount:0});
}
export async function inspectRequirementsEvidenceStatus(){
 if(process.env.IOANT_WORKFLOW_TEST_ROOT==='1')
  return output('blocked',{reason:'live_inspection_disabled_in_test_mode'});
 if(process.env.IOANT_DEV_VOLUME!==VOLUME||process.env.PROJECT_DEV_CACHE!==CACHE||
    process.env.OPENCLAW_CONFIG_PATH||process.env.OPENCLAW_STATE_DIR||
    process.env.OPENCLAW_PROFILE)
  return output('blocked',{reason:'environment_unverified'});
 try{
  const dir=await lstat(BASE);
  if(!safeDir(dir)||await realpath(BASE)!==BASE)
   return output('blocked',{reason:'private_evidence_directory_unverified'});
  const {snapshot}=await inspectWorkflow(WORKFLOW);
  const m=RECEIPT.exec(snapshot.receipts?.[0]?.id??'');
  if(!m)return output('blocked',{reason:'receipt_unverified'});
  const path=join(BASE,'alice-requirements-lease-'+m[1]+'.json');
  const st=await lstat(path);
  if(!safeFile(st)||await realpath(path)!==path)
   return output('blocked',{reason:'private_evidence_file_unverified'});
  const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  let bytes;
  try{
   if(!safeFile(await fd.stat()))reject('private_evidence_file_unverified');
   bytes=await fd.readFile();
  }finally{await fd.close()}
  return checkRequirementsEvidence(snapshot,bytes);
 }catch{
  return output('inconclusive',{reason:'evidence_integrity_unverified'});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=process.argv.length===3&&process.argv[2]==='status'?
  await inspectRequirementsEvidenceStatus():
  output('blocked',{reason:'status_only'});
 console.log(JSON.stringify(result));
 if(result.state!=='verified')process.exitCode=1;
}
