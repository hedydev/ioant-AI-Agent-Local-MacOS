// Local maintenance only. Archives retain full receipts and report hashes; no
// execution claim, uncertain lease, user workspace or output directory is reset.
import {join} from 'node:path';
import {readdir,lstat,mkdir,writeFile,rename,unlink,copyFile,rm,utimes} from 'node:fs/promises';
import {constants} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {ProjectExecutionStore,EXECUTION_HISTORY_LIMIT,privateExecutionPath} from '../integrations/chatgpt-openclaw/project-execution-store.mjs';
import {operationId} from '../integrations/chatgpt-openclaw/computer-task-store.mjs';
import {registeredProjectBindings} from '../integrations/chatgpt-openclaw/project-binding.mjs';
import {PRIVATE_ROOT} from './config.mjs';
import {privateDirectory,privateRead,privateWrite} from './private-files.mjs';
import {archiveReadersReady} from '../integrations/chatgpt-openclaw/archive-reader.mjs';

const settled=new Set(['passed','failed','blocked']);
const hash=text=>createHash('sha256').update(text).digest('hex');
async function exists(path){try{await lstat(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function archiveDirectories(store){
 const root=join(store.dir,'archive');if(!await exists(root))return [];
 await privateDirectory(root);const rows=[];
 for(const id of await readdir(root)){
  if(!operationId.test(id))throw Error('invalid_execution_archive');
  const path=join(root,id),s=await privateDirectory(path);rows.push({id,path,mtime:s.mtimeMs});
 }
 return rows;
}
async function hotReceipts(store){
 const rows=[];
 for(const name of await readdir(store.dir))if(name.endsWith('.json')){
  const id=name.slice(0,-5);if(!operationId.test(id))throw Error('invalid_execution_receipt');
  const r=await store.get(id);if(!r)throw Error('execution_history_changed');rows.push(r);
 }
 return rows;
}
async function reportBytes(dir){
 let bytes=0;
 for(const name of await readdir(dir))if(/\.(json|log|txt)$/.test(name)){
  const s=await privateExecutionPath(join(dir,name));bytes+=s.size;
 }
 return bytes;
}
export async function historyStatus(store){
 await store.admit();const hot=await hotReceipts(store),archived=await archiveDirectories(store);
 const hotIds=new Set(hot.map(r=>r.operationId));
 const active=hot.filter(r=>['accepted','running'].includes(r.state)).length;
 const uncertain=hot.filter(r=>r.state==='inconclusive').length;
 let bytes=await reportBytes(store.dir);
 for(const row of archived)bytes+=await reportBytes(row.path);
 const locked=await exists(join(store.dir,'active.lock'));
 return {state:'observed',limit:EXECUTION_HISTORY_LIMIT,hotCount:hot.length,archivedCount:archived.filter(a=>!hotIds.has(a.id)).length,
  settledCount:hot.filter(r=>settled.has(r.state)).length,activeCount:active,uncertainCount:uncertain,
  trackedBytes:bytes,remaining:Math.max(0,EXECUTION_HISTORY_LIMIT-hot.length),
  archiveAllowed:!locked&&active===0,locked,retainRecent:100};
}
export async function recentExecutionFiles(store,limit=100){
 await store.admit();const candidates=[];
 for(const name of await readdir(store.dir))if(name.endsWith('.json')){
  const id=name.slice(0,-5);if(!operationId.test(id))continue;
  const path=join(store.dir,name),s=await privateExecutionPath(path);candidates.push({path,mtime:s.mtimeMs,archived:false,id});
 }
 for(const a of await archiveDirectories(store)){
  const path=join(a.path,a.id+'.json'),s=await privateExecutionPath(path);
  candidates.push({path,mtime:s.mtimeMs,archived:true,id:a.id});
 }
 // A crash after publish can leave both copies. Hot receipt wins; no duplicate UI row.
 const ids=new Set();return candidates.sort((a,b)=>b.mtime-a.mtime).filter(r=>{
  if(ids.has(r.id))return false;ids.add(r.id);return true;
 }).slice(0,limit);
}
async function archiveOne(store,r){
 const id=r.operationId,root=join(store.dir,'archive');await privateDirectory(root,{create:true});
 const destination=join(root,id),files=[{name:id+'.json',text:JSON.stringify(r)+'\n'}];
 // Copy original receipt bytes, not a rewritten approximation.
 files[0].text=await privateRead(store.path(id));
 if(r.report)files.push({name:id+'.log',text:await store.readStored(id,id+'.log',262144),sha:r.report.sha256});
 if(!Array.isArray(r.artifacts??[])||(r.artifacts??[]).length>64)throw Error('invalid_execution_artifact');
 for(const a of r.artifacts??[]){
  if(!/^[a-z][a-z0-9_-]{0,47}$/.test(a.artifact)||a.artifact==='execution_log')throw Error('invalid_execution_artifact');
  files.push({name:id+'.artifact-'+a.artifact+'.txt',text:await store.readStored(id,id+'.artifact-'+a.artifact+'.txt',262144),sha:a.sha256});
 }
 for(const f of files.slice(1))if(!/^[a-f0-9]{64}$/.test(f.sha??'')||hash(f.text)!==f.sha)throw Error('execution_report_changed');
 if(await exists(destination)){
  await privateDirectory(destination);
  for(const f of files)if(await privateRead(join(destination,f.name),262144)!==f.text)throw Error('execution_archive_conflict');
 }else{
  const temp=join(store.dir,'.archive-'+randomUUID());await mkdir(temp,{mode:0o700});
  try{
   for(const f of files){
    const source=join(store.dir,f.name),stat=await privateExecutionPath(source);
    await copyFile(source,join(temp,f.name),constants.COPYFILE_EXCL);
    await utimes(join(temp,f.name),stat.atime,stat.mtime);
    if(await privateRead(join(temp,f.name),262144)!==f.text)throw Error('execution_history_changed');
   }
   await rename(temp,destination); // All archived files become visible together.
  }catch(e){await rm(temp,{recursive:true,force:true});throw e;}
 }
 // Keep a hot receipt until every hot payload has its durable archived fallback.
 for(const f of files.slice(1))await unlink(join(store.dir,f.name)).catch(e=>{if(e.code!=='ENOENT')throw e;});
 await unlink(store.path(id));
}
export async function archiveHistory(input,{bindings=registeredProjectBindings(),parent=PRIVATE_ROOT,readersReady=()=>archiveReadersReady({parent})}={}){
 if(!input||Object.keys(input).sort().join(',')!=='operation_id,project_key,retain_recent'||
  !operationId.test(input.operation_id??'')||!Number.isSafeInteger(input.retain_recent)||input.retain_recent<0||input.retain_recent>400)throw Error('invalid_archive_request');
 const b=bindings[input.project_key];if(!b)throw Error('project_not_registered');
 if(!await readersReady())throw Error('archive_reader_upgrade_required');
 const store=new ProjectExecutionStore(b,{parent});await store.admit();
 const requests=join(store.dir,'archive-requests');await privateDirectory(requests,{create:true});
 const request=join(requests,input.operation_id+'.json'),digest=hash(JSON.stringify([input.project_key,input.operation_id,input.retain_recent]));
 if(await exists(request)){
  const old=JSON.parse(await privateRead(request));if(old.digest!==digest)throw Error('operation_id_conflict');
  return old.result?{...old.result,cached:true}:{state:'inconclusive',reason:'archive_receipt_unavailable_do_not_repeat',doNotRepeat:true};
 }
 try{await writeFile(request,JSON.stringify({digest,state:'accepted'})+'\n',{mode:0o600,flag:'wx'});}
 catch(e){if(e.code==='EEXIST')return {state:'inconclusive',reason:'archive_already_started_do_not_repeat',doNotRepeat:true};throw e;}
 const lock=join(store.dir,'active.lock'),token=randomUUID();let owned=false,archivedCount=0,result;
 try{
  try{await writeFile(lock,JSON.stringify({maintenance:'archive',token})+'\n',{mode:0o600,flag:'wx'});owned=true;}
  catch(e){if(e.code==='EEXIST')throw Error('project_execution_busy');throw e;}
  const rows=await hotReceipts(store);
  if(rows.some(r=>['accepted','running'].includes(r.state)))throw Error('project_execution_unsettled');
  const eligible=rows.filter(r=>settled.has(r.state)).sort((a,b)=>Date.parse(b.finishedAt??b.createdAt)-Date.parse(a.finishedAt??a.createdAt));
  for(const r of eligible.slice(input.retain_recent)){await archiveOne(store,r);archivedCount++;}
  result={state:'archived',project:input.project_key,archivedCount,retainRecent:input.retain_recent,
   historyRetained:true,reportsRetained:true,executionInvoked:false,finishedAt:new Date().toISOString()};
 }catch(e){result={state:archivedCount?'partial':'blocked',archivedCount,
  reason:/^[a-z_]+$/.test(e.message)?e.message:'execution_archive_failed',doNotRepeat:true};}
 finally{
  await privateWrite(request,{digest,result});
  if(owned){const lease=JSON.parse(await privateRead(lock));if(lease.token!==token)throw Error('execution_lock_conflict');await unlink(lock);}
 }
 return result;
}
