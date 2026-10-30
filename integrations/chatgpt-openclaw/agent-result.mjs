// Interpret only explicit native result fields; never expose raw error/provider data.
import {redactFeedback} from '../../stage2/protocol.mjs';
export const AGENT_TIMEOUT_SECONDS=120;
const TRANSPORT_REASONS={gateway_timeout:'agent_cli_timeout',cli_launch_failed:'agent_cli_launch_failed',
 gateway_cli_failed:'agent_cli_failed',invalid_json:'agent_result_invalid_json'};
export function interpretAgentResult(reply,{operationId,binding,durationMs=0}={}){
 const base={state:'inconclusive',operationId,project:binding.projectKey,agent:binding.agentId,
  doNotRepeat:true,executionOutcome:'unverified',effectIndependentlyVerified:false,
  agentTimeoutSeconds:AGENT_TIMEOUT_SECONDS,durationMs:Math.max(0,Math.round(durationMs)),
  nextAction:'Query this operation receipt and reconcile actual effects. Do not repeat under a new ID. Prefer project_execute for authorized Git, scripts, builds and tests.'};
 const diagnostic=reply?.diagnostics;
 if(diagnostic)base.cli={exitCode:Number.isInteger(diagnostic.exitCode)?diagnostic.exitCode:null,
  timedOut:diagnostic.timedOut===true,captureLimitExceeded:diagnostic.captureLimitExceeded===true};
 if(reply?.state!=='reply'&&!reply?.data?.result?.meta?.agentMeta)return {...base,reason:diagnostic?.captureLimitExceeded?'agent_result_capture_limit':TRANSPORT_REASONS[reply?.note]??'agent_transport_result_unavailable'};
 const data=reply.data,meta=data?.result?.meta,a=meta?.agentMeta;
 if(!a)return {...base,reason:'agent_metadata_unavailable'};
 if(a?.provider!=='ollama'||a.model!=='gemma4:26b-a4b')return {...base,reason:'agent_model_policy_unverified'};
 const names=Array.isArray(a?.terminalReceipt?.successfulToolNames)?a.terminalReceipt.successfulToolNames:null;
 base.toolsUsed={evidence:names?'native_terminal_receipt':'unavailable',successful:[...new Set((names??[])
  .filter(n=>typeof n==='string'&&/^[a-zA-Z0-9_.:/-]{1,100}$/.test(n)))].slice(0,100)};
 base.computerToolSucceeded=base.toolsUsed.successful.includes('computer');
 // These flags are native metadata, not deductions from elapsed time or model prose.
 base.run={};for(const k of ['aborted','timedOut','timedOutByRunBudget','timedOutDuringToolExecution','externalAbort'])if(typeof meta[k]==='boolean')base.run[k]=meta[k];
 if(meta.timedOut===true||meta.timedOutByRunBudget===true||meta.modelFallbackStopReason==='agent_run_terminal_timeout')return {...base,reason:'agent_run_timeout'};
 if(meta.aborted===true)return {...base,reason:'agent_run_aborted'};
 if(reply.state!=='reply')return {...base,reason:TRANSPORT_REASONS[reply.note]??'agent_transport_result_unavailable'};
 if(data.status!=='ok')return {...base,reason:'agent_run_not_completed'};
 const payloads=data.result.payloads;
 if(!Array.isArray(payloads)||payloads.length<1||payloads.length>8||payloads.some(x=>typeof x?.text!=='string'))return {...base,reason:'agent_payload_unavailable'};
 const text=redactFeedback(payloads.map(x=>x.text).join('\n')).trim();
 if(!text)return {...base,reason:'agent_answer_empty'};
 const {nextAction,...result}=base;
 return {...result,state:'returned',provider:'ollama',model:'gemma4:26b-a4b',workerUsed:false,text,outputIsUntrusted:true};
}
