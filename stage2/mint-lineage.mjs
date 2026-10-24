// Explicit opt-in, read-only follow-up for the already trusted Mint helper.
// First and last identity are root-witnessed; intervening commands are
// unprivileged, fixed-argv process/cwd reads for ONLY those fresh PID values.
// No host/PID/path/shell/argv arrives from ChatGPT.
import {createHash} from 'node:crypto';
import {validSshTarget} from './alice-preflight.mjs';
import {sanitizeMintHelperReport} from './mint-diagnostics.mjs';

const TARGET='tedz@192.168.0.104';
const HELPER='sudo -n /usr/bin/python3 -I -S /usr/local/libexec/ioant/mint-bds-diagnostics.py';
const SSH_FLAGS=['-T','-o','BatchMode=yes','-o','ConnectTimeout=10','-o','StrictHostKeyChecking=yes'];
const AUDIT='IOANT_MINT_BDS_PROCESS_LINEAGE';
const SAFE_PPID=pid=>Number.isSafeInteger(pid)&&pid>1&&pid<=2147483647;
const processLabel=name=>new Set(['bash','sh','dash','zsh','systemd','node','nodejs','python','python3','sudo','screen','tmux','bedrock_server','mcsm','mcsmanager','systemd-run']).has(name)?name:'other_process';
const digest=s=>createHash('sha256').update(s).digest('hex').slice(0,12);

export function classifyMintCwd(cwd){
 if(typeof cwd!=='string'||cwd.length>512||!cwd.startsWith('/')||/[\u0000-\u001f\u007f]/.test(cwd))
   throw Error('Process cwd unavailable or invalid');
 const root='/home/tedz/';
 const lab=root+'minecraft-bedrock-alice-lab';
 const prod=root+'minecraft-bedrock';
 if(cwd===lab)return 'isolated_lab_directory';
 if(cwd.startsWith(lab+'/'))return 'isolated_lab_subdirectory';
 if(cwd===prod)return 'production_directory';
 if(cwd.startsWith(prod+'/'))return 'production_subdirectory';
 if(cwd.startsWith(prod))return 'other_bedrock_named_directory';
 if(cwd===root.slice(0,-1)||cwd.startsWith(root))return 'other_tedz_home_directory';
 if(cwd.startsWith('/tmp/')||cwd.startsWith('/var/tmp/'))return 'temporary_directory';
 if(cwd.startsWith('/srv/'))return 'srv_directory';
 return 'other_location';
}

export function parseLineagePs(raw,pid,parentPid){
 if(typeof raw!=='string'||raw.length>800)throw Error('Unexpected ps evidence size');
 const lines=raw.trim().split(/\r?\n/).filter(Boolean);
 if(lines.length!==2)throw Error('Process or parent is not uniquely visible');
 const parsed=[];
 for(const line of lines){
  const m=line.trim().match(/^(\d{1,10})\s+(\d{1,10})\s+([A-Za-z0-9_.-]{1,40})\s+(.{8,80})$/);
  if(!m)throw Error('Invalid ps evidence');
  parsed.push({pid:Number(m[1]),ppid:Number(m[2]),comm:m[3],start:digest(m[4])});
 }
 const child=parsed.find(x=>x.pid===pid);
 const parent=parsed.find(x=>x.pid===parentPid);
 if(!child||!parent||child.ppid!==parentPid||child.comm!=='bedrock_server'||!SAFE_PPID(parentPid))
   throw Error('Parentage could not be independently confirmed');
 return {child:{pid:child.pid,start:child.start},parent:{pid:parent.pid,ppid:parent.ppid,start:parent.start,process:processLabel(parent.comm)}};
}

