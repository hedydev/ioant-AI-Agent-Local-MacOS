#!/usr/bin/env node
// Read-only OpenClaw CLI vs running Gateway version parity.
// Never echo CLI status JSON, installation paths, target URLs, tokens or stderr.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';

const AUDIT='IOANT_OPENCLAW_VERSION_PARITY';
const CLI=join(homedir(),'.openclaw','bin','openclaw');
const run=promisify(execFile);
const MAX=256*1024;
export function versionFrom(value){
 const m=typeof value==='string'&&value.length<=256?
   value.trim().match(/(?:^|\b)(20\d{2})\.(\d{1,2})\.(\d{1,3})(?:-([a-z][a-z0-9.-]{0,32}))?(?:\s|$)/i):null;
 return m?[m[1],m[2],m[3]].join('.')+(m[4]?'-'+m[4]:''):null;
}
export function classifyStatus(raw,cli){
 let doc;try{doc=JSON.parse(raw)}catch{return {status:'invalid_status_json'};}
 if(!doc||typeof doc!=='object'||Array.isArray(doc))return {status:'invalid_status_json'};
 const fromGateway=versionFrom(doc?.gateway?.version);
 const fromRpc=versionFrom(doc?.rpc?.status?.runtimeVersion);
 const versions=[fromGateway,fromRpc].filter(Boolean);
 const gateway=versions.length&&new Set(versions).size===1?versions[0]:null;
 const drift=doc?.gatewayService?.installationDrift;
 return {status:'observed',
   cliVersion:cli??'unknown',
   gatewayVersion:gateway??'unknown',
   versionMatch:cli&&gateway?(cli===gateway?'same':'different'):'unresolved',
   gatewayVersionEvidence:versions.length===0?'absent':gateway?'consistent':'conflicting',
   installationDrift:typeof drift==='boolean'?(drift?'reported':'not_reported'):'unresolved'};
}
export async function inspectVersionParity({execImpl=run,cli=CLI}={}){
 const report={audit:AUDIT,schemaVersion:1,readOnly:true};
 if(process.env.OPENCLAW_CONFIG_PATH||process.env.OPENCLAW_STATE_DIR||process.env.OPENCLAW_PROFILE)
  return {...report,status:'custom_profile_review'};
 const env={...process.env};
 for(const k of ['OPENCLAW_GATEWAY_TOKEN','OPENCLAW_GATEWAY_PASSWORD','OPENCLAW_GATEWAY_URL',
   'NODE_TEST_CONTEXT','IOANT_LOOP_LOG_FILE'])delete env[k];
 const invoke=async(args)=>execImpl(cli,args,{timeout:30000,maxBuffer:MAX,env});
 let version;
 try{version=versionFrom((await invoke(['--version'])).stdout);}
 catch{return {...report,status:'cli_unavailable'};}
 if(!version)return {...report,status:'unrecognized_cli_version'};
 let status;
 try{status=(await invoke(['gateway','status','--json'])).stdout;}
 catch{return {...report,status:'gateway_status_unavailable',cliVersion:version};}
 return {...report,...classifyStatus(status,version)};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 inspectVersionParity().then(r=>console.log(JSON.stringify(r))).catch(()=>
  console.log(JSON.stringify({audit:AUDIT,schemaVersion:1,readOnly:true,status:'diagnostic_unavailable'})));
}
