// A detached session inherits the operator-approved host context, not a chat PTY.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';
import {privateDirectory,privateRead,privateWrite} from './private-files.mjs';
import {executionEnvironment} from '../integrations/chatgpt-openclaw/project-execution-command.mjs';
import {CONSOLE_ROOT,REPO,PORT} from './config.mjs';
const exec=promisify(execFile),manifest=join(CONSOLE_ROOT,'web-process.json'),log=join(CONSOLE_ROOT,'launcher.log');
const entry=join(REPO,'scripts/tunnel-console.mjs');
export async function inspectConsoleProcess(pid,{command=exec,entryPath=entry}={}){
 if(!Number.isSafeInteger(pid)||pid<2)return null;
 try{const {stdout}=await command('/bin/ps',['-p',String(pid),'-o','lstart=,command='],{env:{...executionEnvironment(),LC_ALL:'C'}});const start=stdout.trim().slice(0,24);if(!stdout.includes(entryPath))return null;return {pid,start};}catch{return null;}
}
const identity=inspectConsoleProcess;
async function current(){try{const saved=JSON.parse(await privateRead(manifest)),live=await identity(saved.pid);return live?.start===saved.start?live:null;}catch{return null;}}
const launcher=`import os,sys
node,entry,cwd,log=sys.argv[1:]
if os.fork(): os._exit(0)
os.setsid()
if os.fork(): os._exit(0)
os.umask(0o077)
os.chdir(cwd)
os.write(1,(str(os.getpid())+'\\n').encode())
fd=os.open(log,os.O_WRONLY|os.O_CREAT|os.O_APPEND,0o600)
null=os.open('/dev/null',os.O_RDONLY)
os.dup2(null,0);os.dup2(fd,1);os.dup2(fd,2)
os.close(fd);os.close(null)
os.execve(node,[node,entry],dict(os.environ))
`;
export async function manageConsole(action){
 if(!['start','stop','status'].includes(action))throw Error('use_start_stop_status');
 let live=await current();
 if(action==='start'&&!live){
  try{const r=await fetch('http://127.0.0.1:'+PORT,{signal:AbortSignal.timeout(500)});if(r.ok)throw Error('console_port_already_in_use');}catch(e){if(e.message==='console_port_already_in_use')throw e;}
  await privateDirectory(CONSOLE_ROOT,{create:true});
  const {stdout}=await exec('/usr/bin/python3',['-c',launcher,process.execPath,entry,REPO,log],{env:executionEnvironment(),timeout:5000});
  const pid=Number(stdout.trim());
  for(let i=0;i<30&&!live;i++){live=await identity(pid);if(!live)await new Promise(r=>setTimeout(r,100));}
  if(!live)throw Error('console_process_did_not_start');await privateWrite(manifest,live);
 }else if(action==='stop'&&live){
  const again=await identity(live.pid);if(again?.start!==live.start)throw Error('console_identity_changed');process.kill(live.pid,'SIGTERM');live=null;
 }
 let ready=false;
 for(let i=0;i<(action==='start'?60:1)&&!ready;i++){
  try{ready=(await fetch('http://127.0.0.1:'+PORT,{signal:AbortSignal.timeout(800)})).ok;}catch{}
  if(!ready&&action==='start')await new Promise(r=>setTimeout(r,150));
 }
 return {loaded:Boolean(live),pid:live?.pid??null,ready,url:'http://127.0.0.1:'+PORT,log,mode:'detached-session',loginAutostart:false};
}
