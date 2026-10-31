// Four bounded waiting MCP jobs, one active local-model job across projects.
// No TTL takeover: a lost/uncertain native run requires reconciliation.
import {join} from 'node:path';
import {mkdir,writeFile,readFile,unlink,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {EXECUTION_PARENT} from './project-execution-policy.mjs';
import {privateExecutionPath} from './project-execution-store.mjs';
export const INFERENCE_CAPACITY=4;
export class InferenceLane{
 constructor(parent=EXECUTION_PARENT){this.parent=parent;this.dir=join(parent,'mcp-local-inference');}
 async admit(){
  await privateExecutionPath(this.parent,true);
  try{await mkdir(this.dir,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
  await privateExecutionPath(this.dir,true);
 }
 async reserve(project,operationId){
  await this.admit();const token=randomUUID();
  for(let slot=0;slot<INFERENCE_CAPACITY;slot++){
   try{
    await writeFile(join(this.dir,'slot-'+slot+'.json'),JSON.stringify({token,slot,project,operationId,at:new Date().toISOString()}),{flag:'wx',mode:0o600});
    return {slot,token};
   }catch(e){if(e.code!=='EEXIST')throw e;}
  }
  return null;
 }
 async read(name){const p=join(this.dir,name);await privateExecutionPath(p);return JSON.parse(await readFile(p,'utf8'));}
 async acquire(reservation){
  await this.admit();const own=await this.read('slot-'+reservation.slot+'.json');
  if(own.token!==reservation.token)throw Error('inference_slot_conflict');
  const slots=[];
  for(const n of (await readdir(this.dir)).filter(n=>/^slot-[0-3]\.json$/.test(n)))slots.push(await this.read(n));
  slots.sort((a,b)=>a.at.localeCompare(b.at)||a.slot-b.slot);
  if(slots[0]?.token!==reservation.token)return false;
  try{await writeFile(join(this.dir,'active.json'),JSON.stringify(own),{flag:'wx',mode:0o600});return true;}
  catch(e){if(e.code==='EEXIST')return false;throw e;}
 }
 async release(reservation,{active=false}={}){
  if(active){const r=await this.read('active.json');if(r.token!==reservation.token)throw Error('inference_owner_conflict');await unlink(join(this.dir,'active.json'));}
  const r=await this.read('slot-'+reservation.slot+'.json');if(r.token!==reservation.token)throw Error('inference_slot_conflict');
  await unlink(join(this.dir,'slot-'+reservation.slot+'.json'));
 }
}
