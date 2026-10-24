// Explicitly opted-in, read-only, fixed-port Mint BDS process identity.
// ChatGPT supplies an action name ONLY, never a PID, remote path or command.
import { createHash } from 'node:crypto';
import { validSshTarget } from './alice-preflight.mjs';

const SS = "sudo -n /usr/bin/ss -H -u -a -n -p '( sport = :17879 or sport = :17880 or sport = :17881 )'";
const PORTS = new Set([17879,17880,17881]);
const OWNER = /\("([A-Za-z0-9_.-]{1,40})",pid=([1-9][0-9]{0,9}),fd=[0-9]{1,8}\)/g;

// Never forward raw ss lines: they can include unrelated socket details.
export function parseBdsSockets(raw) {
  if(typeof raw!=='string'||raw.length>6000)throw Error('Unexpected socket evidence');
  const sockets=[];
  for(const line of raw.split(/\r?\n/)){
    if(!line.trim())continue;
    const fields=line.trim().split(/\s+/);
    if(fields.length<5)throw Error('Malformed socket evidence');
    const m=fields[3].match(/:(17879|17880|17881)$/);
    if(!m)throw Error('Unrelated port in privileged socket response');
    const port=Number(m[1]);
    if(!PORTS.has(port))throw Error('Unexpected diagnostic port');
    const owners=[];
    for(const match of line.matchAll(OWNER)){
      const pid=Number(match[2]);
      if(pid>2147483647)throw Error('Socket PID out of range');
      if(!owners.some(o=>o.pid===pid&&o.process===match[1]))owners.push({pid,process:match[1]});
    }
    if(owners.length>2||sockets.length>=8)throw Error('Ambiguous socket ownership');
    sockets.push({port,owners});
  }
  return sockets;
}

function parsePs(raw,pid){
  if(typeof raw!=='string'||raw.length>500||raw.trim().split(/\r?\n/).length!==1)throw Error('Unverified process identity');
  const m=raw.trim().match(/^(\d{1,10})\s+(\d{1,10})\s+([A-Za-z0-9_.-]{1,40})\s+(.{8,80})$/);
  if(!m||Number(m[1])!==pid||Number(m[2])>2147483647)throw Error('Process PID changed');
  return {pid,parentPid:Number(m[2]),process:m[3],birthTag:createHash('sha256').update(`${pid}:${m[4]}`).digest('hex').slice(0,12)};
}
function cwdClass(path,user){
  if(path===`/home/${user}/minecraft-bedrock`)return 'production_directory';
  if(path===`/home/${user}/minecraft-bedrock-alice-lab`)return 'isolated_lab_directory';
  return 'other_or_unverified_directory';
}

// execute is the fixed shell:false runner; its SSH command is source-defined.
export async function mintBdsProcessIdentity({execute,sshTarget}){
  if(!validSshTarget(sshTarget))
    return {status:'approval_required',reason:'Configure a valid ALICE_SSH_TARGET locally; no remote command executed.'};
  const user=sshTarget.split('@')[0];
  const ssh=async(command,privileged=false)=>{
    const r=await execute({bin:'ssh',args:['-T','-o','BatchMode=yes','-o','ConnectTimeout=10','-o','StrictHostKeyChecking=yes',sshTarget,command],cwd:process.cwd(),timeout:20000});
    if(r.status!=='passed'){
      const error=new Error(privileged?'Read-only Mint sudo permission unavailable; operator approval or a separately reviewed least-privilege rule is required.':'Mint process identity could not be verified.');
      error.code=privileged?'operator_auth':'remote_unavailable';
      throw error;
    }
    return r.output;
  };
  try{
    const first=parseBdsSockets(await ssh(SS,true));
    const lab=first.filter(s=>s.port===17880);
    if(lab.length!==1||lab[0].owners.length!==1)
      return {status:'inconclusive',output:JSON.stringify({audit:'IOANT_MINT_BDS_PROCESS_IDENTITY',readOnly:true,port:17880,reason:'no_unique_visible_owner',labSocketCount:lab.length})};
    const owner=lab[0].owners[0];
    if(owner.process!=='bedrock_server')
      return {status:'inconclusive',output:JSON.stringify({audit:'IOANT_MINT_BDS_PROCESS_IDENTITY',readOnly:true,port:17880,pid:owner.pid,reason:'unexpected_process_name'})};
    const pid=owner.pid;
    const psCmd=`ps -p ${pid} -o pid=,ppid=,comm=,lstart=`;
    const proc=parsePs(await ssh(psCmd),pid);
    const cwd=(await ssh(`sudo -n /usr/bin/readlink -f /proc/${pid}/cwd`,true)).trim();
    const exe=(await ssh(`sudo -n /usr/bin/readlink -f /proc/${pid}/exe`,true)).trim();
    const proc2=parsePs(await ssh(psCmd),pid);
    const second=parseBdsSockets(await ssh(SS,true));
    const still=second.filter(s=>s.port===17880);
    if(still.length!==1||still[0].owners.length!==1||still[0].owners[0].pid!==pid||
      still[0].owners[0].process!==owner.process||JSON.stringify(proc)!==JSON.stringify(proc2))
      return {status:'inconclusive',output:JSON.stringify({audit:'IOANT_MINT_BDS_PROCESS_IDENTITY',readOnly:true,port:17880,reason:'process_or_socket_changed_during_audit'})};
    if(!exe.endsWith('/bedrock_server')||proc.process!=='bedrock_server')
      return {status:'inconclusive',output:JSON.stringify({audit:'IOANT_MINT_BDS_PROCESS_IDENTITY',readOnly:true,port:17880,reason:'unexpected_executable_or_process'})};
    const productionPids=[...new Set(second.filter(s=>s.port===17879).flatMap(s=>s.owners.map(o=>o.pid)))];
    const directory=cwdClass(cwd,user);
    const sharesProductionPort=productionPids.includes(pid);
    const classification=sharesProductionPort?'production_port_owner':directory;
    const report={audit:'IOANT_MINT_BDS_PROCESS_IDENTITY',schemaVersion:1,readOnly:true,
      port:17880,pid,parentPid:proc.parentPid,process:proc.process,birthTag:proc.birthTag,
      classification,sharesProductionPort,executableMatches:exe.endsWith('/bedrock_server'),
      productionPortOwnerVisible:productionPids.length>0,
      note:'point_in_time_identity_only_no_permission_to_stop_or_reprobe'};
    return {status:'passed',exitCode:0,output:JSON.stringify(report)};
  }catch(e){
    return {status:e.code==='operator_auth'?'approval_required':'inconclusive',reason:e.message,
      output:JSON.stringify({audit:'IOANT_MINT_BDS_PROCESS_IDENTITY',readOnly:true,port:17880,reason:e.code==='operator_auth'?'privileged_read_unavailable':'identity_unverified'})};
  }
}
