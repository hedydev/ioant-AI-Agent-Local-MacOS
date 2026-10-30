import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,realpath,unlink} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {executionEnvironment} from '../integrations/chatgpt-openclaw/project-execution-command.mjs';
import {privateDirectory,privateWrite} from './private-files.mjs';
import {TUNNEL_BINARY,PROFILE_DIR,PROFILE,HEALTH_FILE,PROCESS_FILE,CONTROL_PROXY,REPO,CONSOLE_ROOT} from './config.mjs';
import {cleanText} from './diagnostics.mjs';
import {outputCollector} from './external-output.mjs';

const exec=promisify(execFile);
export async function inspectProcess(pid,{binary=TUNNEL_BINARY,profileDir=PROFILE_DIR,profile=PROFILE,command=exec}={}){
 if(!Number.isSafeInteger(pid)||pid<2)return null;
 try{
  const psOptions={timeout:2000,env:{...executionEnvironment(),LC_ALL:'C'}};
  const {stdout}=await command('/bin/ps',['-p',String(pid),'-o','uid=,lstart=,comm='],psOptions);
  const match=stdout.trim().match(/^(\d+)\s+(.{24})\s+(.+)$/);
  if(!match||Number(match[1])!==process.getuid()||match[3]!==binary||await realpath(binary)!==binary)return null;
  const args=(await command('/bin/ps',['-p',String(pid),'-o','command='],psOptions)).stdout;
  // Expected profile identity only. Never return argv or inspect process environments.
  if(!args.includes('--profile-dir '+profileDir)||!args.includes('--profile '+profile))return null;
  return {pid,start:match[2],binary};
 }catch{return null;}
}
export async function listenerIdentity(url,options={}){
 if(!url)return null;const port=new URL(url).port;
 try{const {stdout}=await exec('/usr/sbin/lsof',['-nP','-a','-iTCP:'+port,'-sTCP:LISTEN','-Fp'],{timeout:2500});
  const ids=[...new Set([...stdout.matchAll(/^p(\d+)$/gm)].map(m=>Number(m[1])))];
  return ids.length===1?inspectProcess(ids[0],options):null;
 }catch{return null;}
}
export async function configuredProcesses(options={}){
 const binary=options.binary??TUNNEL_BINARY;
 try{const {stdout}=await exec('/bin/ps',['-axo','pid=,comm='],{timeout:2500});const rows=[];
  for(const line of stdout.split('\n')){const m=line.trim().match(/^(\d+)\s+(.+)$/);if(m?.[2]===binary){const p=await inspectProcess(Number(m[1]),options);if(p)rows.push(p);}}
  return rows;
 }catch{throw Error('process_discovery_failed');}
}
export class TunnelController{
 constructor(diagnostics,{binary=TUNNEL_BINARY,profileDir=PROFILE_DIR,profile=PROFILE,healthFile=HEALTH_FILE,processFile=PROCESS_FILE,
  proxy=CONTROL_PROXY,spawnImpl=spawn,command=exec,inspect=inspectProcess,identify=listenerIdentity,findProcesses=configuredProcesses,signal=(pid,s)=>process.kill(pid,s)}={}){
  Object.assign(this,{diagnostics,binary,profileDir,profile,healthFile,processFile,proxy,spawnImpl,command,inspect,identify,findProcesses,signal});this.child=null;this.identity=null;this.key=null;this.busy=false;this.lastExit=null;
 }
 async observe(health){
  const id=health.url?await this.identify(health.url,{binary:this.binary,profileDir:this.profileDir,profile:this.profile}):null;
  this.identity=id;
  return {pid:id?.pid??null,start:id?.start??null,managed:Boolean(id&&id.pid===this.child?.pid),canStop:Boolean(id),hasRuntimeKey:Boolean(this.key),busy:this.busy,lastExit:this.lastExit};
 }
 async exclusive(run){
  if(this.busy)throw Error('lifecycle_busy');
  this.busy=true;try{return await run();}finally{this.busy=false;}
 }
 rememberKey(runtimeKey){
  if(runtimeKey!==undefined&&runtimeKey!==''){
   if(typeof runtimeKey!=='string'||!/^[A-Za-z0-9_-]{16,512}$/.test(runtimeKey))throw Error('invalid_runtime_key');this.key=runtimeKey;
  }
  if(!this.key)throw Error('runtime_key_required');
 }
 start(runtimeKey,health){return this.exclusive(()=>this.launch(runtimeKey,health));}
 async launch(runtimeKey,health){
  if(health.url)throw Error('tunnel_already_running');
  if(this.child&&this.lastExit===null)throw Error('tunnel_starting');
  this.rememberKey(runtimeKey);
   if((await this.findProcesses({binary:this.binary,profileDir:this.profileDir,profile:this.profile})).length)throw Error('tunnel_already_running');
   await privateDirectory(dirname(this.healthFile),{create:true});await realpath(this.binary);await readFile(join(this.profileDir,this.profile+'.yaml'));
   await unlink(this.healthFile).catch(e=>{if(e.code!=='ENOENT')throw e;});
   const env={...executionEnvironment(),CONTROL_PLANE_API_KEY:this.key,HEALTH_URL_FILE:this.healthFile,LOG_LEVEL:'info',LOG_FORMAT:'json'};
   const child=this.spawnImpl(this.binary,['run','--profile-dir',this.profileDir,'--profile',this.profile,'--control-plane.http-proxy',this.proxy],
    {cwd:REPO,env,stdio:['ignore','pipe','pipe'],shell:false});
   this.child=child;this.lastExit=null;
   for(const stream of [child.stdout,child.stderr]){
    const line=text=>{try{const r=JSON.parse(text);this.diagnostics.record('tunnel_output',{source:'tunnel',level:String(r.level??'info').toLowerCase(),message:r.msg??r.message??text});}
     catch{this.diagnostics.record('tunnel_output',{source:'tunnel',message:cleanText(text)});}};
    const collector=outputCollector(line);stream?.on('data',collector.write);stream?.on('end',collector.end);
   }
   child.once('exit',(code,signal)=>{this.lastExit={code,signal,at:new Date().toISOString()};this.diagnostics.record('tunnel_exited',{pid:child.pid,exitCode:code??-1,state:signal?'signalled':'exited'});});
   await new Promise((ok,bad)=>{child.once('spawn',ok);child.once('error',()=>bad(Error('tunnel_launch_failed')));});
   // The process may exit during startup. Only save a verified identity.
   let id=null;for(let i=0;i<10&&!id;i++){id=await this.inspect(child.pid,{binary:this.binary,profileDir:this.profileDir,profile:this.profile});if(!id)await new Promise(r=>setTimeout(r,50));}
   if(id)await privateWrite(this.processFile,id);
   this.diagnostics.record('tunnel_started',{pid:child.pid,source:'console'});return {state:'starting',pid:child.pid};
 }
 stop(health){return this.exclusive(()=>this.stopVerified(health));}
 async stopVerified(health){
   const id=await this.identify(health.url,{binary:this.binary,profileDir:this.profileDir,profile:this.profile});
   if(!id)throw Error('verified_tunnel_process_required');
   const fresh=await this.inspect(id.pid,{binary:this.binary,profileDir:this.profileDir,profile:this.profile});
   if(!fresh||fresh.start!==id.start)throw Error('process_identity_changed');
   this.signal(id.pid,'SIGTERM');this.diagnostics.record('tunnel_stop_requested',{pid:id.pid,source:'console'});
   // No force-kill, no broad pkill and no Gateway/Agent/job termination.
   return {state:'stopping',pid:id.pid};
 }
 restart(runtimeKey,health){return this.exclusive(async()=>{
  const priorKey=this.key;
  this.rememberKey(runtimeKey);
  // Verify the new credential/config before touching the existing working process.
  try{await this.command(this.binary,['doctor','--profile-dir',this.profileDir,'--profile',this.profile,'--control-plane.http-proxy',this.proxy,'--explain'],
   {env:{...executionEnvironment(),CONTROL_PLANE_API_KEY:this.key},timeout:30000,maxBuffer:2*1024*1024});}
  catch{this.key=priorKey;this.diagnostics.record('runtime_validation_failed',{source:'console',level:'warn',reason:'runtime_validation_failed'});throw Error('runtime_validation_failed');}
  this.diagnostics.record('runtime_validated',{source:'console'});
  const stopped=await this.stopVerified(health);
  for(let i=0;i<60;i++){
   const live=await this.inspect(stopped.pid,{binary:this.binary,profileDir:this.profileDir,profile:this.profile});
   if(!live)return this.launch(undefined,{});
   await new Promise(resolve=>setTimeout(resolve,200));
  }
  throw Error('tunnel_stop_timeout');
 });}
 forgetKey(){this.key=null;this.diagnostics.record('runtime_key_forgotten',{source:'console'});}
}
