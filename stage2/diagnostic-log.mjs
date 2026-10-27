// Private, bounded and diagnostic-only event log for the opt-in ChatGPT loop.
// Never record browser DOM, chat messages, command stdout, secrets or raw errors.
import {
  mkdirSync, lstatSync, realpathSync, openSync, closeSync, appendFileSync,
  readdirSync, unlinkSync
} from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';

const MAX_SEGMENT=2*1024*1024;
const MAX_SEGMENTS=4;
const KEEP_DAYS=30;
const SESSION=/^run-[0-9]{8}T[0-9]{6}Z-[0-9]{1,9}-[0-9a-f]{8}\.jsonl$/;
const PART=/^run-[0-9]{8}T[0-9]{6}Z-[0-9]{1,9}-[0-9a-f]{8}(?:\.part[1-3])?\.jsonl$/;
const EVENTS=new Set([
 'launcher_start','gateway_existing','gateway_temporary','gateway_stopped',
 'gateway_error','browser_profile','tab_found','tab_missing','launcher_exit',
 'tab_retry_started','tab_retry_recovered','tab_retry_timeout','tab_retry_error',
 'worker_start','page_ready','page_not_ready','browser_circuit_open',
 'browser_circuit_recovered','read_only_success',
 'initialization_attempt','initialization_pending','initialization_sent',
 'initialization_reconciled','initialization_uncertain','receipt_unconfirmed','lab_probe_claimed',
  'openclaw_dev_create_claimed','dev_discussion_claimed','task_seen','action_started',
 'action_finished','report_saved','feedback_pending','feedback_confirmed',
 'invalid_task_feedback_pending','invalid_task_feedback_confirmed',
 'watch_heartbeat','watch_stopped','worker_error','log_capacity_reached'
]);
const META_KEYS=new Set(['action','taskId','status','code','elapsedMs','exitCode','profile','mode']);
function isSafeValue(k,v){
 if(k==='elapsedMs'||k==='exitCode')return Number.isSafeInteger(v)&&v>=-1&&v<=2147483647;
 return typeof v==='string'&&v.length<=80&&/^[a-zA-Z0-9_-]+$/.test(v);
}
function requireSafeFile(file){
 const st=lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0||
    (typeof process.getuid==='function'&&st.uid!==process.getuid()))
   throw Error('Diagnostic log file is not private and regular');
 return st;
}
// A background LaunchAgent cannot assume Terminal's LunaDrive or Desktop TCC grants.
function location(){
 if(process.env.IOANT_BACKGROUND_SAFE_REPORTS==='1'){
   const base=join(homedir(),'Library','Application Support','ioant-openclaw-ops');
   return {base,dir:join(base,'logs','chatgpt-loop'),background:true};
 }
 const base=process.env.PROJECT_DEV_CACHE;
 if(!base)throw Error('Project cache not configured');
 return {base,dir:join(base,'logs','chatgpt-loop'),background:false};
}
function ownedPrivateDir(path){
 const st=lstatSync(path);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||
    (typeof process.getuid==='function'&&st.uid!==process.getuid()))
   throw Error('Background diagnostic directory is not private');
}
function safeDir(dir){
 const target=location();
 if(resolve(dir)!==resolve(target.dir))throw Error('Unsafe diagnostic destination');
 const root=realpathSync(target.base);
 if(realpathSync(dir)!==join(root,'logs','chatgpt-loop')||
    lstatSync(dirname(dir)).isSymbolicLink()||
    lstatSync(target.base).isSymbolicLink())
   throw Error('Diagnostic log path redirect refused');
 if(target.background){
   // The background root and logs folder must be owner-only and non-symlink.
   ownedPrivateDir(target.base);
   ownedPrivateDir(dirname(dir));
 }
 ownedPrivateDir(dir);
}
export function createDiagnosticLog(dir){
 const target=location();
 if(resolve(dir)!==resolve(target.dir))throw Error('Unsafe diagnostics destination');
 mkdirSync(dir,{recursive:true,mode:0o700});
 safeDir(dir);
 const stamp=new Date().toISOString().replace(/[-:]/g,'').slice(0,15)+'Z';
 const path=join(dir,'run-'+stamp+'-'+process.pid+'-'+randomBytes(4).toString('hex')+'.jsonl');
 if(!SESSION.test(basename(path)))throw Error('Log filename invalid');
 const fd=openSync(path,'wx',0o600);
 closeSync(fd);
 // Remove only old, regular, same-owner diagnostic files; leave live/recent logs.
 const cutoff=Date.now()-KEEP_DAYS*86400000;
 for(const name of readdirSync(dir)){
   if(!PART.test(name)||name===basename(path))continue;
   const candidate=join(dir,name);
   try{
     const st=requireSafeFile(candidate);
     if(st.mtimeMs<cutoff)unlinkSync(candidate);
   }catch {/* Unsafe/foreign files are never touched. */}
 }
 return path;
}
export function diagnosticCode(error){
 const message=String(error?.message??error??'').slice(0,1000);
 if(/requires credentials|authentication|auth.token|auth.password/i.test(message))return 'gateway_auth';
 if(/ssrf|proxy-routed|Navigation blocked/i.test(message))return 'browser_ssrf';
 if(/No matching|Expected one open target|not available|target ChatGPT tab/i.test(message))return 'tab_missing';
 if(/composer|input not detected|ChatGPT input|snapshot|textbox/i.test(message))return 'composer';
 if(/watch\.lock|Already.*watcher|another watcher|EEXIST/i.test(message))return 'lock';
 if(/timeout|timed out/i.test(message))return 'timeout';
 if(/feedback pending|Message send|send could not be confirmed/i.test(message))return 'send_uncertain';
 if(/ECONN|GatewayClientRequestError|Chrome MCP|extension|relay/i.test(message))return 'browser_connection';
 return 'unexpected';
}
export function recordDiagnosticEvent(event,meta={},path=process.env.IOANT_LOOP_LOG_FILE){
 if(!path)return false; // Standalone tests and imports never log.
 if(!EVENTS.has(event))throw Error('Unknown diagnostic event');
 if(!SESSION.test(basename(path)))throw Error('Invalid diagnostic log name');
 safeDir(dirname(path));
 const data={at:new Date().toISOString(),source:'ioant-loop',event};
 for(const [key,val] of Object.entries(meta)){
   if(!META_KEYS.has(key)||!isSafeValue(key,val))throw Error('Unsafe diagnostic metadata field: '+key);
   data[key]=val;
 }
 const line=JSON.stringify(data)+'\n';
 for(let segment=0;segment<MAX_SEGMENTS;segment++){
   const dest=segment===0?path:path.slice(0,-6)+'.part'+segment+'.jsonl';
   let st;
   try{st=requireSafeFile(dest)}
   catch(e){
     if(e.code!=='ENOENT')throw e;
     if(segment===0)throw Error('Diagnostic log was removed during session');
     const fd=openSync(dest,'wx',0o600);closeSync(fd);
     st=requireSafeFile(dest);
   }
   if(st.size+Buffer.byteLength(line)<=MAX_SEGMENT){
     appendFileSync(dest,line,{encoding:'utf8',flag:'a'});
     return true;
   }
 }
 return false; // Bounded even for a multi-day watcher; no raw output fallback.
}
function cli(){
 const [, ,cmd,arg,key,value]=process.argv;
 if(cmd==='init'){
   const file=createDiagnosticLog(arg);
   process.stdout.write(file+'\n');
 }else if(cmd==='event'){
   const meta=key?{[key]:key==='exitCode'?Number(value):value}:{};
   recordDiagnosticEvent(arg,meta);
 }else{
   throw Error('Usage: diagnostic-log.mjs init <private-log-dir> | event <allowlisted-event>');
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{cli()}catch(e){console.error('[loop-log] '+diagnosticCode(e));process.exitCode=1}
}
