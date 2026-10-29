// Project-independent task contract. ChatGPT authors these files in the repository.
// Executable code remains visible/pinned in Git; task data never grants permission.
import {createHash} from 'node:crypto';
import {lstat,realpath} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {executionCommand,executionEnvironment,GIT_ARGS} from './project-execution-command.mjs';
import {SHA} from './project-execution-policy.mjs';
const ID=/^[a-z][a-z0-9_-]{0,47}$/;
const own=(x,required,optional=[])=>x&&typeof x==='object'&&!Array.isArray(x)&&
 required.every(k=>Object.hasOwn(x,k))&&Object.keys(x).every(k=>required.includes(k)||optional.includes(k));
const text=(x,max)=>typeof x==='string'&&x.length<=max&&!/[\x00-\x1f\x7f]/.test(x);
export function repositoryPath(value){
 return text(value,240)&&value.length>0&&!value.startsWith('-')&&!/[:\\]/.test(value)&&
  value.split('/').every(part=>part&&part!=='.'&&part!=='..'&&part!=='.git');
}
export function taskFilePath(value){
 return typeof value==='string'&&/^\.openclaw\/tasks\/[a-z][a-z0-9_-]{0,63}\.json$/.test(value);
}
export function parseRepositoryTask(raw){
 if(typeof raw!=='string'||Buffer.byteLength(raw)>16384)throw Error('task_definition_too_large');
 let d;try{d=JSON.parse(raw);}catch{throw Error('invalid_task_json');}
 if(!own(d,['schemaVersion','title','steps'],['artifacts'])||d.schemaVersion!==1||
  !text(d.title,200)||!d.title.trim()||!Array.isArray(d.steps)||d.steps.length<1||d.steps.length>12)
  throw Error('invalid_task_definition');
 const names=new Set();
 for(const s of d.steps){
  if(!own(s,['name','runtime','script'],['args','timeoutSeconds'])||typeof s.name!=='string'||!ID.test(s.name)||names.has(s.name)||
   !['node','python','bash'].includes(s.runtime)||!repositoryPath(s.script)||
   !({node:/\.(?:mjs|cjs|js)$/,python:/\.py$/,bash:/\.sh$/}[s.runtime].test(s.script))||
   s.args!==undefined&&(!Array.isArray(s.args)||s.args.length>24||s.args.some(a=>!text(a,1024)))||
   s.timeoutSeconds!==undefined&&(!Number.isInteger(s.timeoutSeconds)||s.timeoutSeconds<1||s.timeoutSeconds>600))
   throw Error('invalid_task_step');
  names.add(s.name);
 }
 const artifacts=d.artifacts??[];if(!Array.isArray(artifacts)||artifacts.length>8)throw Error('invalid_task_artifacts');
 const ids=new Set();
 for(const a of artifacts){
  if(!own(a,['id','file','format'],['member'])||typeof a.id!=='string'||!ID.test(a.id)||a.id==='execution_log'||ids.has(a.id)||
   !repositoryPath(a.file)||!['text','json','zip_text','zip_json'].includes(a.format)||
   (a.format.startsWith('zip_')? !repositoryPath(a.member):a.member!==undefined))
   throw Error('invalid_task_artifact');
  ids.add(a.id);
 }
 return {schemaVersion:1,title:d.title,steps:d.steps.map(s=>({...s,args:s.args??[],timeoutSeconds:s.timeoutSeconds??60})),
  artifacts,definitionSha256:createHash('sha256').update(raw).digest('hex')};
}
export async function loadRepositoryTask(policy,commit,taskFile,{command=executionCommand}={}){
 if(!SHA.test(commit??'')||!taskFilePath(taskFile)||!Array.isArray(policy.scriptRoots)||
  !policy.scriptRoots.length||policy.scriptRoots.some(p=>!repositoryPath(p)))throw Error('task_scope_unverified');
 const git=async args=>{
  const r=await command('/usr/bin/git',[...GIT_ARGS,...args],{cwd:policy.repo});
  if(!r.ok||r.truncated)throw Error('task_git_read_failed');return r.stdout;
 };
 const regularBlob=async path=>{
  const rows=(await git(['ls-tree','-z',commit,'--',path])).split('\0').filter(Boolean);
  const m=rows.length===1&&rows[0].match(/^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/);
  if(!m||m[3]!==path)throw Error('tracked_regular_task_file_required');return m[2];
 };
 const taskBlob=await regularBlob(taskFile);
 const plan=parseRepositoryTask(await git(['show','--no-textconv',commit+':'+taskFile]));
 for(const step of plan.steps){
  if(!policy.scriptRoots.some(p=>step.script.startsWith(p+'/'))||
   typeof policy.runtimes?.[step.runtime]!=='string'||!policy.runtimes[step.runtime].startsWith('/'))
   throw Error('script_outside_workspace_grant');
  step.blobOid=await regularBlob(step.script);
 }
 return {...plan,commit,taskFile,taskBlob};
}
export async function verifyTaskScript(policy,plan,step,{command=executionCommand}={}){
 const path=resolve(policy.repo,step.script);
 if(!path.startsWith(policy.repo+sep))throw Error('task_script_outside_repository');
 const s=await lstat(path);
 if(!s.isFile()||s.isSymbolicLink()||await realpath(path)!==path)throw Error('task_script_unverified');
 for(const [args,expected] of [
  [['rev-parse','--verify','HEAD'],plan.commit],
  [['hash-object','--no-filters','--',step.script],step.blobOid]]){
  const r=await command('/usr/bin/git',[...GIT_ARGS,...args],{cwd:policy.repo});
  if(!r.ok||r.stdout.trim()!==expected)throw Error('task_script_revision_changed');
 }
}
export async function executeRepositoryTask(plan,policy,{operationId,outputDir,step,
 verify=verifyTaskScript}={}){
 const env={...executionEnvironment(),OPENCLAW_OPERATION_ID:operationId,OPENCLAW_OUTPUT_DIR:outputDir};
 for(const item of plan.steps){
  await verify(policy,plan,item);
  const args=item.args.map(a=>a==='@output_dir'?outputDir:a==='@operation_id'?operationId:a);
  await step(item.name,policy.runtimes[item.runtime],[join(policy.repo,item.script),...args],
   {timeout:item.timeoutSeconds*1000,env});
 }
 return {taskFile:plan.taskFile,definitionSha256:plan.definitionSha256,
  completedSteps:plan.steps.length,artifacts:plan.artifacts};
}
