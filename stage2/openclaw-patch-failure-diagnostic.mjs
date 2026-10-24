#!/usr/bin/env node
// Read-only Gateway RPC log diagnostic for a previously inconclusive config.patch.
// Do not issue config.patch; never return raw log text, user content or credentials.
import {resolve} from 'node:path';
import {execNative,rpcEnvelope} from './openclaw-ollama-provision.mjs';

const MAX_LINES=200;
const MAX_BYTES=128*1024;
const AUDIT='IOANT_OPENCLAW_PATCH_FAILURE_DIAGNOSTIC';
const LABELS=Object.freeze([
 ['admin_scope_missing',/(?:operator\.admin|missing.{0,60}scope|insufficient.{0,60}(?:scope|permission)|permission.{0,60}denied|forbidden|not authorized|authorization required)/i],
 ['write_lock_or_readonly',/(?:READONLY|read-only|immutable|write lock|state owner|owner conflict|another.{0,30}owner)/i],
 ['invalid_rpc_params',/(?:invalid.{0,30}(?:params|request)|unknown.{0,30}(?:field|param)|unexpected.{0,30}param)/i],
 ['config_validation',/(?:invalid config|config.{0,25}(?:validation|schema)|unsupported model|invalid model|failed to validate)/i],
 ['revision_conflict',/(?:baseHash|hash mismatch|config.{0,20}(?:changed|conflict)|stale revision)/i],
 ['rate_limited',/(?:rate limit|retryAfterMs|too many requests)/i],
 ['gateway_transport',/(?:ECONNRESET|ECONNREFUSED|socket.{0,30}closed|connection.{0,30}(?:closed|lost)|gateway.{0,30}restart)/i]
]);
// Classify validation *location* and error *shape* without ever returning the
// offending key/value, raw message, paths, identifiers or a log excerpt.
const ISSUE_SCOPES=Object.freeze([
 ['ollama_models',/models\.providers\.ollama\.models(?:\.|\[|\b)/i],
 ['ollama_provider',/models\.providers\.ollama\b/i],
 ['other_model_provider',/models\.providers\.(?!ollama\b)[a-z0-9_-]+/i],
 ['model_catalog',/models\.(?!providers\.)[a-z][a-z0-9_.-]*/i],
 ['agent_configuration',/agents\.(?:defaults|entries|list)\b/i],
 ['gateway_configuration',/gateway\.(?:auth|bind|port|reload|mode|remote|controlUi)\b/i],
 ['plugin_configuration',/plugins\.(?:entries|allow|deny|installs)\b/i],
 ['secrets_configuration',/secrets\.(?:providers|defaults)\b/i],
 ['config_root',/(?:<root>|\broot\s*:)/i]
]);
const ISSUE_KINDS=Object.freeze([
 ['unknown_key',/(?:unrecognized keys?|unknown (?:keys?|fields?)|unexpected (?:keys?|fields?))/i],
 ['missing_required',/(?:missing required|\brequired\b|missing (?:field|key|property))/i],
 ['invalid_type',/(?:invalid_type|invalid type|expected (?:string|object|number|array|boolean).{0,80}received (?:string|object|number|array|boolean))/i],
 ['value_too_small',/(?:too small|too short|minimum length|at least \d+ characters|\bmin\s*:\s*\d+)/i],
 ['invalid_choice',/(?:invalid enum|invalid literal|invalid choice|unsupported (?:value|api))/i],
 ['write_guard',/(?:write rejected|last-known-good|missing-meta|size-drop|clobber|preserve existing)/i]
]);
function approvedMatches(lines,labels){
 const matched=new Set();
 for(const line of lines)for(const [id,pattern] of labels)if(pattern.test(line))matched.add(id);
 return labels.map(([id])=>id).filter(id=>matched.has(id));
}
function result(status,extra={}){
 const out={audit:AUDIT,schemaVersion:1,readOnly:true,status};
 // Enumeration only: no original log fields or matched text leave this function.
 for(const key of ['scannedLines','matchedPatchLines','category','recentErrorEvidence','matchedCategories','ambiguity','issueScopes','issueKinds']){
  const v=extra[key];
  if(key==='category'&&[...LABELS.map(([name])=>name),'unclassified'].includes(v))out[key]=v;
  else if(key==='matchedCategories'&&Array.isArray(v)&&v.length<=LABELS.length&&
    v.every(name=>LABELS.some(([known])=>known===name))&&new Set(v).size===v.length)
    out[key]=v;
  else if((key==='issueScopes'||key==='issueKinds')&&Array.isArray(v)){
    const vocabulary=key==='issueScopes'?ISSUE_SCOPES:ISSUE_KINDS;
    if(v.length<=vocabulary.length&&new Set(v).size===v.length&&
       v.every(x=>vocabulary.some(([id])=>id===x)))out[key]=v;
  }
  else if(key==='ambiguity'&&['none','single_category','multiple_categories_same_record',
    'multiple_categories_multiple_records'].includes(v))out[key]=v;
  else if(key==='recentErrorEvidence'&&typeof v==='boolean')out[key]=v;
  else if(['scannedLines','matchedPatchLines'].includes(key)&&Number.isInteger(v)&&v>=0&&v<=MAX_LINES)out[key]=v;
 }
 return out;
}
function linesFrom(input){
 const doc=rpcEnvelope(input);
 const candidates=[doc?.lines,doc?.logs,doc?.entries];
 const raw=candidates.find(x=>Array.isArray(x));
 if(!raw||raw.length>MAX_LINES*2)return null;
 return raw.slice(-MAX_LINES);
}
function rowText(item){
 // Only inspect bounded text in RAM. NEVER return these strings.
 if(typeof item==='string')return item.slice(0,4096);
 if(!item||typeof item!=='object')return '';
 try{return JSON.stringify(item).slice(0,4096)}catch{return ''}
}
export function classifyPatchLogs(input){
 const lines=linesFrom(input);
 if(!lines)return result('unsupported_log_shape');
 const matches=[];
 for(const item of lines){
  const line=rowText(item);
  if(line.includes('config.patch')||line.includes('config\\.patch'))matches.push(line);
 }
 const hints=new Set();
 for(const line of matches)for(const [name,re] of LABELS)if(re.test(line))hints.add(name);
 // The log is not correlated by request ID. Do not choose a "winner" when
 // regexes overlap in the same record; report only the matched enum names.
 const matchedCategories=LABELS.map(([name])=>name).filter(name=>hints.has(name));
 const category=matchedCategories.length===1?matchedCategories[0]:'unclassified';
 const ambiguity=matchedCategories.length===0?'none':matchedCategories.length===1?
   'single_category':matches.length===1?
   'multiple_categories_same_record':'multiple_categories_multiple_records';
 const issueScopes=approvedMatches(matches,ISSUE_SCOPES);
 const issueKinds=approvedMatches(matches,ISSUE_KINDS);
 return result('observed',{scannedLines:lines.length,matchedPatchLines:matches.length,category,
   matchedCategories,ambiguity,recentErrorEvidence:hints.size>0,issueScopes,issueKinds});
}
export async function diagnosePatchFailure({rpc=execNative}={}){
 try{
  const response=await rpc('logs.tail',{limit:MAX_LINES,maxBytes:MAX_BYTES});
  return classifyPatchLogs(response);
 }catch{return result('logs_unavailable')}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 diagnosePatchFailure().then(s=>console.log(JSON.stringify(s))).catch(()=>
  console.log(JSON.stringify(result('diagnostic_unavailable'))));
}
