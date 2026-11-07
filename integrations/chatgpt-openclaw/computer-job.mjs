// Detached one-job runner. A durable runner claim prevents duplicate inference.
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {computerProjectStore,computerAdmissionPolicy,performComputerTask,computerSessionKey} from './computer-agent.mjs';
import {nativeSessionStatus} from './computer-lane-recovery.mjs';
import {InferenceLane} from './inference-lane.mjs';
import {modelResidency} from './model-residency.mjs';
export async function runComputerJob(binding,id,{store=computerProjectStore(binding),lane=new InferenceLane(store.parent),
 policy=()=>computerAdmissionPolicy(binding),perform=performComputerTask,residency=modelResidency,settlement=nativeSessionStatus,sleep=delay,now=Date.now,queueWaitMs=300000}={}){
 let record=await store.get(id);if(!record?.job||record.job.project!==binding.projectKey||record.job.agent!==binding.agentId)return;
 const x=record.job.input,expected=createHash('sha256').update(JSON.stringify([binding.projectKey,binding.agentId,x?.conversation_key,x?.message])).digest('hex');
 if(x?.operation_id!==id||expected!==record.digest)throw Error('computer_job_identity_changed');
 record=await store.start(id,record.digest);if(!record)return;
 const slot=record.job.slot;let active=false,terminal=true,result;
 try{
  const deadline=now()+queueWaitMs;
  while(!await lane.acquire(slot)){
   if(now()>=deadline){result={state:'blocked',reason:'local_inference_queue_timeout',modelInferenceInvoked:false};break;}
   await sleep(1000);
  }
  if(!result){
   active=true;
   if(!await policy())result={state:'blocked',reason:'project_computer_permission_changed',modelInferenceInvoked:false};
   else{
    const memory=await residency();
    await store.progress(id,record.digest,'agent_running',{runnerPid:process.pid,modelInferenceInvoked:true,agentStartedAt:new Date(now()).toISOString(),
     modelResidentAtStart:memory.state==='observed'?memory.models.some(m=>m.name==='gemma4:26b-a4b'):null,agentTimeoutSeconds:300});
    // Set uncertainty BEFORE invocation: a crash must never release this lane.
    terminal=false;const outcome=await perform(record.job.input,{binding});
    terminal=outcome.terminal;result=outcome.result;
    // A CLI failure can lose its answer after the native run has already ended.
    // Confirm exact-session settlement instead of retaining a dead lane forever.
    // Never infer settlement from elapsed time, no loaded model, or chat inactivity.
    if(!terminal&&Number.isInteger(result?.cli?.exitCode)){
     try{
      const key=computerSessionKey(record.job.input,binding),s=await settlement(key);
      if(s.key===key&&typeof s.sessionId==='string'&&['done','failed','killed','timeout'].includes(s.status)&&s.hasActiveRun===false&&Array.isArray(s.activeRunIds)&&s.activeRunIds.length===0&&Number.isFinite(s.updatedAt)&&s.updatedAt>=Date.parse(record.startedAt)){
       terminal=true;result={...result,nativeSettlement:s,effectsVerified:false};
      }
     }catch{ /* Unknown native evidence retains the original safety lease. */ }
    }
   }
  }
 }catch{result={state:'inconclusive',reason:'computer_job_requires_review',executionOutcome:'unverified'};}
 result={...result,operationId:id,project:binding.projectKey,agent:binding.agentId,asynchronous:true,doNotRepeat:true,
  inferenceLaneHeld:active&&!terminal,receiptPersisted:true};
 await store.finish(id,record.digest,result);
 if(terminal)await lane.release(slot,{active});
 // Uncertain native completion keeps the lane; never delete or take it over by TTL.
}
