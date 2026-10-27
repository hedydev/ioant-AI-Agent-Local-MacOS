#!/usr/bin/env node
// Post-hoc, read-only AliceAI coordinator LaunchAgent log categorization.
// No browser calls, ChatGPT content, Chrome/Relay commands, service control,
// chat sends, state changes, or raw log-line output.
import {lstat,open,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {homedir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(homedir(),'Library','Application Support','ioant-openclaw-ops','runtime');
const DIR=join(homedir(),'Library','Logs','ioant-openclaw-ops','alice-coordinator');
const LOGS=['stdout.log','stderr.log'];
const MAX_FILE=32*1024*1024, MAX_TAIL=96*1024;
const AUDIT='IOANT_ALICE_COORDINATOR_LOCAL_LOG_AUDIT';
const KINDS=['relay_missing_target','relay_zero_tabs','relay_duplicate_target',
 'relay_waiting','page_not_ready','page_ready_or_idle','handshake_confirmed',
 'handshake_ambiguous','worker_start','fatal_error'];
const isOwned=(s)=>!s.isSymbolicLink()&&
 (typeof process.getuid!=='function'||s.uid===process.getuid())&&
 (s.mode&0o077)===0;
const isPrivateDir=s=>s.isDirectory()&&isOwned(s);
const isPrivateFile=s=>s.isFile()&&isOwned(s);

export function classifyLine(line){
 if(typeof line!=='string'||line.length>4096)return null;
 if(/CHROME_RELAY_ZERO_TABS|chrome_relay_zero_tabs/.test(line))return 'relay_zero_tabs';
 if(/duplicate_exact|duplicate.*chat.*tab/i.test(line))return 'relay_duplicate_target';
 if(/different_chat_visible|no_chatgpt_tab_visible|sameConversationId=0/.test(line))
  return 'relay_missing_target';
 if(line.includes('Waiting for authorized ChatGPT conversation:'))return 'relay_waiting';
 if(line.includes('ChatGPT tab not ready:'))return 'page_not_ready';
 if(line.includes('Alice coordinator handshake')&&
  /confirmed in exact Project Chat|user message confirmed|confirmed without replay/.test(line))
  return 'handshake_confirmed';
 if(line.includes('Alice coordinator handshake')&&
  /uncertain|deferred/.test(line))return 'handshake_ambiguous';
 if(line.includes('Waiting for a structured ChatGPT task')||
    line.includes('Watch heartbeat: idle;')||
    line.includes('Read-only ChatGPT probe passed:'))return 'page_ready_or_idle';
 if(line.includes('AliceAI isolated coordinator:'))return 'worker_start';
 if(line.includes('FATAL')||line.includes('UnhandledPromiseRejection'))return 'fatal_error';
 return null;
}
export function summarizeLines(lines){
 const counts=Object.fromEntries(KINDS.map(x=>[x,0]));
 const recent=[];
 for(const line of lines.slice(-350)){
  const code=classifyLine(line);
  if(!code)continue;
  counts[code]++;
  recent.push(code);
 }
 return {counts,recent:recent.slice(-6)};
}
async function safeLog(name){
 const path=join(DIR,name);
 let stat;
 try{stat=await lstat(path)}
 catch(e){return {state:e?.code==='ENOENT'?'missing':'inaccessible'};}
 if(!isPrivateFile(stat)||stat.size>MAX_FILE||
    await realpath(path)!==path)return {state:'unsafe_or_oversize'};
 let h;
 try{
  h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  const live=await h.stat();
  if(!isPrivateFile(live)||live.ino!==stat.ino||live.dev!==stat.dev||
     live.size!==stat.size)return {state:'changed_during_read'};
  const size=Math.min(live.size,MAX_TAIL);
  const data=Buffer.alloc(size);
  const {bytesRead}=await h.read(data,0,size,Math.max(0,live.size-size));
  const changed=await lstat(path);
  if(changed.ino!==live.ino||changed.dev!==live.dev||
     !isPrivateFile(changed))return {state:'changed_during_read'};
  const sample=data.subarray(0,bytesRead).toString('utf8');
  const pieces=sample.split(/\r?\n/);
  if(live.size>size)pieces.shift();
  return {state:'observed',lastModified:live.mtime.toISOString(),
    sampledBytes:bytesRead,...summarizeLines(pieces)};
 }catch{return {state:'read_failed'};}
 finally{if(h)await h.close();}
}
export async function inspectAliceLocalLogs(){
 if(process.platform!=='darwin'||ROOT!==RUNTIME||
    await realpath(RUNTIME)!==RUNTIME)return {audit:AUDIT,state:'blocked',reason:'private_mac_runtime_required'};
 const st=await lstat(DIR);
 if(!isPrivateDir(st)||await realpath(DIR)!==DIR)
  return {audit:AUDIT,state:'blocked',reason:'unsafe_log_directory'};
 const result={};
 for(const file of LOGS)result[file.replace('.log','')]=await safeLog(file);
 return {audit:AUDIT,schemaVersion:1,state:'observed',readOnly:true,
  browserAccess:false,chatContentRead:false,changedServices:false,
  logs:result};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let result;
 try{
  if(process.argv.length!==2)throw Error('args');
  result=await inspectAliceLocalLogs();
 }catch{result={audit:AUDIT,state:'inconclusive',reason:'local_log_preflight_failed',
  readOnly:true,browserAccess:false,changedServices:false};}
 console.log(JSON.stringify(result));
 if(result.state!=='observed')process.exitCode=1;
}
