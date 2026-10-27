// Pure ownership guard for CUA node-host read sessions.
// A native computer.act "read" can acquire a persistent execution lease.
// NEVER close any execution ID except the exact locally generated ID that
// this session itself attempted. A close acknowledgement is NOT proof that
// the stored owner matched or has actually been released.
import {randomUUID} from 'node:crypto';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const readActions=new Set(['list_windows','get_cursor_position','get_window_state']);
const validRef=x=>typeof x==='string'&&x.length>0&&x.length<=1024;
const nativeInvoke=(nodeId,payload)=>[
 'nodes','invoke','--node',nodeId,'--command','computer.act',
 '--params',JSON.stringify(payload),'--json'
];
export function scopedReadRequest(nodeId,executionId,action,params={}){
 if(!validRef(nodeId)||!uuid.test(executionId)||!readActions.has(action))
  throw Error('unsupported_scoped_cua_request');
 if(action==='get_window_state'&&!validRef(params.windowRef))
  throw Error('fixture_window_reference_required');
 const payload={action,executionId};
 if(action==='get_window_state'){
  payload.windowRef=params.windowRef;
  payload.includeScreenshot=false;
 }
 return nativeInvoke(nodeId,payload);
}
export function scopedCloseRequest(nodeId,executionId){
 if(!validRef(nodeId)||!uuid.test(executionId))
  throw Error('invalid_scoped_execution_identity');
 return nativeInvoke(nodeId,{action:'__close_execution',
  executionId,reason:'scoped-read-finished'});
}
// Callbacks are injected, not executed by this module on import.
// Only the execution started by this invocation can be closed.
// Even when a read fails after reaching the provider, its own session
// might have acquired ownership, so attempt the matching release exactly
// once unless the error was a clear pre-admission reject.
export async function withScopedNativeReads({
 nodeId,call,
 makeId=randomUUID,
 actions,
 classifyError=()=>({category:'unclassified'}),
 shouldSkipClose=reason=>[
  'computer_execution_occupied','gateway_unauthorized',
  'gateway_forbidden','gateway_permission_denied',
  'operator_scope_missing','node_pairing_required',
  'node_command_approval_required','gateway_command_policy',
  'native_action_unsupported','unsupported_cli_command'
 ].includes(reason)
}={}){
 if(!validRef(nodeId)||typeof call!=='function'||
   !Array.isArray(actions)||actions.length===0||actions.length>2)
  throw Error('scoped_read_preflight_failed');
 const id=makeId();
 if(!uuid.test(id))throw Error('invalid_scoped_execution_identity');
 const results=[];let attempted=false,completed=false;
 let preAdmissionDenied=false,closure={attempted:false,
  acknowledged:false,ownerReleaseVerified:false};
 try{
  for(const request of actions){
   const action=request?.action;
   const args=scopedReadRequest(nodeId,id,action,request?.params??{});
   attempted=true;
   try{
    const response=await call(args,25000);
    results.push({action,state:'returned',response});
   }catch(error){
    const category=classifyError(error)?.category??'unclassified';
    preAdmissionDenied=shouldSkipClose(category);
    results.push({action,state:'failed',category});
    // Stop the session after any failure, never retry via a new UUID.
    break;
   }
  }
  completed=true;
 }finally{
  if(attempted&&!preAdmissionDenied){
   closure={attempted:true,acknowledged:false,ownerReleaseVerified:false};
   try{
    const answer=await call(scopedCloseRequest(nodeId,id),15000);
    // Some old hosts return ok:true even if the owner does not match.
    const acknowledged=answer?.ok===true||answer?.result?.ok===true;
    closure={attempted:true,acknowledged,ownerReleaseVerified:false};
   }catch{
    closure={attempted:true,acknowledged:false,ownerReleaseVerified:false};
   }
  }
 }
 if(!completed)throw Error('scoped_session_internal_error');
 return {results,closure,
  nativeInputAttempted:false,screenCaptureAttempted:false,
  crossExecutionCloseAttempted:false};
}
