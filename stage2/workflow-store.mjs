// Private durable multi-worker workflow ledger. No browser/model/agent/shell execution.
// All mutations are serialized by exclusive mkdir and revision-checked reducer.
import {mkdir,lstat,realpath,open,readFile,rename,unlink,rmdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createWorkflow,validateWorkflow,applyWorkflowEvent,workflowSummary} from './workflow-engine.mjs';
const RE=/^[a-z][a-z0-9-]{2,63}$/;
const SIZE=2*1024*1024;
const uid=()=>typeof process.getuid==='function'?process.getuid():null;
const isPrivateDir=s=>s.isDirectory()&&!s.isSymbolicLink()&&
  (s.mode&0o077)===0&&(uid()===null||s.uid===uid());
const isPrivateFile=s=>s.isFile()&&!s.isSymbolicLink()&&
  (s.mode&0o077)===0&&(uid()===null||s.uid===uid())&&s.size<=SIZE;
function required(ok,code){if(!ok)throw Error(code)}
function resolveRoot(root){
 if(root!==undefined){
  required(process.env.IOANT_WORKFLOW_TEST_ROOT==='1','injected_root_not_authorized');
  return resolve(root);
 }
 const volume=process.env.IOANT_DEV_VOLUME;
 const cache=process.env.PROJECT_DEV_CACHE;
 required(volume==='/Volumes/LunaDrive'&&
   cache==='/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos',
   'untrusted_workflow_cache');
 return join(cache,'chat-projects','workflows');
}
async function exactPrivateDir(p){
 const st=await lstat(p);
 required(isPrivateDir(st)&&await realpath(p)===p,'unsafe_workflow_directory');
}
async function ensureRoot(root){
 // Do not silently traverse or create an uncontrolled tree.
 const parent=dirname(root);
 await exactPrivateDir(dirname(parent));
 try{await mkdir(parent,{mode:0o700})}catch(e){if(e.code!=='EEXIST')throw e}
 await exactPrivateDir(parent);
 try{await mkdir(root,{mode:0o700})}catch(e){if(e.code!=='EEXIST')throw e}
 await exactPrivateDir(root);
}
function filePath(root,id){
 required(RE.test(id??''),'invalid_workflow_id');
 return join(root,id+'.json');
}
async function readPrivateJson(path){
 const st=await lstat(path);
 required(isPrivateFile(st),'unsafe_workflow_file');
 const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  required(isPrivateFile(await fd.stat()),'unsafe_workflow_file');
  const raw=await fd.readFile('utf8');
  required(Buffer.byteLength(raw,'utf8')<=SIZE,'oversize_workflow');
  let value;try{value=JSON.parse(raw)}catch{throw Error('malformed_workflow')}
  return validateWorkflow(value);
 }finally{await fd.close()}
}
async function syncDir(dir){
 const fd=await open(dir,'r');
 try{await fd.sync()}finally{await fd.close()}
}
async function atomicWrite(path,data,{create=false}={}){
 const raw=JSON.stringify(validateWorkflow(data))+'\n';
 required(Buffer.byteLength(raw,'utf8')<=SIZE,'oversize_workflow');
 if(create){
  const fd=await open(path,'wx',0o600);
  try{await fd.writeFile(raw);await fd.sync()}finally{await fd.close()}
  await syncDir(dirname(path));return;
 }
 const tmp=path+'.'+randomUUID()+'.tmp';
 let fd;
 try{
  fd=await open(tmp,'wx',0o600);
  await fd.writeFile(raw);await fd.sync();await fd.close();fd=null;
  await rename(tmp,path);await syncDir(dirname(path));
 }catch(e){
  if(fd)await fd.close().catch(()=>{});
  await unlink(tmp).catch(()=>{});
  throw e;
 }
}
async function lock(root,id,fn){
 const dir=join(root,id+'.lock');
 let created=false,marker=null;
 try{
  await mkdir(dir,{mode:0o700});
  created=true;
 }catch(e){
  if(e.code==='EEXIST')throw Error('workflow_lock_busy');
  throw e;
 }
 const nonce=randomUUID();
 try{
  await exactPrivateDir(dir);
  marker=join(dir,'owner.json');
  const fd=await open(marker,'wx',0o600);
  try{await fd.writeFile(JSON.stringify({pid:process.pid,nonce}));await fd.sync()}
  finally{await fd.close()}
  return await fn();
 }finally{
  // Refuse to erase a replaced/unknown lock. Crashed owners require manual review.
  if(created&&marker){
   try{
    await exactPrivateDir(dir);
    const m=JSON.parse(await readFile(marker,'utf8'));
    if(m.nonce===nonce&&m.pid===process.pid){
      await unlink(marker);await rmdir(dir);
    }
   }catch{/* preserve ambiguous lock */}
  }
 }
}
export async function initializeWorkflow(workflowId,{root}={}){
 const base=resolveRoot(root);await ensureRoot(base);
 const path=filePath(base,workflowId);
 return lock(base,workflowId,async()=>{
  await atomicWrite(path,createWorkflow(workflowId),{create:true});
  return {state:'created',...workflowSummary(await readPrivateJson(path))};
 });
}
export async function inspectWorkflow(workflowId,{root}={}){
 const base=resolveRoot(root);
 await exactPrivateDir(base);
 const result=await readPrivateJson(filePath(base,workflowId));
 required(result.id===workflowId,'workflow_id_mismatch');
 return {snapshot:result,summary:workflowSummary(result)};
}
export async function transactWorkflow(workflowId,event,{root}={}){
 const base=resolveRoot(root);
 await exactPrivateDir(base);
 return lock(base,workflowId,async()=>{
  const path=filePath(base,workflowId);
  const previous=await readPrivateJson(path);
  required(previous.id===workflowId,'workflow_id_mismatch');
  const next=applyWorkflowEvent(previous,event);
  await atomicWrite(path,next);
  const verified=await readPrivateJson(path);
  required(verified.id===workflowId&&verified.revision===next.revision,'workflow_write_unverified');
  return {state:'committed',eventId:event.id,...workflowSummary(verified)};
 });
}
