#!/usr/bin/env node
// Operator-approved terminal bridge for one bound ChatGPT Project conversation.
// Explicit local TTY enrollment; ChatGPT protocol cannot issue enable/disable.
// WARNING: zsh is not an OS sandbox. Workdir aliases are NOT access controls:
// commands can read/write any files the current macOS user can access.
import {lstat,readFile,writeFile,rename,unlink,realpath} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {boundChat,installedPlistBinding} from './ops-supervisor.mjs';

const HOME=homedir();
const DIR=join(HOME,'Library','Application Support','ioant-openclaw-ops');
const GRANT=join(DIR,'mac-terminal-grant.json');
const PLIST=join(HOME,'Library','LaunchAgents','com.ioant.openclaw.safe-watcher.plist');
const VERSION=1;
const ROOTS=Object.freeze({
 workspace:join(HOME,'Documents','workspace'),
 desktop:join(HOME,'Desktop'),
 downloads:join(HOME,'Downloads')
});
const MAX_OUTPUT=2400;
const MAX_COMMAND=2048;
const allowed=x=>x&&typeof x==='object'&&!Array.isArray(x);
const owner=s=>typeof process.getuid!=='function'||s.uid===process.getuid();
const privateDirectory=s=>s.isDirectory()&&!s.isSymbolicLink()&&owner(s)&&(s.mode&0o077)===0;
const privateFile=s=>s.isFile()&&!s.isSymbolicLink()&&owner(s)&&(s.mode&0o077)===0;
const reply=(state,reason,extra={})=>({audit:'IOANT_MAC_TERMINAL_ACCESS',
 schemaVersion:VERSION,state,reason,...extra});
const cwdKey=key=>typeof key==='string'&&Object.hasOwn(ROOTS,key);
const validCommand=value=>typeof value==='string'&&value.trim().length>0&&
 value.length<=MAX_COMMAND&&Buffer.byteLength(value,'utf8')<=4096&&
 !/[\x00-\x08\x0B-\x1F\x7F]/.test(value);

