// Immutable revisions: atomically link one new record; competing writers cannot overwrite.
import {lstat,realpath,mkdir,readdir,readFile,writeFile,link,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {operationId} from './computer-task-store.mjs';
const key=/^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;
export function validHandoffInput(x){
 return x&&typeof x==='object'&&!Array.isArray(x)&&
  Object.keys(x).filter(k=>k!=='execution_ids').sort().join(',')==='conversation_key,expected_revision,operation_ids,summary'&&
  (x.execution_ids===undefined||Array.isArray(x.execution_ids)&&x.execution_ids.length<=20&&
   new Set(x.execution_ids).size===x.execution_ids.length&&x.execution_ids.every(id=>typeof id==='string'&&operationId.test(id)))&&
  typeof x.conversation_key==='string'&&key.test(x.conversation_key)&&Number.isInteger(x.expected_revision)&&x.expected_revision>=0&&x.expected_revision<100&&
  typeof x.summary==='string'&&x.summary.trim().length>0&&x.summary.length<=1800&&Buffer.byteLength(x.summary)<=6000&&
  !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(x.summary)&&
  Array.isArray(x.operation_ids)&&x.operation_ids.length<=20&&new Set(x.operation_ids).size===x.operation_ids.length&&
  x.operation_ids.every(id=>typeof id==='string'&&operationId.test(id));
}
async function privateDir(path){
 const st=await lstat(path);
 if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid()||
  (st.mode&0o077)!==0||await realpath(path)!==path)throw Error('unsafe_handoff_directory');
}
export class ProjectHandoffStore{
 constructor({dir,parent,binding}){this.dir=dir;this.parent=parent;this.binding=binding;}
 async admit(){
  await privateDir(this.parent);
  try{await mkdir(this.dir,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
  await privateDir(this.dir);
 }
 async latest(){
  await this.admit();
  const names=(await readdir(this.dir)).filter(n=>/^handoff-\d{3}\.json$/.test(n)).sort();
  if(names.length>100)throw Error('handoff_history_full');
  if(!names.length)return null;
  const name=names.at(-1),path=join(this.dir,name),st=await lstat(path);
  if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||
   (st.mode&0o077)!==0||st.size>24000||await realpath(path)!==path)throw Error('unsafe_handoff_record');
  const r=JSON.parse(await readFile(path,'utf8'));
  const {schemaVersion,project,agent,revision,savedAt,...input}=r;
  if(schemaVersion!==1||project!==this.binding.projectKey||agent!==this.binding.agentId||
   !Number.isInteger(revision)||revision<1||revision>100||revision!==Number(name.slice(8,11))||
   input.expected_revision!==revision-1||typeof savedAt!=='string'||!Number.isFinite(Date.parse(savedAt))||
   !validHandoffInput(input))throw Error('invalid_handoff_record');
  return r;
 }
 async save(input){
  if(!validHandoffInput(input))throw Error('invalid_handoff_input');
  const prior=await this.latest();
  if((prior?.revision??0)!==input.expected_revision)throw Error('handoff_revision_conflict');
  const revision=input.expected_revision+1;
  const record={schemaVersion:1,project:this.binding.projectKey,agent:this.binding.agentId,
   revision,savedAt:new Date().toISOString(),...input};
  const temporary=join(this.dir,'.handoff-'+randomUUID()+'.tmp');
  const target=join(this.dir,'handoff-'+String(revision).padStart(3,'0')+'.json');
  await writeFile(temporary,JSON.stringify(record)+'\n',{mode:0o600,flag:'wx'});
  try{await link(temporary,target);}catch(e){if(e.code==='EEXIST')throw Error('handoff_revision_conflict');throw e;}
  finally{await unlink(temporary);}
  return record;
 }
}
