// Explicit role-qualified multi-Agent planning, not an execution authority.
// Workers here are logical routes only; no OpenClaw Agent or Mac tool is
// provisioned, launched, credentialed or granted anything by this module.
import {
 createWorkflow,applyWorkflowEvent,readyTasks,validateWorkflow,workflowSummary
} from './workflow-engine.mjs';

export const ROLE_ROUTES=Object.freeze([
 Object.freeze({workerId:'analysis-worker',agentId:'requirements-analyst',capability:'requirements'}),
 Object.freeze({workerId:'systems-worker',agentId:'systems-analyst',capability:'risk-analysis'}),
 Object.freeze({workerId:'architecture-worker',agentId:'technical-architect',capability:'architecture'}),
 Object.freeze({workerId:'coding-worker',agentId:'software-developer',capability:'implementation'}),
 Object.freeze({workerId:'testing-worker',agentId:'test-engineer',capability:'testing'}),
 Object.freeze({workerId:'review-worker',agentId:'code-reviewer',capability:'review'}),
 Object.freeze({workerId:'acceptance-worker',agentId:'acceptance-reviewer',capability:'acceptance'})
]);

// A finite, pre-reviewed DAG. Agent and worker labels are local proposal IDs,
// NOT OpenClaw installed Agent identities, provider model IDs or shell actions.
export const STAGES=Object.freeze([
 Object.freeze({taskId:'requirements',kind:'requirements',agentId:'requirements-analyst',dependsOn:[]}),
 Object.freeze({taskId:'risk-review',kind:'risk-analysis',agentId:'systems-analyst',dependsOn:['requirements']}),
 Object.freeze({taskId:'architecture',kind:'architecture',agentId:'technical-architect',dependsOn:['requirements']}),
 Object.freeze({taskId:'implementation',kind:'implementation',agentId:'software-developer',
  dependsOn:['risk-review','architecture']}),
 Object.freeze({taskId:'testing',kind:'testing',agentId:'test-engineer',dependsOn:['implementation']}),
 Object.freeze({taskId:'code-review',kind:'review',agentId:'code-reviewer',dependsOn:['testing']}),
 Object.freeze({taskId:'acceptance',kind:'acceptance',agentId:'acceptance-reviewer',dependsOn:['code-review']})
]);

export const VALID_PROJECTS=new Set(['alice-ai','openclaw-workflow']);
function validProject(x){if(!VALID_PROJECTS.has(x))throw Error('unregistered_dispatch_project')}
function uid(x){return typeof x==='string'&&/^[a-z][a-z0-9-]{2,63}$/.test(x)}
function emit(w,type,data,index){
 return applyWorkflowEvent(w,{
  type,id:'route-event-'+index,expectedRevision:w.revision,
  at:'2026-10-27T00:00:00Z',...data
 });
}
export function buildLocalAgentPlan(workflowId,{projectKey}={}){
 validProject(projectKey);
 if(!uid(workflowId))throw Error('invalid_workflow_id');
 let ledger=createWorkflow(workflowId),index=0;
 for(const role of ROLE_ROUTES){
  ledger=emit(ledger,'worker_register',{worker:{
   id:role.workerId,capabilities:[role.capability]}},++index);
  ledger=emit(ledger,'agent_bind',{workerId:role.workerId,agentId:role.agentId},++index);
 }
 for(const stage of STAGES){
  ledger=emit(ledger,'task_add',{task:{id:stage.taskId,kind:stage.kind,
   agentId:stage.agentId,dependsOn:[...stage.dependsOn]}},++index);
 }
 return {projectKey,ledger,summary:workflowSummary(ledger)};
}

// Return deterministic *candidates*, not claims. A real trusted dispatcher
// must verify the current revision and commit an exclusive durable lease.
export function proposeLocalDispatch(ledger,{projectKey}={}){
 validProject(projectKey);
 validateWorkflow(ledger);
 const busy=new Set(ledger.tasks.filter(t=>
  ['leased','running','cancel_requested','verification_pending'].includes(t.status))
  .map(t=>t.workerId).filter(Boolean));
 const proposals=[];
 for(const taskId of readyTasks(ledger)){
  const task=ledger.tasks.find(x=>x.id===taskId);
  const matching=ledger.workers.filter(w=>
    !busy.has(w.id)&&w.capabilities.includes(task.kind)&&
    ledger.bindings.some(b=>b.workerId===w.id&&b.agentId===task.agentId&&b.active));
  if(matching.length!==1){
   // No ambiguous assignment, no default to arbitrary worker.
   proposals.push({taskId,state:matching.length===0?'unassigned':'ambiguous',workerId:null});
   continue;
  }
  busy.add(matching[0].id);
  proposals.push({taskId,state:'candidate',workerId:matching[0].id,
   agentId:task.agentId,kind:task.kind,revision:ledger.revision});
 }
 return {projectKey,revision:ledger.revision,executionAuthorized:false,proposals};
}
export function verifyLocalAgentBindings(ledger,{projectKey}={}){
 validProject(projectKey);validateWorkflow(ledger);
 const issues=[];
 for(const route of ROLE_ROUTES){
  const worker=ledger.workers.find(w=>w.id===route.workerId);
  if(!worker||worker.capabilities.length!==1||
    worker.capabilities[0]!==route.capability||
    !ledger.bindings.some(b=>b.workerId===route.workerId&&b.agentId===route.agentId&&b.active))
   issues.push(route.workerId);
 }
 return {projectKey,rolesVerified:issues.length===0,missingOrModifiedRoles:issues};
}
