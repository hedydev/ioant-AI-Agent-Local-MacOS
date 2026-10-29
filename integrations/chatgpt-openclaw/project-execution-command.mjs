// Fixed argv only. Scrub inference/tunnel secrets; bounded output and own process group.
import {spawn} from 'node:child_process';
import {homedir} from 'node:os';
import {StringDecoder} from 'node:string_decoder';
import {redactFeedback} from '../../stage2/protocol.mjs';

export function executionEnvironment(source=process.env){
 const env={HOME:homedir(),PATH:'/usr/bin:/bin:/opt/homebrew/bin',LANG:'en_US.UTF-8',
  PYTHONDONTWRITEBYTECODE:'1',GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'};
 for(const k of ['TMPDIR','SSH_AUTH_SOCK'])if(typeof source[k]==='string')env[k]=source[k];
 return env;
}
export function redactExecutionOutput(text){
 return String(text).replace(/-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-\r\n]*PRIVATE KEY-----|$)/g,'[REDACTED PRIVATE KEY]')
  .split('\n').map(line=>redactFeedback(line)).join('\n');
}
export async function executionCommand(file,args,{cwd,timeout=45000,env=executionEnvironment(),limit=262144,onOutput}={}){
 return new Promise(done=>{
  let stdout='',stderr='',truncated=false,timedOut=false,settled=false,killTimer;
  let outputQueue=Promise.resolve(),outputFailed=false,streamBytes=0;
  const streams=Object.fromEntries(['stdout','stderr'].map(k=>[k,{decoder:new StringDecoder('utf8'),line:'',drop:false,key:false}]));
  const emit=text=>{
   if(!onOutput||!text)return;
   if(streamBytes+Buffer.byteLength(text)>limit){truncated=true;return;}
   streamBytes+=Buffer.byteLength(text);
   outputQueue=outputQueue.then(()=>onOutput(text)).catch(()=>{outputFailed=true;});
  };
  const redactLine=(s,line)=>{
   if(s.drop){s.drop=false;return '[overlong output line omitted]\n';}
   if(s.key){if(/-----END [^-\r\n]*PRIVATE KEY-----/.test(line))s.key=false;return '';}
   if(/-----BEGIN [^-\r\n]*PRIVATE KEY-----/.test(line)){
    s.key=!/-----END [^-\r\n]*PRIVATE KEY-----/.test(line);return '[REDACTED PRIVATE KEY]\n';
   }
   return redactFeedback(line)+'\n';
  };
  const streamText=(name,text,flush=false)=>{
   const s=streams[name];let out='';
   for(const piece of text.split(/(?<=\n)/)){
    if(!s.drop)s.line+=piece;
    if(s.line.length>8192){s.drop=true;s.key=true;s.line='';truncated=true;}
    if(piece.endsWith('\n')){out+=redactLine(s,s.line);s.line='';}
   }
   if(flush&&(s.line||s.drop)){out+=redactLine(s,s.line);s.line='';}
   emit(out);
  };
  const child=spawn(file,args,{cwd,env,shell:false,detached:true,stdio:['ignore','pipe','pipe']});
  const stop=signal=>{try{if(child.pid)process.kill(-child.pid,signal);}catch{}};
  const timer=setTimeout(()=>{timedOut=true;stop('SIGTERM');killTimer=setTimeout(()=>stop('SIGKILL'),2000);},timeout);
  const collect=stream=>chunk=>{
   const text=streams[stream].decoder.write(chunk);
   if(stream==='stdout')stdout+=text;else stderr+=text;
   streamText(stream,text);
   if(Buffer.byteLength(stdout)>limit){stdout=stdout.slice(-Math.floor(limit/4));truncated=true;}
   if(Buffer.byteLength(stderr)>limit){stderr=stderr.slice(-Math.floor(limit/4));truncated=true;}
  };
  child.stdout.on('data',collect('stdout'));child.stderr.on('data',collect('stderr'));
  const finish=async extra=>{if(settled)return;settled=true;clearTimeout(timer);clearTimeout(killTimer);
   for(const name of ['stdout','stderr'])streamText(name,streams[name].decoder.end(),true);
   await outputQueue;
   done({ok:extra.exitCode===0&&!timedOut&&!outputFailed,stdout,stderr,truncated,timedOut,outputFailed,...extra});};
  child.once('error',()=>finish({exitCode:null,spawnFailed:true}));
  child.once('close',(code,signal)=>finish({exitCode:code,signal}));
 });
}
export const GIT_ARGS=['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false',
 '-c','submodule.recurse=false','-c','core.sshCommand=/usr/bin/ssh -oBatchMode=yes'];
