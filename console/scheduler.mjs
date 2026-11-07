// Read-only, metadata-only queue view. Never load Agent prompts, release leases,
// probe/stop runners, or turn uncertain receipts into successful completions.
import {join} from 'node:path';
import {privateRead,privateDirectory} from './private-files.mjs';
import {INFERENCE_CAPACITY} from '../integrations/chatgpt-openclaw/inference-lane.mjs';
import {modelResidency} from '../integrations/chatgpt-openclaw/model-residency.mjs';
const valid=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(x);
export async function readScheduler(parent,bindings,{residency=modelResidency}={}){
 const native={state:'observed',capacity:INFERENCE_CAPACITY,maxRunning:1,queueWaitSeconds:300,runBudgetSeconds:300,reservations:[],active:null};
 try{
  const dir=join(parent,'mcp-local-inference');await privateDirectory(dir);
  for(let i=0;i<INFERENCE_CAPACITY;i++){
   let r;try{r=JSON.parse(await privateRead(join(dir,'slot-'+i+'.json')));}catch(e){if(e.code==='ENOENT')continue;throw e;}
   if(!valid(r.project)||!valid(r.operationId)||!Number.isFinite(Date.parse(r.at)))throw Error('invalid_queue_metadata');
   native.reservations.push({project:r.project,operationId:r.operationId,at:r.at,slot:i});
  }
  native.reservations.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.slot-b.slot);
  try{
   const r=JSON.parse(await privateRead(join(dir,'active.json')));
   if(!valid(r.project)||!valid(r.operationId))throw Error('invalid_queue_metadata');
   native.active={project:r.project,operationId:r.operationId};
  }catch(e){if(e.code!=='ENOENT')throw e;}
 }catch(e){if(e.code!=='ENOENT')native.state='unavailable';}
 const repositories=[];
 for(const b of Object.values(bindings)){
  try{
   const r=JSON.parse(await privateRead(join(parent,'direct-project-execution-'+b.projectKey,'active.lock')));
   repositories.push({project:b.projectKey,state:'held',operationId:valid(r.operationId)?r.operationId:null,maintenance:r.maintenance==='archive'});
  }catch(e){if(e.code!=='ENOENT')repositories.push({project:b.projectKey,state:'unavailable'});}
 }
 return {native,repositories,modelResidency:await residency(),repositoryPolicy:'one_per_project_no_wait_queue',readOnly:true};
}
export function attachScheduler(rows,scheduler){
 const result=rows.map(r=>({...r,inferenceLaneHeld:false,schedulerObserved:scheduler.native.state==='observed'})),n=scheduler.native;
 let position=0;
 for(const slot of n.reservations){
  const active=n.active?.project===slot.project&&n.active?.operationId===slot.operationId;
  let row=result.find(r=>r.kind==='computer'&&r.project===slot.project&&r.operationId===slot.operationId);
  if(!row){row={id:'computer:'+slot.project+':'+slot.operationId,kind:'computer',project:slot.project,operationId:slot.operationId,state:'inconclusive',reason:'queue_receipt_unavailable',submittedAt:slot.at,orphanedLease:true};result.push(row);}
  row.reservationHeld=true;
  if(active){row.activeReservation=true;if(!['accepted','running','started'].includes(row.state))row.inferenceLaneHeld=true;}
  else if(['accepted','running','started'].includes(row.state)){row.phase='queued';row.queuePosition=++position;}
  else row.orphanedLease=true;
 }
 if(n.active&&!result.some(r=>r.kind==='computer'&&r.project===n.active.project&&r.operationId===n.active.operationId&&r.activeReservation)){
  let row=result.find(r=>r.kind==='computer'&&r.project===n.active.project&&r.operationId===n.active.operationId);
  if(!row){row={...n.active,id:'computer:'+n.active.project+':'+n.active.operationId,kind:'computer',state:'inconclusive',reason:'active_receipt_unavailable'};result.push(row);}
  row.inferenceLaneHeld=true;row.activeReservation=true;row.orphanedLease=true;
 }
 for(const lease of scheduler.repositories.filter(r=>r.state==='held')){
  let row=result.find(r=>r.kind==='execution'&&r.project===lease.project&&r.operationId===lease.operationId);
  if(!row){row={project:lease.project,operationId:lease.operationId??'maintenance',id:'lease:'+lease.project,kind:'execution',state:'inconclusive',reason:lease.maintenance?'archive_maintenance':'lease_receipt_unavailable',orphanedLease:true};result.push(row);}
  row.projectLeaseHeld=true;
  if(!['accepted','running','started'].includes(row.state))row.orphanedLease=true;
 }
 return result;
}
