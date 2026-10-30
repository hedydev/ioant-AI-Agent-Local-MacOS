import {homedir} from 'node:os';
import {readPrivateJson} from '../stage2/workflow-capabilities.mjs';
import {inspectDirectAgent} from '../integrations/chatgpt-openclaw/agent.mjs';
import {executionPolicy} from '../integrations/chatgpt-openclaw/project-execution-policy.mjs';
import {join} from 'node:path';
import {readdir,lstat} from 'node:fs/promises';
import {registeredProjectBindings} from '../integrations/chatgpt-openclaw/project-binding.mjs';
import {readRepositoryTaskGrants} from '../integrations/chatgpt-openclaw/repository-task-policy.mjs';
import {ProjectExecutionStore} from '../integrations/chatgpt-openclaw/project-execution-store.mjs';
import {privateDirectory,privateRead,privateJsonFiles} from './private-files.mjs';
import {PRIVATE_ROOT,AUDIT_ROOT} from './config.mjs';
import {cleanText} from './diagnostics.mjs';

const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,100}$/.test(x)?x:undefined;
export function usedCapabilities(r,kind){
 const result=kind==='execution'?r:r.result??r;
 if(kind==='computer')return result.toolsUsed??(result.computerToolSucceeded===true?{evidence:'legacy_computer_receipt',successful:['computer']}:{evidence:'unavailable',successful:[]});
 if(kind==='execution')return {evidence:'executor_steps',successful:[...new Set((r.steps??[]).filter(s=>s.state==='passed').map(s=>s.capability??(s.name==='fetch'||s.name==='fetched_commit'||s.name==='validate_tree'||s.name==='fast_forward'||s.name==='isolated_checkout'?'git':null)).filter(Boolean))],subprocessesEnumerated:false};
 return {evidence:'connection_receipt',successful:result.state==='connected'?['project_connect']:[]};
}
export function activityRow(r,kind,project){
 const result=kind==='execution'?r:r.result??r;
 const state=result.state??r.state;
 if(!id(r.operationId)||!id(project??result.project_key??result.project)||!id(state))return null;
 const row={id:kind+':'+(project??result.project_key??result.project)+':'+r.operationId,operationId:r.operationId,kind,
  project:project??result.project_key??result.project,state,
  startedAt:r.startedAt??r.createdAt??r.started_at??null,finishedAt:r.finishedAt??r.finished_at??null,
  action:id(r.input?.action),reason:id(result.reason),agent:id(result.agent??r.agent),
  cached:['passed','failed','blocked','inconclusive','returned','connected'].includes(state),
  toolsUsed:usedCapabilities(r,kind),
  modelInferenceInvoked:kind==='execution'?r.modelInferenceInvoked===true:undefined};
 if(kind==='execution')Object.assign(row,{
  commit:/^[a-f0-9]{40}$/.test(r.actualCommit)?r.actualCommit:null,worktreeClean:r.worktreeClean===true,
  steps:Array.isArray(r.steps)?r.steps.map(s=>({name:id(s.name),state:id(s.state),capability:id(s.capability),runtime:id(s.runtime),script:typeof s.script==='string'?cleanText(s.script):undefined,exitCode:s.exitCode,startedAt:s.startedAt,finishedAt:s.finishedAt})):[],
  artifacts:[{id:'execution_log'},...(r.artifacts??[]).map(a=>({id:id(a.artifact),bytes:a.bytes,format:id(a.format)}))]});
 return row;
}
export async function loadActivity({parent=PRIVATE_ROOT,bindings=registeredProjectBindings(),grants=readRepositoryTaskGrants(),configLoad=()=>readPrivateJson(join(homedir(),'.openclaw/openclaw.json')),inspect=inspectDirectAgent,policy=executionPolicy}={}){
 const activities=[],projects=[];let config;try{config=await configLoad();}catch{}
 for(const b of Object.values(bindings)){
  const g=grants.projects[b.projectKey];
  const checkoutName=g?.repo?.split('/').at(-1)??b.projectKey;
  const isTest=/^mcp-(backend|generic)-acceptance-/.test(checkoutName);
  const status=config?await inspect({binding:b,load:async()=>config}):null;
  const repositoryTask=Boolean(g||await policy(b));
  projects.push({permissions:{state:status?.state??'unverified',toolAccess:status?.toolAccess??'unverified',computer:status?status.computerControlEnabled===true:null,repositoryTask},key:b.projectKey,agent:b.agentId,repository:g?.repository??null,branch:g?.branch??null,
   removable:b.projectKey.startsWith('repo-'),name:checkoutName,kind:isTest?'test':'project'});
  for(const [kind,prefix] of [['execution','direct-project-execution-'],['computer','direct-computer-']]){
   for(const {path} of await privateJsonFiles(join(parent,prefix+b.projectKey),100)){
    try{const row=activityRow(JSON.parse(await privateRead(path)),kind,b.projectKey);if(row)activities.push(row);}catch{}}
  }
 }
 for(const {path} of await privateJsonFiles(join(parent,'direct-workspace-connect'),100)){
  try{const row=activityRow(JSON.parse(await privateRead(path)),'connect');if(row)activities.push(row);}catch{}}
 activities.sort((a,b)=>Date.parse(b.finishedAt??b.startedAt??0)-Date.parse(a.finishedAt??a.startedAt??0));
 return {projects,activities:activities.slice(0,150)};
}
export async function activityReport({project,operationId,artifact='execution_log',offset=0},{bindings=registeredProjectBindings(),parent=PRIVATE_ROOT}={}){
 if(!id(project)||!id(operationId)||!/^[a-z][a-z0-9_-]{0,47}$/.test(artifact)||!Number.isSafeInteger(offset)||offset<0||offset>262144)throw Error('invalid_report_request');
 const b=bindings[project];if(!b)throw Error('project_not_registered');
 return new ProjectExecutionStore(b,{parent}).report(operationId,offset,artifact);
}
export async function recentMcpEvents({root=AUDIT_ROOT}={}){
 try{
  await privateDirectory(root);const names=(await readdir(root)).filter(n=>/^session-[a-f0-9-]{36}$/.test(n));
  const sessions=(await Promise.all(names.map(async name=>({name,mtime:(await lstat(join(root,name))).mtimeMs})))).sort((a,b)=>b.mtime-a.mtime).slice(0,24).map(x=>x.name);
  const rows=[];
  // Bounded sessions and per-process segments; never read transcript or tool arguments.
  for(const name of sessions.slice(-24))for(const part of ['events.jsonl','events.1.jsonl','events.2.jsonl','events.3.jsonl']){
   try{const text=await privateRead(join(root,name,part),512*1024);
    for(const line of text.trim().split('\n').slice(-100)){const r=JSON.parse(line);if(['mcp_call_started','mcp_call_finished'].includes(r.event))rows.push(r);}
   }catch{}
  }
  return rows.sort((a,b)=>Date.parse(b.ts)-Date.parse(a.ts)).slice(0,150);
 }catch{return [];}
}
