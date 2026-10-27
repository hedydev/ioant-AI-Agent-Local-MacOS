// Only a malformed task envelope is downgraded to a non-executable status.
// All other page/role/security errors remain fatal to the exact-chat watcher.
import {extractAction} from './protocol.mjs';
const MALFORMED='Malformed structured task (strict action-specific fields).';
export function extractWatchedAction(page){
 try{return extractAction(page)}
 catch(e){
  if(e instanceof Error&&e.message===MALFORMED)return {status:'rejected_invalid_task'};
  throw e;
 }
}
