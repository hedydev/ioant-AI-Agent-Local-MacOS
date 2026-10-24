// Persisted one-shot claim for no-tools Alice model discussions.
const TASK_ID=/^[a-zA-Z0-9][a-zA-Z0-9_-]{3,79}$/;
const STAMP=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function reserveDevDiscussion(state,id,now=()=>new Date().toISOString()){
  if(!isObject(state)||typeof id!=='string'||!TASK_ID.test(id))
    return {ok:false,reason:'invalid_discussion_state'};
  const ledger=Object.hasOwn(state,'devDiscussionClaims')?state.devDiscussionClaims:{};
  if(!isObject(ledger)||Object.entries(ledger).some(([key,at])=>
    !TASK_ID.test(key)||typeof at!=='string'||!STAMP.test(at)))
    return {ok:false,reason:'invalid_discussion_ledger'};
  if(Object.hasOwn(ledger,id))
    return {ok:false,reason:'prior_discussion_outcome_unknown'};
  if(Object.keys(ledger).length>=1024)
    return {ok:false,reason:'discussion_claim_limit'};
  const at=now();
  if(typeof at!=='string'||!STAMP.test(at))
    return {ok:false,reason:'invalid_discussion_clock'};
  return {ok:true,state:{...state,devDiscussionClaims:{...ledger,[id]:at}}};
}
