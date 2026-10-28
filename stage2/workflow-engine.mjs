// Pure multi-worker workflow reducer: no model, browser, shell, or remote actions.
const id=x=>typeof x==='string'&&/^[a-z][a-z0-9-]{2,63}$/.test(x);
const rid=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{3,95}$/.test(x);
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const fail=(ok,reason)=>{if(!ok)throw Error(reason)};
const outcomes=new Set(['passed','failed','inconclusive','cancelled']);
const finished=new Set(['done','failed','cancelled','voided','superseded']);
export function createWorkflow(workflowId){
 fail(id(workflowId),'invalid_workflow_id');
 return {schemaVersion:1,id:workflowId,revision:0,tasks:[],workers:[],bindings:[],receipts:[],events:[]};
}
export function validateWorkflow(w){
 fail(obj(w)&&w.schemaVersion===1&&id(w.id)&&Number.isSafeInteger(w.revision)&&
  w.revision>=0&&['tasks','workers','bindings','receipts','events'].every(k=>Array.isArray(w[k])),'invalid_workflow');
 const map=new Map();
 for(const t of w.tasks){
  fail(obj(t)&&id(t.id)&&id(t.kind)&&Array.isArray(t.dependsOn)&&
    t.dependsOn.every(id)&&!map.has(t.id),'invalid_task');
  map.set(t.id,t);
 }
 const visited=new Set(),visiting=new Set();
 function walk(taskId){
  fail(map.has(taskId),'missing_dependency');
  if(visited.has(taskId))return;
  fail(!visiting.has(taskId),'dependency_cycle');
  visiting.add(taskId);
  for(const d of map.get(taskId).dependsOn)walk(d);
  visiting.delete(taskId);visited.add(taskId);
 }
 for(const t of w.tasks)walk(t.id);
 fail(new Set(w.events.map(e=>e.id)).size===w.events.length,'duplicate_event');
 fail(new Set(w.receipts.map(r=>r.id)).size===w.receipts.length,'duplicate_receipt');
 return w;
}
function resolved(map,taskId,seen=new Set()){
 const task=map.get(taskId);
 if(!task||seen.has(taskId))return false;
 if(task.status==='done')return true;
 if(task.status!=='superseded'||!task.children?.length)return false;
 const next=new Set(seen);next.add(taskId);
 return task.children.every(x=>resolved(map,x,next));
}
export function readyTasks(w){
 validateWorkflow(w);
 const map=new Map(w.tasks.map(t=>[t.id,t]));
 return w.tasks.filter(t=>t.status==='pending'&&t.dependsOn.every(d=>resolved(map,d))).map(t=>t.id);
}
export function applyWorkflowEvent(current,e){
 validateWorkflow(current);
 fail(obj(e)&&rid(e.id)&&typeof e.type==='string'&&
  e.expectedRevision===current.revision&&
  typeof e.at==='string'&&Number.isFinite(Date.parse(e.at)),'invalid_event_or_stale_revision');
 fail(!current.events.some(x=>x.id===e.id),'duplicate_event');
 const w=structuredClone(current),t=w.tasks.find(x=>x.id===e.taskId);
 switch(e.type){
 case 'worker_register':
  fail(obj(e.worker)&&id(e.worker.id)&&Array.isArray(e.worker.capabilities)&&
    e.worker.capabilities.every(id)&&
    !w.workers.some(x=>x.id===e.worker.id),'invalid_worker');
  w.workers.push({id:e.worker.id,capabilities:[...new Set(e.worker.capabilities)]});
  break;
 case 'agent_bind':
  fail(id(e.workerId)&&id(e.agentId)&&w.workers.some(x=>x.id===e.workerId)&&
    !w.bindings.some(x=>x.workerId===e.workerId&&x.agentId===e.agentId),'invalid_agent_binding');
  w.bindings.push({workerId:e.workerId,agentId:e.agentId,active:true});
  break;
 case 'task_add':
  fail(obj(e.task)&&id(e.task.id)&&id(e.task.kind)&&
    (!e.task.agentId||id(e.task.agentId))&&Array.isArray(e.task.dependsOn)&&
    e.task.dependsOn.every(x=>w.tasks.some(t=>t.id===x))&&
    !w.tasks.some(x=>x.id===e.task.id),'invalid_task_add');
  w.tasks.push({id:e.task.id,kind:e.task.kind,agentId:e.task.agentId??null,
    dependsOn:[...new Set(e.task.dependsOn)],children:[],status:'pending'});
  break;
 case 'task_split':{
  fail(t&&t.status==='pending'&&Array.isArray(e.parts)&&
    e.parts.length>=2&&e.parts.length<=24,'split_unstarted_only');
  const names=e.parts.map(x=>x?.id);
  fail(names.every(id)&&new Set(names).size===names.length&&
    names.every(x=>!w.tasks.some(t=>t.id===x))&&
    e.parts.every(p=>p.kind===t.kind&&(!p.agentId||p.agentId===t.agentId)),'unsafe_split');
  t.status='superseded';t.children=names;
  for(const child of e.parts)w.tasks.push({id:child.id,kind:t.kind,agentId:t.agentId,
    dependsOn:[...t.dependsOn],children:[],status:'pending'});
  break;
 }
 case 'task_claim':{
  fail(t&&readyTasks(w).includes(t.id),'task_not_ready');
  const worker=w.workers.find(x=>x.id===e.workerId);
  fail(worker?.capabilities.includes(t.kind),'worker_not_capable');
  fail(!t.agentId||w.bindings.some(x=>x.workerId===e.workerId&&
    x.agentId===t.agentId&&x.active),'agent_binding_missing');
  fail(rid(e.leaseId)&&typeof e.leaseUntil==='string'&&
    Date.parse(e.leaseUntil)>Date.parse(e.at),'invalid_lease');
  t.workerId=e.workerId;t.leaseId=e.leaseId;t.leaseUntil=e.leaseUntil;
  t.attempt=(t.attempt??0)+1;t.status='leased';break;
 }
 case 'task_start':
  fail(t?.status==='leased'&&t.workerId===e.workerId&&
    t.leaseId===e.leaseId&&Date.parse(e.at)<Date.parse(t.leaseUntil),'invalid_start');
  t.status='running';break;
 case 'task_receipt':
  fail(t&&['running','cancel_requested'].includes(t.status)&&
    t.workerId===e.workerId&&t.leaseId===e.leaseId&&rid(e.receiptId)&&
    outcomes.has(e.result)&&digest(e.evidenceSha256)&&
    !w.receipts.some(r=>r.id===e.receiptId),'invalid_receipt');
  fail(e.result!=='cancelled'||e.stopVerified===true,'unverified_cancel');
  w.receipts.push({id:e.receiptId,taskId:t.id,workerId:e.workerId,
    attempt:t.attempt,result:e.result,evidenceSha256:e.evidenceSha256,at:e.at});
  t.receiptId=e.receiptId;
  t.status=e.result==='passed'?'verification_pending':
    e.result==='cancelled'?'cancelled':'failed';
  delete t.leaseId;delete t.leaseUntil;break;
 case 'task_accept':
  // This reducer validates state integrity, not proof of owner authorization.
  // At minimum, the executing Worker and its bound model Agent MUST NOT
  // attest their own receipt. A separate trusted owner-review ingress must
  // verify the actual Alice Project Chat before issuing this event.
  fail(t?.status==='verification_pending'&&t.receiptId===e.receiptId&&
    id(e.verifierId)&&e.verifierId!==t.workerId&&
    e.verifierId!==t.agentId&&
    w.receipts.some(r=>r.id===e.receiptId&&r.result==='passed'),
    'verification_required');
  t.status='done';t.verifiedBy=e.verifierId;break;
 case 'task_cancel_request':
  fail(t&&!finished.has(t.status)&&t.status!=='verification_pending','not_cancellable');
  t.status='cancel_requested';break;
 case 'task_cancel_confirm':
  fail(t?.status==='cancel_requested'&&
    (!t.leaseId||e.stopVerified===true),'cancel_needs_stop_evidence');
  t.status='cancelled';delete t.leaseId;delete t.leaseUntil;break;
 case 'task_void':
  fail(t&&['pending','failed','cancelled'].includes(t.status)&&
    typeof e.reason==='string'&&e.reason.length>=6,'cannot_void_active_task');
  t.status='voided';break;
 default:throw Error('unknown_event');
 }
 w.events.push({id:e.id,type:e.type,at:e.at,taskId:e.taskId??null,workerId:e.workerId??null});
 w.revision++;
 return validateWorkflow(w);
}
export function workflowSummary(w){
 validateWorkflow(w);
 const counts={};
 for(const t of w.tasks)counts[t.status]=(counts[t.status]??0)+1;
 return {workflowId:w.id,revision:w.revision,workerCount:w.workers.length,
   bindings:w.bindings.length,receipts:w.receipts.length,ready:readyTasks(w),counts};
}
