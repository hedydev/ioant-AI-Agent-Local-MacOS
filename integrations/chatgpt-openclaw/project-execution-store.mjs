// Persistent claims, project-wide serialization and bounded private text reports.
import {lstat,realpath,mkdir,readFile,writeFile,rename,unlink,readdir,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {operationId} from './computer-task-store.mjs';
import {EXECUTION_PARENT} from './project-execution-policy.mjs';

const FINAL=new Set(['passed','failed','blocked','inconclusive']);
export const finalExecution=state=>FINAL.has(state);
export const EXECUTION_HISTORY_LIMIT=500;
export async function privateExecutionPath(path,directory=false){
 const s=await lstat(path);
 if((directory?!s.isDirectory():!s.isFile())||s.isSymbolicLink()||s.uid!==process.getuid()||
  (s.mode&0o077)!==0||await realpath(path)!==path)throw Error('private_execution_path_required');
 return s;
}
export class ProjectExecutionStore{
 constructor(binding,{parent=EXECUTION_PARENT}={}){
  if(!/^[a-z][a-z0-9-]{0,47}$/.test(binding.projectKey))throw Error('invalid_project');
  this.binding=binding;this.parent=parent;this.dir=join(parent,'direct-project-execution-'+binding.projectKey);
 }
 async admit(){
  await privateExecutionPath(this.parent,true);
  try{await mkdir(this.dir,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
  await privateExecutionPath(this.dir,true);
 }
 path(id,suffix='json'){
  if(typeof id!=='string'||!operationId.test(id)||!['json','log'].includes(suffix))throw Error('invalid_operation_id');
  return join(this.dir,id+'.'+suffix);
 }
 async archivedDirectory(id){
  this.path(id);const root=join(this.dir,'archive');
  await privateExecutionPath(root,true);const dir=join(root,id);await privateExecutionPath(dir,true);return dir;
 }
 async readPath(id,name){
  // Publish the archive before removing hot files. A racing reader can always
  // fall back, including readers that fetched the receipt before maintenance.
  const hot=join(this.dir,name);try{await privateExecutionPath(hot);return hot;}
  catch(e){if(e.code!=='ENOENT')throw e;}
  const archived=join(await this.archivedDirectory(id),name);await privateExecutionPath(archived);return archived;
 }
 async readStored(id,name,limit){
  this.path(id);
  for(let attempt=0;attempt<2;attempt++){
   let file;
   try{
    const path=attempt===0?await this.readPath(id,name):join(await this.archivedDirectory(id),name);
    await privateExecutionPath(path);file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
    const s=await file.stat();
    if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)!==0)throw Error('private_execution_path_required');
    if(s.size>limit)throw Error(limit===65536?'execution_receipt_too_large':'execution_report_too_large');
    return await file.readFile('utf8');
   }catch(e){if(e.code!=='ENOENT'||attempt===1)throw e;}
   finally{await file?.close();}
  }
 }
 async get(id){
  await this.admit();this.path(id);let text;
  try{text=await this.readStored(id,id+'.json',65536);}catch(e){if(e.code==='ENOENT')return null;throw e;}
  const r=JSON.parse(text);
  if(r.schemaVersion!==1||r.operationId!==id||r.project!==this.binding.projectKey||
   r.agent!==this.binding.agentId||!SHA256.test(r.digest??'')||
   !['accepted','running',...FINAL].includes(r.state)||!Array.isArray(r.steps))throw Error('invalid_execution_receipt');
  return r;
 }
 async begin(input,digest){
  await this.admit();const old=await this.get(input.operation_id);if(old)return {created:false,record:old};
  if((await readdir(this.dir)).filter(n=>n.endsWith('.json')).length>=EXECUTION_HISTORY_LIMIT)throw Error('execution_history_full');
  const record={schemaVersion:1,operationId:input.operation_id,project:this.binding.projectKey,
   agent:this.binding.agentId,digest,input,state:'accepted',steps:[],createdAt:new Date().toISOString(),
   executor:'mcp_fixed_project_runner',modelInferenceInvoked:false,workerUsed:false};
  try{await writeFile(this.path(input.operation_id),JSON.stringify(record)+'\n',{mode:0o600,flag:'wx'});}
  catch(e){if(e.code==='EEXIST')return {created:false,record:await this.get(input.operation_id)};throw e;}
  try{await writeFile(join(this.dir,'active.lock'),JSON.stringify({operationId:input.operation_id,digest}),{mode:0o600,flag:'wx'});}
  catch(e){
   if(e.code!=='EEXIST')throw e;
   await this.save({...record,state:'blocked',reason:'project_execution_busy',finishedAt:new Date().toISOString()});
   return {created:false,record:await this.get(input.operation_id)};
  }
  return {created:true,record};
 }
 async save(record){
  const previous=await this.get(record.operationId);
  if(!previous||previous.digest!==record.digest||finalExecution(previous.state))throw Error('execution_state_conflict');
  const tmp=join(this.dir,'.receipt-'+randomUUID()+'.tmp');
  await writeFile(tmp,JSON.stringify({...record,updatedAt:new Date().toISOString()})+'\n',{mode:0o600,flag:'wx'});
  await rename(tmp,this.path(record.operationId));
 }
 async owns(id,digest){
  const path=join(this.dir,'active.lock');await privateExecutionPath(path);
  const r=JSON.parse(await readFile(path,'utf8'));return r.operationId===id&&r.digest===digest;
 }
 async release(id,digest){
  if(!await this.owns(id,digest))throw Error('execution_lock_conflict');
  await unlink(join(this.dir,'active.lock'));
 }
 async outputDirectory(id){
  await this.get(id);this.path(id);
  const dir=join(this.dir,id+'.output');
  try{await mkdir(dir,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
  await privateExecutionPath(dir,true);return dir;
 }
 async writeLog(id,text){
  if(Buffer.byteLength(text)>262144)throw Error('execution_log_too_large');
  const path=this.path(id,'log'),tmp=join(this.dir,'.log-'+randomUUID()+'.tmp');
  await writeFile(tmp,text,{mode:0o600,flag:'wx'});await rename(tmp,path);
  return {artifact:'execution_log',bytes:Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex')};
 }
 async writeArtifact(id,artifact,{text,format,sourceSha256,redactionApplied}){
  this.path(id);
  if(!/^[a-z][a-z0-9_-]{0,47}$/.test(artifact)||artifact==='execution_log'||Buffer.byteLength(text)>262144)
   throw Error('invalid_artifact');
  const path=join(this.dir,id+'.artifact-'+artifact+'.txt');
  await writeFile(path,text,{mode:0o600,flag:'wx'});
  return {artifact,format,sourceSha256,redactionApplied,bytes:Buffer.byteLength(text),
   sha256:createHash('sha256').update(text).digest('hex')};
 }
 async report(id,offset=0,artifact='execution_log'){
  if(!Number.isSafeInteger(offset)||offset<0||offset>262144)throw Error('invalid_report_offset');
  const r=await this.get(id);
  if(!r)return {state:'not_found',operationId:id};
  if(!finalExecution(r.state))return {state:'pending',operationId:id,doNotRepeat:true};
  if(typeof artifact!=='string'||!/^[a-z][a-z0-9_-]{0,47}$/.test(artifact))throw Error('invalid_artifact');
  const meta=artifact==='execution_log'?r.report:r.artifacts?.find(a=>a.artifact===artifact);
  if(!meta)return {state:'unavailable',operationId:id,reason:'no_declared_artifact'};
  const name=artifact==='execution_log'?id+'.log':id+'.artifact-'+artifact+'.txt';
  const text=await this.readStored(id,name,262144);
  if(createHash('sha256').update(text).digest('hex')!==meta.sha256)throw Error('execution_report_changed');
  if(offset>text.length)throw Error('invalid_report_offset');
  const logText=text.slice(offset,offset+4000),next=offset+logText.length;
  return {state:'report',project:r.project,operationId:id,artifact,
   sha256:meta.sha256,offset,nextOffset:next<text.length?next:null,logText,
   pageCharacters:logText.length,totalCharacters:text.length,
   contentIsUntrusted:true,truncated:r.logTruncated===true};
 }
}
const SHA256=/^[0-9a-f]{64}$/;
