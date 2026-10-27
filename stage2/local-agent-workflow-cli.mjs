#!/usr/bin/env node
// Explicit local logical workflow DAG. No Agent invocation or ChatGPT browser IO.
// A Mac operator may initialize a PRESET private workflow; no arbitrary tasks.
import {initializeWorkflow,inspectWorkflow,transactWorkflow} from './workflow-store.mjs';
import {buildLocalAgentPlan,proposeLocalDispatch,verifyLocalAgentBindings,
 ROLE_ROUTES,STAGES,VALID_PROJECTS} from './local-agent-workflow.mjs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const IDS=Object.freeze({'alice-ai':'alice-local-pilot','openclaw-workflow':'openclaw-local-pilot'});
const label='IOANT_LOCAL_AGENT_WORKFLOW';
const reply=(state,projectKey,extra={})=>({audit:label,schemaVersion:1,state,projectKey,
 executionAuthorized:false,...extra});
function idFor(key){
 if(!VALID_PROJECTS.has(key)||!Object.hasOwn(IDS,key))throw Error('unregistered_dispatch_project');
 return IDS[key];
}
export function workflowPreview(projectKey){
 const workflowId=idFor(projectKey);
 const {ledger,summary}=buildLocalAgentPlan(workflowId,{projectKey});
 return reply('preview',projectKey,{workflowId,summary,
  dispatch:proposeLocalDispatch(ledger,{projectKey}),logicalRolesOnly:true});
}
export async function workflowStatus(projectKey,store={}){
 const workflowId=idFor(projectKey);
 const {snapshot,summary}=await inspectWorkflow(workflowId,store);
 const binding=verifyLocalAgentBindings(snapshot,{projectKey});
 if(!binding.rolesVerified)throw Error('unexpected_worker_roles');
 return reply('observed',projectKey,{workflowId,summary,
  dispatch:proposeLocalDispatch(snapshot,{projectKey}),logicalRolesOnly:true});
}
export async function workflowBootstrap(projectKey,store={}){
 const workflowId=idFor(projectKey);
 // Creates a fresh ledger with exclusive claim; no overwrite, resume, cleanup,
 // command invocation, Agent provisioning or browser message.
 await initializeWorkflow(workflowId,store);
 let revision=0,index=0;
 const apply=async(type,payload)=>{
  const result=await transactWorkflow(workflowId,{
   id:'route-event-'+(++index),type,at:new Date().toISOString(),
   expectedRevision:revision,...payload
  },store);
  revision=result.revision;
 };
 for(const role of ROLE_ROUTES){
  await apply('worker_register',{worker:{id:role.workerId,capabilities:[role.capability]}});
  await apply('agent_bind',{workerId:role.workerId,agentId:role.agentId});
 }
 for(const stage of STAGES){
  await apply('task_add',{task:{id:stage.taskId,kind:stage.kind,
   agentId:stage.agentId,dependsOn:[...stage.dependsOn]}});
 }
 return {...await workflowStatus(projectKey,store),state:'created'};
}
async function main(args){
 if(args.length!==2||!['preview','status','bootstrap'].includes(args[0]))
  return reply('blocked',null,{reason:'usage_preview_status_bootstrap'});
 const key=args[1];
 if(!VALID_PROJECTS.has(key))return reply('blocked',null,{reason:'unregistered_dispatch_project'});
 if(args[0]==='preview')return workflowPreview(key);
 return args[0]==='status'?workflowStatus(key):workflowBootstrap(key);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const result=await main(process.argv.slice(2));
  console.log(JSON.stringify(result));
  if(result.state==='blocked')process.exitCode=1;
 }catch(e){
  const publicErrors=new Set(['unregistered_dispatch_project','unexpected_worker_roles',
   'workflow_lock_busy','untrusted_workflow_cache','injected_root_not_authorized']);
  const reason=publicErrors.has(e.message)?e.message:
   e.code==='EEXIST'?'workflow_already_exists':'local_workflow_unavailable';
  console.log(JSON.stringify(reply('blocked',null,{reason})));
  process.exitCode=1;
 }
}
