#!/usr/bin/env node
// Fixed one-shot AliceAI REQUIREMENTS advisor pilot. Runs only an approved,
// no-tools, local Agent and requires a separately reviewed acceptance barrier.
import {readFile,realpath,lstat,open} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {inspectWorkflow,transactWorkflow} from './workflow-store.mjs';
import {buildLocalAgentPlan,verifyLocalAgentBindings,proposeLocalDispatch} from './local-agent-workflow.mjs';
import {execNative} from './openclaw-ollama-provision.mjs';
import {verifyBoundAgentConfig,inspectBoundWorkspace} from './development-agent-route.mjs';
import {discussBoundAgent} from './openclaw-agent-dev-discuss.mjs';
const PROJECT='alice-ai',WORKFLOW='alice-local-pilot',TASK='requirements';
const WORKER='analysis-worker',AGENT='alice-ai';
const BASE='/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos/chat-projects/workflows';
const AUDIT='IOANT_LOCAL_AGENT_REQUIREMENTS_PILOT';
const PROMPT='你是运行在本地、没有任何工具权限的 AliceAI 需求分析顾问。请为一个 Minecraft Bedrock AliceAI 开发项目的多 Agent 协作流程提出可验证的需求说明：由 ChatGPT 总协调，需求分析与技术架构协作，开发与测试协作，最后独立验收；生产 Minecraft/BDS 不应自动修改。输出 4 到 6 条简短、可验收的需求与主要风险。你不能读取仓库、终端、浏览器或实时游戏状态；明确区分建议与已验证事实。不要包含 shell 命令、账号信息或工具调用。';
const DEFAULT_CLOCK=()=>new Date();
const DEFAULT_NONCE=()=>randomBytes(12).toString('hex');
const sha=x=>createHash('sha256').update(x).digest('hex');
const privDir=s=>s.isDirectory()&&!s.isSymbolicLink()&&(s.mode&0o077)===0&&
 (typeof process.getuid!=='function'||s.uid===process.getuid());
const privFile=s=>s.isFile()&&!s.isSymbolicLink()&&(s.mode&0o077)===0&&
 (typeof process.getuid!=='function'||s.uid===process.getuid());
const report=(state,extra={})=>({audit:AUDIT,schemaVersion:1,state,
 projectKey:PROJECT,workflowId:WORKFLOW,taskId:TASK,modelAgentId:AGENT,
 externalChatWrite:false,hostToolAccess:false,automaticAcceptance:false,...extra});
