// Malformed tasks never execute. A structurally recognizable but invalid
// assistant task may receive one bounded correction receipt in the same chat.
import {createHash} from 'node:crypto';
import {extractAction,PROTOCOL,isKnownAction} from './protocol.mjs';
const MALFORMED='Malformed structured task (strict action-specific fields).';
const AMBIGUOUS='More than one executable task in latest assistant turn; refuse ambiguity.';
const VALID_ID=/^[a-zA-Z0-9][a-zA-Z0-9_-]{3,79}$/;
const FIELD_REASONS=Object.freeze({
 terminal_command_too_long:'mac-terminal command exceeds 2048 characters or 4096 bytes',
 window_text_too_long:'mac-window-text exceeds its supported text limit',
 invalid_action_fields:'task fields do not match the strict action schema'
});
export function malformedTaskMeta(page){
 if(!page||page.generating||!Array.isArray(page.messages))return null;
 const codes=page.messages.at(-1)?.codes;
 if(!Array.isArray(codes)||codes.length!==1)return null;
 const raw=codes[0];
 if(typeof raw!=='string'||raw.length>5000)return null;
 let v;
 try{v=JSON.parse(raw.trim())}catch{return null}
 if(!v||typeof v!=='object'||Array.isArray(v)||v.protocol!==PROTOCOL||
   typeof v.id!=='string'||!VALID_ID.test(v.id)||!isKnownAction(v.action))return null;
 const tooLongCommand=v.action==='mac-terminal'&&typeof v.command==='string'&&
   (v.command.length>2048||Buffer.byteLength(v.command,'utf8')>4096);
 const tooLongText=v.action==='mac-window-text'&&typeof v.text==='string'&&
   (v.text.length>1600||Buffer.byteLength(v.text,'utf8')>3600);
 const reason=tooLongCommand?'terminal_command_too_long':
   tooLongText?'window_text_too_long':'invalid_action_fields';
 return Object.freeze({id:v.id,action:v.action,reason,
   fingerprint:createHash('sha256').update(raw).digest('hex')});
}
export function invalidTaskResponse(meta){
 if(!meta||!VALID_ID.test(meta.id)||!isKnownAction(meta.action)||
   !Object.hasOwn(FIELD_REASONS,meta.reason))throw Error('Invalid rejection metadata');
 return ['[IOANT-MAC-OPS RESULT '+meta.id+']',
   'Action: '+meta.action,'Status: invalid_task',
   'Reason: '+FIELD_REASONS[meta.reason],
   'No action was executed. Issue a NEW task ID with a valid JSON envelope.',
   'For long commands, commit a reviewed script and invoke its short, version-pinned entrypoint.'].join('\n');
}
export function extractWatchedAction(page){
 try{return extractAction(page)}
 catch(e){
  // Multiple independently valid instructions from the same assistant turn
  // are never prioritized or executed. Unlike unknown parsing/provenance
  // errors, this particular refusal is safely recoverable by a new turn.
  if(e instanceof Error&&e.message===AMBIGUOUS)
   return Object.freeze({status:'rejected_ambiguous_task'});
  if(e instanceof Error&&e.message===MALFORMED){
   const report=malformedTaskMeta(page);
   return report?{status:'rejected_invalid_task',report}:{status:'rejected_invalid_task'};
  }
  throw e;
 }
}
