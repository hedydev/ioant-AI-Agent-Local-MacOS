// Browser debugging is optional transport, never a dependency of repository jobs.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {executionEnvironment} from './project-execution-command.mjs';
import {ComputerTaskStore,operationId} from './computer-task-store.mjs';
import {EXECUTION_PARENT} from './project-execution-policy.mjs';
import {loadWorkspaceAccess} from './workspace-access.mjs';
const exec=promisify(execFile);
export async function browserSessionCommand(action){
 const args=['browser','--browser-profile','chrome',action,'--json'];
 const {stdout}=await exec(join(homedir(),'.openclaw/bin/openclaw'),args,
  {env:executionEnvironment(),timeout:20000,maxBuffer:1048576});
 return JSON.parse(stdout);
}
export async function browserSessionStatus({command=browserSessionCommand}={}){
 const results=await Promise.allSettled([command('status'),command('tabs')]);
 const status=results[0].status==='fulfilled'?results[0].value:null;
 const tabs=results[1].status==='fulfilled'?results[1].value?.tabs:null;
 const attached=status?.enabled===true&&status?.running===true&&Array.isArray(tabs)&&tabs.length>0;
 return {state:attached?'connected':status&&Array.isArray(tabs)?'not_attached':'unavailable',
  checkedAt:new Date().toISOString(),serviceRunning:status?.running===true,
  attachedTabCount:Array.isArray(tabs)?tabs.length:null,chromeDebugConnected:attached,
  repositoryExecutionRequiresChromeDebug:false,modelInferenceInvoked:false,
  ...(attached?{}:{nextAction:'For an explicitly requested browser task, connect the existing OpenClaw Chrome Debug session. If Chrome requires a user confirmation, report it; never reinstall, reset permissions or keep reconnecting after cancellation.'})};
}
export async function openclawCapabilities(input,{load=loadWorkspaceAccess,status=browserSessionStatus}={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)return {state:'blocked',reason:'invalid_capability_query'};
 const checks=await Promise.allSettled([load(),status()]);
 const access=checks[0].status==='fulfilled'?checks[0].value:null;
 return {state:'capabilities',readOnly:true,modelInferenceInvoked:false,
  repositoryTasks:{implemented:true,workspaceAccessConfigured:!!access,projectConnectForNewRepositories:true,
   requiresChromeDebug:false,requiresComputerControl:false,requiresLocalModel:false,
   tools:['openclaw_workspace_projects','openclaw_project_connect','openclaw_project_execute','openclaw_project_result','openclaw_project_report']},
  nativeDesktop:{tool:'openclaw_computer_task',permissionPerProject:true,localModelRequired:true,
   nativeInputRequiresChromeDebug:false,browserDomActionsMayRequireBrowserConsent:true},
  browser:checks[1].status==='fulfilled'?checks[1].value:{state:'unavailable',chromeDebugConnected:false},
  instructions:'Use repository tasks for Git, scripts and reports even when Chrome Debug is off. Only enable browser access for a user-requested browser UI task; never use it as an enrollment or shell workaround.'};
}
export async function browserSession(input,{command=browserSessionCommand,status=()=>browserSessionStatus({command}),
 store=new ComputerTaskStore(join(EXECUTION_PARENT,'direct-browser-connect'))}={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||
  !['status','connect'].includes(input.action)||Object.keys(input).sort().join(',')!==
   (input.action==='status'?'action':'action,operation_id')||
  input.action==='connect'&&(typeof input.operation_id!=='string'||!operationId.test(input.operation_id)))
  return {state:'blocked',reason:'invalid_browser_session_request'};
 if(input.action==='status')return status();
 const id=input.operation_id,digest=createHash('sha256').update('connect_existing_chrome_debug').digest('hex');
 let claim;
 try{
  claim=await store.begin(id,digest);
  if(!claim.created)return claim.record.state==='finished'?{...claim.record.result,cached:true,
   resultScope:'Historical connection attempt; query status for current attachment.'}:
   {state:'inconclusive',operationId:id,doNotRepeat:true,reason:'browser_connection_started_query_same_id'};
  let result=await status();
  if(!result.chromeDebugConnected){await command('start');result=await status();}
  const out={...result,state:result.chromeDebugConnected?'connected':'user_action_required',operationId:id,
   doNotRepeat:true,configurationChanged:false,extensionInstalled:false,permissionsReset:false,
   ...(result.chromeDebugConnected?{}:{reason:'chrome_debug_not_attached',
    nextAction:'The configured browser service is running but no debug tabs are attached. Enable Debug Browser in the existing OpenClaw Chrome extension and complete any Chrome confirmation. Then query status; do not repeat connect under new IDs.'})};
  await store.finish(id,digest,out);return out;
 }catch{
  const out={state:'inconclusive',operationId:id,doNotRepeat:true,reason:'browser_connection_requires_review'};
  if(claim?.created)await store.finish(id,digest,out).catch(()=>{});return out;
 }
}