async function safeGrantDirectory(){
 const stat=await lstat(DIR);
 if(!privateDirectory(stat))throw Error('unsafe_grant_directory');
}
async function installedChat(){
 const s=await lstat(PLIST);
 if(!privateFile(s)||s.size>20000)throw Error('unsafe_plist');
 const binding=installedPlistBinding(await readFile(PLIST,'utf8'));
 if(!binding||binding.kind!=='local')throw Error('unrecognized_plist');
 return binding;
}
async function readGrant(){
 try{
  const s=await lstat(GRANT);
  if(!privateFile(s)||s.size>1024)return {state:'invalid'};
  const data=JSON.parse(await readFile(GRANT,'utf8'));
  if(!allowed(data)||data.version!==VERSION||data.permission!=='terminal'||
   typeof data.conversationId!=='string'||!data.conversationId.match(/^[a-f0-9-]{36}$/i)||
   !Array.isArray(data.roots)||data.roots.join(',')!=='workspace,desktop,downloads')
    return {state:'invalid'};
  return {state:'enabled',conversationId:data.conversationId};
 }catch(e){return {state:e?.code==='ENOENT'?'disabled':'invalid'};}
}
export async function inspectTerminalAccess({conversationUrl}={}){
 try{
  await safeGrantDirectory();
  const binding=await installedChat();
  const grant=await readGrant();
  if(grant.state!=='enabled')return reply(grant.state,'operator_grant_required');
  const supplied=conversationUrl?boundChat(conversationUrl).conversationId:binding.conversationId;
  if(binding.conversationId!==grant.conversationId||supplied!==grant.conversationId)
   return reply('disabled','grant_bound_to_other_conversation');
  return reply('enabled','operator_approved',
   {conversationId:grant.conversationId,roots:Object.keys(ROOTS)});
 }catch{return reply('blocked','binding_or_grant_unverified');}
}
async function changeGrant(action){
 // A ChatGPT task/LaunchAgent has no TTY and can never grant itself access.
 if(process.platform!=='darwin'||!process.stdin.isTTY||!process.stdout.isTTY)
  return reply('blocked','local_interactive_terminal_required');
 try{
  await safeGrantDirectory();
  const binding=await installedChat();
  if(action==='disable'){
   const current=await readGrant();
   if(current.state==='invalid')return reply('blocked','invalid_grant_requires_manual_review');
   if(current.state==='enabled')await unlink(GRANT);
   return reply('disabled','operator_revoked');
  }
  if(action!=='enable')return reply('blocked','unsupported_action');
  const g=await readGrant();
  if(g.state==='invalid')return reply('blocked','invalid_grant_requires_manual_review');
  if(g.state==='enabled'&&g.conversationId!==binding.conversationId)
   return reply('blocked','previous_conversation_grant_requires_manual_revocation');
  const temp=GRANT+'.pending-'+process.pid+'-'+randomBytes(5).toString('hex');
  const payload={version:VERSION,permission:'terminal',
   conversationId:binding.conversationId,
   roots:['workspace','desktop','downloads'],
   approvedAt:new Date().toISOString()};
  try{
   await writeFile(temp,JSON.stringify(payload)+'\n',{mode:0o600,flag:'wx'});
   if(!privateFile(await lstat(temp)))throw Error('unsafe_pending_grant');
   await rename(temp,GRANT);
  }finally{try{await unlink(temp);}catch(e){if(e?.code!=='ENOENT')throw Error('pending_grant_cleanup_error');}}
  const verified=await readGrant();
  if(verified.state!=='enabled'||verified.conversationId!==binding.conversationId)
   return reply('blocked','grant_write_unverified');
  return reply('enabled','operator_approved',{conversationId:binding.conversationId,
   roots:Object.keys(ROOTS),shell:'/bin/zsh'});
 }catch{return reply('blocked','local_preflight_failed');}
}
function scrubEnv(){
 const env={...process.env};
 for(const k of Object.keys(env))
  if(/(?:TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL|AUTHORIZATION|COOKIE)/i.test(k)||
   ['OPENCLAW_GATEWAY_URL','IOANT_LOOP_LOG_FILE','NODE_TEST_CONTEXT'].includes(k))
   delete env[k];
 env.HISTFILE='/dev/null';
 env.ZDOTDIR='/dev/null';
 return env;
}
async function scopedRoot(alias){
 const root=ROOTS[alias];
 const original=await lstat(root);
 if(!original.isDirectory()||original.isSymbolicLink()||!owner(original))
  throw Error('unsafe_requested_root');
 const resolved=await realpath(root);
 // Root must not be a symlink redirect to an unrelated directory.
 if(resolved!==root)throw Error('noncanonical_root');
 return resolved;
}
export async function runMacTerminal(task,{conversationUrl,authorize=inspectTerminalAccess,
 rootResolve=scopedRoot,execute=spawn}={}){
 if(!allowed(task)||task.action!=='mac-terminal'||!cwdKey(task.cwd)||
  !validCommand(task.command))return {status:'approval_required',reason:'invalid_terminal_task'};
 const granted=await authorize({conversationUrl});
 if(granted?.state!=='enabled')return {status:'approval_required',
  reason:granted?.reason??'terminal_grant_required'};
 let cwd;
 try{cwd=await rootResolve(task.cwd);}catch{return {status:'failed',reason:'requested_root_unavailable'};}
 const started=performance.now();
 return await new Promise(done=>{
  let finished=false,timedOut=false,output='';
  let proc,timer=null;
  const finish=v=>{
   if(finished)return;
   finished=true;
   if(timer)clearTimeout(timer);
   done({...v,elapsedMs:Math.round(performance.now()-started),
    output:output.slice(-MAX_OUTPUT)});
  };
  try{
   proc=execute('/bin/zsh',['-f','-c',task.command],{
    cwd,env:scrubEnv(),shell:false,detached:true,
    stdio:['ignore','pipe','pipe']});
  }catch{return finish({status:'execution_error',reason:'spawn_failure'});}
  const collect=chunk=>{
   // Bound memory; carry only the end of output and never echo raw commands.
   output=(output+String(chunk)).slice(-MAX_OUTPUT);
  };
  proc.stdout?.on('data',collect);
  proc.stderr?.on('data',collect);
  proc.on('error',()=>finish({status:'execution_error',reason:'spawn_failure'}));
  // Kill entire detached process group, not only zsh, to avoid abandoned jobs.
  const timeout=300000;
  timer=setTimeout(()=>{
   timedOut=true;
   try{process.kill(-proc.pid,'SIGKILL');}catch{try{proc.kill('SIGKILL');}catch{}}
  },timeout);
  proc.on('close',code=>{
   finish({status:timedOut?'timed_out':code===0?'passed':'failed',
    exitCode:Number.isInteger(code)?code:-1});
  });
 });
}
const ENTRY=fileURLToPath(import.meta.url);
if(process.argv[1]&&resolve(process.argv[1])===ENTRY){
 const args=process.argv.slice(2);
 const result=args.length===1&&args[0]==='status'?await inspectTerminalAccess():
  args.length===1&&['enable','disable'].includes(args[0])?
    await changeGrant(args[0]):reply('blocked','usage_enable_disable_or_status');
 console.log(JSON.stringify(result));
 if(!['enabled','disabled'].includes(result.state))process.exitCode=1;
}