export async function mintBdsProcessLineage({execute,sshTarget,now=()=>Date.now()}){
 if(!validSshTarget(sshTarget)||sshTarget!==TARGET)
   return {status:'approval_required',reason:'Only the approved fixed Mint host is allowed.'};
 const call=async(command)=>{
  const r=await execute({bin:'ssh',args:[...SSH_FLAGS,TARGET,command],cwd:process.cwd(),timeout:20000});
  return r.status==='passed'?r.output:null;
 };
 const fail=(reason)=>({status:'inconclusive',output:JSON.stringify({
  audit:AUDIT,schemaVersion:1,readOnly:true,state:'inconclusive',port:17880,reason})});
 try{
  const startRaw=await call(HELPER);
  if(startRaw===null)return {status:'approval_required',reason:'Existing narrow Mint sudo helper permission unavailable.'};
  const original=sanitizeMintHelperReport(startRaw,now());
  if(original.state!=='observed')return fail('fresh_owner_unavailable');
  const {pid,parentPid}=original;
  if(!SAFE_PPID(pid)||!SAFE_PPID(parentPid)||pid===parentPid)return fail('invalid_parent_identity');
  const psCmd='/usr/bin/ps -p '+pid+','+parentPid+' -o pid=,ppid=,comm=,lstart=';
  const before=await call(psCmd);
  if(before===null)return fail('unprivileged_ps_unavailable');
  const ps1=parseLineagePs(before,pid,parentPid);
  // The real Mint host can deny unprivileged /proc/PID/cwd reads.
  // This is a known, explicit partial-evidence case, not a reason to
  // abandon the otherwise readable ps parent-chain or escalate sudo.
  const childCwdRaw=await call('/usr/bin/readlink /proc/'+pid+'/cwd');
  const cwd=childCwdRaw===null?null:childCwdRaw.trim();
  const childCwdCategory=cwd===null?'unavailable':classifyMintCwd(cwd);
  const parentCwdRaw=await call('/usr/bin/readlink /proc/'+parentPid+'/cwd');
  let parentCwdCategory='unavailable',parentSameCwd=null;
  if(parentCwdRaw!==null){
   const parentCwd=parentCwdRaw.trim();
   parentCwdCategory=classifyMintCwd(parentCwd);
   if(cwd!==null)parentSameCwd=parentCwd===cwd;
  }
  const afterPs=await call(psCmd);
  if(afterPs===null)return fail('unprivileged_ps_unavailable');
  const ps2=parseLineagePs(afterPs,pid,parentPid);
  const finalRaw=await call(HELPER);
  if(finalRaw===null)return fail('final_root_witness_unavailable');
  const last=sanitizeMintHelperReport(finalRaw,now());
  if(last.state!=='observed'||last.pid!==pid||last.parentPid!==parentPid||
     last.birthTag!==original.birthTag||last.classification!==original.classification||
     JSON.stringify(ps1)!==JSON.stringify(ps2))
    return fail('process_or_parent_changed_during_audit');
  const verifiedCwd=cwd!==null;
  return {
   status:verifiedCwd?'passed':'inconclusive',exitCode:0,
   ...(verifiedCwd?{}:{reason:'Child cwd inaccessible without sudo; independently verified parent process only.'}),
   output:JSON.stringify({
    audit:AUDIT,schemaVersion:1,readOnly:true,
    state:verifiedCwd?'observed':'partial',port:17880,
    ...(verifiedCwd?{}:{reason:'unprivileged_child_cwd_unavailable'}),
    observedAtUnix:last.observedAtUnix,pid,parentPid,
    process:'bedrock_server',birthTag:last.birthTag,
    rootWitnessClassification:last.classification,
    childCwdCategory,childCwdHash:verifiedCwd?digest(cwd):null,
    parentProcess:ps2.parent.process,parentPidOfParent:ps2.parent.ppid,
    parentStartTag:ps2.parent.start,parentCwdCategory,parentSameCwd,
    parentageDoubleChecked:true,
    note:'unprivileged_lineage_only_no_permission_to_stop_or_reprobe'})
  };
 }catch{
  return fail('lineage_evidence_unverifiable');
 }
}
