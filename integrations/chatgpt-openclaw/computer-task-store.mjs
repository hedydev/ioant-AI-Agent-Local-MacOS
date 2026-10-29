// Durable at-most-once admission. A lost receipt never authorizes action replay.
import {homedir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {lstat,realpath,mkdir,readdir,readFile,writeFile,rename} from 'node:fs/promises';
export const operationId=/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/;
const PARENT=join(homedir(),'Library/Application Support/ioant-openclaw-ops');
const DIR=join(PARENT,'direct-computer-tasks');
async function privateDir(path){
 const s=await lstat(path);
 if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)!==0||
  s.uid!==process.getuid()||await realpath(path)!==path)throw Error('unsafe_task_directory');
}
export class ComputerTaskStore{
 constructor(dir=DIR,parent=PARENT){this.dir=dir;this.parent=parent;}
 async admit(){
  await privateDir(this.parent);
  try{await mkdir(this.dir,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
  await privateDir(this.dir);
 }
 path(id){if(!operationId.test(id))throw Error('invalid_operation_id');return join(this.dir,id+'.json');}
 async get(id){
  await this.admit();const path=this.path(id);
  let s;try{s=await lstat(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}
  if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077)!==0||s.uid!==process.getuid()||
   s.size>16384||await realpath(path)!==path)throw Error('unsafe_task_record');
  const d=JSON.parse(await readFile(path,'utf8'));
  if(d?.schemaVersion!==1||d.operationId!==id||!/^[0-9a-f]{64}$/.test(d.digest??'')||
   !['started','finished'].includes(d.state))throw Error('invalid_task_record');
  return d;
 }
 async begin(id,digest){
  await this.admit();const path=this.path(id);
  const existing=await this.get(id);if(existing)return {created:false,record:existing};
  if((await readdir(this.dir)).length>=500)throw Error('task_ledger_full');
  const record={schemaVersion:1,operationId:id,digest,state:'started',startedAt:new Date().toISOString()};
  try{await writeFile(path,JSON.stringify(record)+'\n',{mode:0o600,flag:'wx'});}
  catch(e){if(e.code==='EEXIST')return {created:false,record:await this.get(id)};throw e;}
  return {created:true,record};
 }
 async finish(id,digest,result){
  const prior=await this.get(id);
  if(prior?.state!=='started'||prior.digest!==digest)throw Error('task_reservation_changed');
  const temporary=join(this.dir,'.receipt-'+randomUUID()+'.tmp');
  await writeFile(temporary,JSON.stringify({...prior,state:'finished',
   finishedAt:new Date().toISOString(),result})+'\n',{mode:0o600,flag:'wx'});
  await rename(temporary,this.path(id));
 }
}
