// Explicitly opted-in fixed, read-only Mint BDS helper; no caller PID/args.
import {validSshTarget} from './alice-preflight.mjs';

const CMD='sudo -n /usr/bin/python3 -I -S /usr/local/libexec/ioant/mint-bds-diagnostics.py';
const AUDIT='IOANT_MINT_BDS_PROCESS_IDENTITY';
const CLASSES=new Set(['production_port_owner','production_directory','isolated_lab_directory','other_or_unverified_directory']);
const REASONS=new Set(['no_unique_visible_owner','unexpected_process_name',
 'process_or_socket_changed_during_audit','unexpected_executable_or_process','socket_inspection_unavailable']);

export function sanitizeMintHelperReport(raw,now=Date.now()){
 if(typeof raw!=='string'||raw.length>2500)throw Error('Invalid helper output size');
 let r;
 try{r=JSON.parse(raw.trim())}catch{throw Error('No valid helper JSON')}
 if(!r||Array.isArray(r)||typeof r!=='object'||r.audit!==AUDIT||r.schemaVersion!==1||
    r.readOnly!==true||r.port!==17880||!Number.isInteger(r.observedAtUnix)||
    Math.abs(r.observedAtUnix*1000-now)>300000)throw Error('Invalid or stale evidence');
 const base={audit:AUDIT,schemaVersion:1,readOnly:true,port:17880,observedAtUnix:r.observedAtUnix};
 if(r.state==='inconclusive'&&REASONS.has(r.reason))
   return {...base,state:'inconclusive',reason:r.reason};
 if(r.state!=='observed'||!Number.isInteger(r.pid)||r.pid<1||r.pid>2147483647||
    !Number.isInteger(r.parentPid)||r.parentPid<0||r.parentPid>2147483647||
    r.process!=='bedrock_server'||typeof r.birthTag!=='string'||
    !/^[a-f0-9]{12}$/.test(r.birthTag)||!CLASSES.has(r.classification)||
    typeof r.sharesProductionPort!=='boolean'||typeof r.productionPortOwnerVisible!=='boolean'||
    r.executableMatches!==true||r.note!=='point_in_time_identity_only_no_permission_to_stop_or_reprobe'||
    (r.sharesProductionPort&&r.classification!=='production_port_owner'))
   throw Error('Invalid process identity evidence');
 return {...base,state:'observed',pid:r.pid,parentPid:r.parentPid,process:r.process,
   birthTag:r.birthTag,classification:r.classification,sharesProductionPort:r.sharesProductionPort,
   productionPortOwnerVisible:r.productionPortOwnerVisible,executableMatches:true,note:r.note};
}

export async function mintBdsProcessIdentity({execute,sshTarget,now=()=>Date.now()}){
 if(!validSshTarget(sshTarget)||sshTarget!=='tedz@192.168.0.104')
   return {status:'approval_required',reason:'Only preapproved Mint SSH target supported.'};
 try{
  const r=await execute({bin:'ssh',args:['-T','-o','BatchMode=yes','-o','ConnectTimeout=10',
    '-o','StrictHostKeyChecking=yes',sshTarget,CMD],cwd:process.cwd(),timeout:20000});
  if(r.status!=='passed')return {status:'approval_required',
    reason:'Fixed root-owned Mint helper unavailable or narrow sudo rule not installed.',
    output:JSON.stringify({audit:AUDIT,readOnly:true,port:17880,reason:'privileged_helper_unavailable'})};
  const safe=sanitizeMintHelperReport(r.output,now());
  return {status:safe.state==='observed'?'passed':'inconclusive',
    exitCode:0,output:JSON.stringify(safe)};
 }catch{
  return {status:'inconclusive',reason:'Mint helper evidence invalid or stale.',
   output:JSON.stringify({audit:AUDIT,readOnly:true,port:17880,reason:'helper_evidence_invalid'})};
 }
}