function assert(ok,why){if(!ok)throw Error(why);}
function liveStoreRoot(){
 assert(process.env.IOANT_DEV_VOLUME==='/Volumes/LunaDrive'&&
  process.env.PROJECT_DEV_CACHE===
   '/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos',
  'untrusted_workflow_cache');
 return BASE;
}
async function inspectPrivateBase(root){
 const path=root??liveStoreRoot();
 assert(await realpath(path)===path&&privDir(await lstat(path)),'untrusted_evidence_directory');
 return path;
}
function validateInitial(snapshot){
 const baseline=buildLocalAgentPlan(WORKFLOW,{projectKey:PROJECT}).ledger;
 assert(snapshot.revision===21&&snapshot.receipts.length===0&&
  isDeepStrictEqual(snapshot.workers,baseline.workers)&&
  isDeepStrictEqual(snapshot.bindings,baseline.bindings)&&
  isDeepStrictEqual(snapshot.tasks,baseline.tasks)&&
  snapshot.events.length===21&&snapshot.events.every((e,i)=>
   e.id==='route-event-'+(i+1)&&e.type===baseline.events[i].type),
  'workflow_not_initial');
 assert(verifyLocalAgentBindings(snapshot,{projectKey:PROJECT}).rolesVerified,
  'binding_changed');
 const route=proposeLocalDispatch(snapshot,{projectKey:PROJECT});
 assert(route.proposals.length===1&&route.proposals[0].state==='candidate'&&
  route.proposals[0].taskId===TASK&&route.proposals[0].workerId===WORKER,
  'task_not_unique_candidate');
}
export async function inspectRequirementsPilot({store={}}={}){
 const {snapshot,summary}=await inspectWorkflow(WORKFLOW,store);
 const task=snapshot.tasks.find(t=>t.id===TASK);
 const initial=task?.status==='pending'&&snapshot.revision===21;
 if(initial)validateInitial(snapshot);
 return report('observed',{revision:summary.revision,ready:summary.ready,
  taskStatus:task?.status??'unknown',receipts:summary.receipts,
  initialEligible:initial,executionAuthorized:false});
}
export async function runRequirementsPilot({
 store={},root,config=execNative,workspace=inspectBoundWorkspace,
 invoke=discussBoundAgent,clock=DEFAULT_CLOCK,nonce=DEFAULT_NONCE
}={}){
 const out=report('blocked');
 if((root!==undefined||config!==execNative||workspace!==inspectBoundWorkspace||
     invoke!==discussBoundAgent||clock!==DEFAULT_CLOCK||nonce!==DEFAULT_NONCE)&&
    process.env.IOANT_WORKFLOW_TEST_ROOT!=='1')
  return {...out,reason:'test_injection_forbidden'};
 if(process.env.OPENCLAW_CONFIG_PATH||process.env.OPENCLAW_STATE_DIR||process.env.OPENCLAW_PROFILE)
  return {...out,reason:'custom_openclaw_profile'};
 try{
  const base=await inspectPrivateBase(root);
  const {snapshot}=await inspectWorkflow(WORKFLOW,store);
  validateInitial(snapshot);
  const live=await config('config.get',{});
  if(!verifyBoundAgentConfig(live,AGENT)||
     await workspace(AGENT)!=='present_private')
   return {...out,reason:'advisor_policy_unverified'};
  const at=clock();
  assert(at instanceof Date&&Number.isFinite(at.getTime()),'invalid_clock');
  const lease='lease-'+nonce();
  assert(/^lease-[a-f0-9]{24}$/.test(lease),'invalid_lease_nonce');
  const leaseTime=new Date(at.getTime()+600000).toISOString();
  const session=sha(WORKFLOW+':'+TASK+':'+lease).slice(0,24);
  let revision=snapshot.revision;
  const update=async(type,extra)=>{
   const result=await transactWorkflow(WORKFLOW,{
    id:'pilot-'+type+'-'+lease,expectedRevision:revision,
    type,at:clock().toISOString(),taskId:TASK,...extra
   },store);
   revision=result.revision;
  };
  // Both state transitions are durable before invoking. Crashes/uncertain
  // replies leave a non-pending task and NEVER cause a duplicate model call.
  await update('task_claim',{workerId:WORKER,leaseId:lease,leaseUntil:leaseTime});
  await update('task_start',{workerId:WORKER,leaseId:lease});
  let result;
  try{result=await invoke({agentId:AGENT,prompt:PROMPT,chatDigest:session});}
  catch{result={state:'inconclusive',note:'local_agent_invocation_failed'};}
  const passed=result?.state==='answered'&&typeof result.text==='string'&&
   result.text.trim().length>0&&result.text.length<=1150;
  const note=passed?'model_response_received':
   typeof result?.note==='string'&&/^[a-z_]{3,80}$/.test(result.note)?
    result.note:'agent_reply_unverified';
  const evidence={schemaVersion:1,projectKey:PROJECT,workflowId:WORKFLOW,
   taskId:TASK,leaseId:lease,agentId:AGENT,
   result:passed?'passed':'failed',note,
   reply:passed?result.text:null,recordedAt:clock().toISOString(),
   untrustedModelText:true};
  const bytes=JSON.stringify(evidence)+'\n',digest=sha(bytes);
  assert(Buffer.byteLength(bytes,'utf8')<=4096,'evidence_too_large');
  const file=join(base,'alice-requirements-'+lease+'.json');
  const fd=await open(file,'wx',0o600);
  try{await fd.writeFile(bytes);await fd.sync();}finally{await fd.close();}
  assert(privFile(await lstat(file))&&await realpath(file)===file&&
   sha(await readFile(file))===digest,'evidence_write_unverified');
  await update('task_receipt',{workerId:WORKER,leaseId:lease,
   receiptId:'receipt-'+lease,result:passed?'passed':'failed',
   evidenceSha256:digest});
  return report(passed?'verification_pending':'failed',{revision,
   receiptId:'receipt-'+lease,evidenceSha256:digest,
   modelReplyChars:passed?result.text.length:0,
   note,modelInvoked:true,modelReplyIsUntrusted:true});
 }catch(e){
  const publicReasons=new Set(['workflow_not_initial','binding_changed',
   'task_not_unique_candidate','advisor_policy_unverified','untrusted_workflow_cache',
   'untrusted_evidence_directory','custom_openclaw_profile']);
  return {...out,reason:publicReasons.has(e.message)?e.message:
   'preflight_or_execution_inconclusive'};
 }
}
async function main(argv){
 if(argv.length!==1||!['status','run'].includes(argv[0]))
  return report('blocked',{reason:'usage_status_or_run'});
 return argv[0]==='status'?inspectRequirementsPilot():runRequirementsPilot();
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const r=await main(process.argv.slice(2));
  console.log(JSON.stringify(r));
  if(!['observed','verification_pending'].includes(r.state))process.exitCode=1;
 }catch{
  console.log(JSON.stringify(report('blocked',{reason:'workflow_unavailable'})));
  process.exitCode=1;
 }
}
