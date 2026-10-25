// Incident-only reconciliation of the fixed OpenClaw Dev creation 064.
// Called within the active, exclusive per-chat watcher. It cannot create an
// Agent, execute arbitrary commands, write Gateway config or erase state.
import {lstat,readdir,readFile,realpath} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {preflightDev} from './openclaw-dev-preflight.mjs';

const OLD='openclaw-dev-create-20261025-064';
// The exact test-gated self-update task delivered BEFORE this recovery replaces
// lastTaskId=064. No other intervening task ID is accepted.
const UPDATE='openclaw-dev-backup-update-20261025-065';
const CACHE='/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos';
const URL='https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/6add3565-d868-83ec-804e-1e7a00eb0a59';
const RUN=/^run-[0-9]{8}T[0-9]{6}Z-[0-9]{1,9}-[0-9a-f]{8}\.jsonl$/;
const REPORT=/^[0-9TZ._-]+-openclaw-dev-create-20261025-064\.md$/;
const own=s=>typeof process.getuid!=='function'||s.uid===process.getuid();
const privDir=s=>s.isDirectory()&&!s.isSymbolicLink()&&own(s)&&(s.mode&0o077)===0;
const privFile=(s,max)=>s.isFile()&&!s.isSymbolicLink()&&own(s)&&
 (s.mode&0o077)===0&&s.size>0&&s.size<=max;
const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);

export function verifyFailedPrewriteReport(text){
 if(typeof text!=='string'||text.length>6000||
    !text.startsWith('# ChatGPT local task — '+OLD+'\n')||
    !text.includes('\n- Action: openclaw-dev-create\n')||
    !text.includes('\n- Status: failed\n'))return false;
 const start=text.indexOf('## Bounded output\n\n');
 if(start<0)return false;
 const fence=String.fromCharCode(96).repeat(3);
 const suffix=text.slice(start);
 if(!suffix.startsWith('## Bounded output\n\n'+fence+'text\n')||
    !suffix.endsWith('\n'+fence+'\n'))return false;
 const data=suffix.slice(('## Bounded output\n\n'+fence+'text\n').length,-('\n'+fence+'\n').length);
 if(!data||data.length>3000||data.includes('\n'))return false;
 let d;try{d=JSON.parse(data)}catch{return false}
 return object(d)&&d.audit==='IOANT_OPENCLAW_DEV_CREATE'&&
  d.schemaVersion===1&&d.state==='blocked'&&d.backup===false&&
  d.workspace===false&&d.note==='unsafe_backup_cache'&&
  d.runtimeAcknowledged!==true&&d.mainPreserved!==true&&d.alicePreserved!==true;
}
export function verifyFailedPrewriteEvents(rows){
 if(!Array.isArray(rows)||rows.length<7||rows.length>10000||
    !rows.every(x=>object(x)&&x.source==='ioant-loop'&&
      typeof x.event==='string'&&Number.isFinite(Date.parse(x.at))))return false;
 const relevant=rows.filter(x=>x.taskId===OLD);
 const expected=['task_seen','action_started','openclaw_dev_create_claimed',
  'action_finished','report_saved','feedback_pending','feedback_confirmed'];
 if(relevant.length!==expected.length||
   relevant.some((x,i)=>x.event!==expected[i]))return false;
 for(const x of relevant){
  if(['task_seen','action_started','action_finished'].includes(x.event)&&
     x.action!=='openclaw-dev-create')return false;
 }
 if(relevant[3].status!=='failed'||relevant[6].status!=='failed')return false;
 return true;
}
export function canReconcilePrewrite(state,readiness,reportText,events){
 if(!object(state)||![OLD,UPDATE].includes(state.lastTaskId)||state.feedbackPending!==null||
    state.devAgentCreationAttempted?.id!==OLD||
    state.devAgentCreationRecovery064!==undefined)return false;
 if(readiness?.audit!=='IOANT_OPENCLAW_DEV_PREFLIGHT'||
    readiness.state!=='ready'||readiness.readOnly!==true||
    readiness.configWrite!==false||readiness.writeApproved!==false)return false;
 return verifyFailedPrewriteReport(reportText)&&verifyFailedPrewriteEvents(events);
}
async function secureRead(file,max){
 const st=await lstat(file);
 if(!privFile(st,max)||await realpath(file)!==file)throw Error('unsafe_input');
 return readFile(file,'utf8');
}
async function secureDir(dir){
 const st=await lstat(dir);
 if(!privDir(st)||await realpath(dir)!==dir)throw Error('unsafe_directory');
}
export async function reconcilePrewrite(state,{url,cache=process.env.PROJECT_DEV_CACHE,
 preflight=preflightDev,read=secureRead,list=readdir,checkDir=secureDir}={}){
 if(url!==URL||cache!==CACHE||
    process.env.OPENCLAW_CONFIG_PATH||process.env.OPENCLAW_STATE_DIR||
    process.env.OPENCLAW_PROFILE)return {ok:false,reason:'unsafe_environment'};
 const logs=join(CACHE,'logs','chatgpt-loop');
 const reports=join(homedir(),'Desktop','Ioant-AI-Agent-Reports','chatgpt-loop');
 try{
  if(!object(state)||![OLD,UPDATE].includes(state.lastTaskId)||state.feedbackPending!==null||
    state.devAgentCreationAttempted?.id!==OLD||
    state.devAgentCreationRecovery064!==undefined)
   return {ok:false,reason:'claim_not_exact'};
  await checkDir(logs);await checkDir(reports);
  const ls=await list(logs),rs=await list(reports);
  if(ls.length>600||rs.length>3000)return {ok:false,reason:'evidence_listing_over_limit'};
  const matches=rs.filter(x=>REPORT.test(x));
  if(matches.length!==1)return {ok:false,reason:'report_missing_or_ambiguous'};
  const reportText=await read(join(reports,matches[0]),6000);
  if(!verifyFailedPrewriteReport(reportText))
   return {ok:false,reason:'report_does_not_prove_prewrite_block'};
  const candidateLogs=ls.filter(x=>RUN.test(x));
  const found=[];
  for(const name of candidateLogs){
   const raw=await read(join(logs,name),2*1024*1024);
   if(!raw.includes(OLD))continue;
   const rows=raw.trim().split('\n').map(x=>JSON.parse(x));
   found.push(rows);
  }
  if(found.length!==1)return {ok:false,reason:'diagnostic_evidence_ambiguous'};
  const pre=await preflight();
  if(!canReconcilePrewrite(state,pre,reportText,found[0]))
   return {ok:false,reason:'prewrite_not_verified'};
  const next={...state,devAgentCreationRecovery064:{
   id:OLD,reason:'verified_prewrite_backup_cache_block',
   at:new Date().toISOString()}};
  delete next.devAgentCreationAttempted;
  return {ok:true,state:next,reason:'prior_prewrite_failure_reconciled'};
 }catch{return {ok:false,reason:'evidence_unavailable_or_unsafe'}}
}
