// Local operator enrollment, separate from generic script grants and cloud review.
// Never treats this file as authority to override an execution-platform refusal.
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {readFile,lstat,realpath} from 'node:fs/promises';
import {readPrivateJson} from '../../stage2/workflow-capabilities.mjs';

export const ALICE_RESTART_TASK='.openclaw/tasks/alice_17879_client_restart.json';
export const ALICE_RESTART_SCRIPT='games/minecraft-ai/scripts/alice-17879-client-restart-gated.py';
export const ALICE_LIFECYCLE_GRANT=join(homedir(),'Library/Application Support/ioant-openclaw-ops/alice-client-lifecycle-grant.json');
export const PRIOR_DENIED_RESTART='alice_idle_late_drift_safe_reload_after_audit_20261102_h01';
const hash=x=>createHash('sha256').update(x).digest('hex');
const keys=(o,k)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===[...k].sort().join(',');
export function aliceRepositoryEnrolled(p){
 const origins=new Set(['git@github.com:hedydev/ioant-AI-Minecraft-Alice.git','https://github.com/hedydev/ioant-AI-Minecraft-Alice.git','https://github.com/hedydev/ioant-AI-Minecraft-Alice']);
 return p?.agent==='alice-ai'&&['hedydev/ioant-AI-Minecraft-Alice','github.com/hedydev/ioant-AI-Minecraft-Alice'].includes(p.repository)&&Array.isArray(p.origins)&&p.origins.length>0&&p.origins.every(o=>origins.has(o));
}
export function validateAliceLifecycleGrant(g){
 if(!keys(g,['schemaVersion','project','agent','repository','taskFile','taskSha256','scriptSha256','authorization'])||g.schemaVersion!==1||
  g.project!=='alice-ai'||g.agent!=='alice-ai'||g.repository!=='hedydev/ioant-AI-Minecraft-Alice'||g.taskFile!==ALICE_RESTART_TASK||
  !/^[a-f0-9]{64}$/.test(g.taskSha256??'')||!/^[a-f0-9]{64}$/.test(g.scriptSha256??'')||
  !keys(g.authorization,['approvedBy','scope','reference','priorDeniedOperation','platformReview'])||
  g.authorization.approvedBy!=='local_operator'||g.authorization.scope!=='alice_client_restart_only'||
  g.authorization.reference!=='user_request_20261103'||g.authorization.priorDeniedOperation!==PRIOR_DENIED_RESTART||
  g.authorization.platformReview!=='required')throw Error('invalid_alice_lifecycle_grant');
 return g;
}
export async function aliceLifecycleApproval(binding,{load=()=>readPrivateJson(ALICE_LIFECYCLE_GRANT)}={}){
 if(binding.projectKey!=='alice-ai'||binding.agentId!=='alice-ai')throw Error('alice_lifecycle_wrong_project');
 let g;try{g=validateAliceLifecycleGrant(await load());}catch{throw Error('alice_lifecycle_approval_required');}
 return {...g,approvalSha256:hash(JSON.stringify(g))};
}
export function verifyAliceLifecyclePlan(plan,approval){
 if(plan.taskFile!==ALICE_RESTART_TASK||plan.definitionSha256!==approval.taskSha256||
  plan.steps.length!==2||plan.steps.some(s=>s.script!==ALICE_RESTART_SCRIPT||s.runtime!=='python')||
  JSON.stringify(plan.steps.map(s=>s.args))!==JSON.stringify([['--self-test'],['--restart','@output_dir','@operation_id']])||
  plan.steps.some(s=>s.timeoutSeconds>440)||JSON.stringify(plan.artifacts)!==JSON.stringify([
   {id:'alice_restart',file:'alice_17879_client_restart.json',format:'json'}]))throw Error('alice_lifecycle_plan_not_approved');
}
export async function verifyAliceLifecycleScript(policy,approval){
 const path=join(policy.repo,ALICE_RESTART_SCRIPT),s=await lstat(path);
 if(!s.isFile()||s.isSymbolicLink()||await realpath(path)!==path||s.size>65536||
  hash(await readFile(path))!==approval.scriptSha256)throw Error('alice_lifecycle_script_not_approved');
}
export function validateAliceLifecycleReceipt(r,id){
 const bools=['restartAttempted','processAlive','heartbeatFresh','connected','sessionEstablished','ownerVerified','worldVerified','portVerified','existingTask','bdsRestarted','worldChanged'];
 if(!keys(r,['schemaVersion','operationId','state','failureReason','oldPid','newPid','replacementCount',...bools])||
  r.schemaVersion!==2||r.operationId!==id||!['completed','blocked','inconclusive'].includes(r.state)||
  !/^[a-z_]{1,80}$/.test(r.failureReason??'')||bools.some(k=>typeof r[k]!=='boolean')||
  [r.oldPid,r.newPid].some(p=>p!==null&&(!Number.isSafeInteger(p)||p<=1))||
  ![0,1].includes(r.replacementCount)||r.bdsRestarted||r.worldChanged)throw Error('alice_lifecycle_receipt_unverified');
 if(r.state==='blocked'&&(r.restartAttempted||r.newPid!==null||r.replacementCount!==0))throw Error('alice_lifecycle_receipt_unverified');
 if(r.state==='completed'&&(r.failureReason!=='none'||r.oldPid===null||r.newPid===null||r.oldPid===r.newPid||
  r.replacementCount!==1||r.existingTask||['restartAttempted','processAlive','heartbeatFresh','connected','sessionEstablished','ownerVerified','worldVerified','portVerified'].some(k=>!r[k])))throw Error('alice_lifecycle_receipt_unverified');
 return r;
}
