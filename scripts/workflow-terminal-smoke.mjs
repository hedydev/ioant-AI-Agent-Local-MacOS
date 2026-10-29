#!/usr/bin/env node
// Explicit local acceptance of the existing terminal executor; no ChatGPT send.
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile,lstat,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runMacTerminal} from '../stage2/mac-terminal-access.mjs';

const SCRIPT=fileURLToPath(import.meta.url);
const CACHE='/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos';
const DIR=join(CACHE,'verification','terminal-executor');
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const AUDIT='IOANT_WORKFLOW_TERMINAL_SMOKE';
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
const payload=id=>({schemaVersion:1,operationId:id,fixture:'ioant-terminal-roundtrip-v1',
 sum:2+3,modelInferenceInvoked:false});

async function privateDir(path){
 const s=await lstat(path);
 if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)!==0||
  s.uid!==process.getuid()||await realpath(path)!==path)throw Error('private_directory_required');
}
// Shared path admission refuses existing links instead of following mkdir's path.
async function admitPath(id){
 if(!ID.test(id))throw Error('invalid_operation_id');
 await privateDir(CACHE);
 for(const path of [join(CACHE,'verification'),DIR]){
  try{await mkdir(path,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
  await privateDir(path);
 }
 return join(DIR,id+'.json');
}

export async function runTerminalSmoke({execute=runMacTerminal,
 prepare=admitPath,read=readFile,stat=lstat,id=randomUUID()}={}){
 const base={audit:AUDIT,schemaVersion:1,operationId:id,
  modelInferenceInvoked:false,browserAccessed:false,chatMessageSent:false,
  desktopInput:false,chatRoundtripVerified:false};
 if(!ID.test(id))return {...base,state:'blocked',reason:'invalid_operation_id'};
 let path;
 try{path=await prepare(id);}catch{return {...base,state:'blocked',reason:'private_fixture_directory_unavailable'};}
 const command=[quote(process.execPath),quote(SCRIPT),'--write-fixture',quote(id)].join(' ');
 let result;
 try{result=await execute({action:'mac-terminal',cwd:'workspace',command});}
 catch{return {...base,state:'inconclusive',reason:'terminal_execution_unavailable'};}
 if(result?.status!=='passed'||result.exitCode!==0)
  return {...base,state:result?.status==='approval_required'?'blocked':'inconclusive',
   reason:result?.status==='approval_required'?'terminal_grant_required':'terminal_execution_failed'};
 try{
  const s=await stat(path);
  if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077)!==0||s.uid!==process.getuid()||s.size>1024)
   throw Error('fixture_unverified');
  const data=JSON.parse(await read(path,'utf8'));
  if(JSON.stringify(data)!==JSON.stringify(payload(id)))throw Error('fixture_mismatch');
  return {...base,state:'passed',reason:'terminal_file_write_and_independent_readback_verified',
   terminalExecutionVerified:true,fileReadbackVerified:true};
 }catch{return {...base,state:'inconclusive',reason:'independent_readback_failed'};}
}

if(process.argv[1]&&resolve(process.argv[1])===SCRIPT){
 let report;
 if(process.argv.length===4&&process.argv[2]==='--write-fixture'&&ID.test(process.argv[3])){
  try{
   const id=process.argv[3],path=await admitPath(id);
   await writeFile(path,JSON.stringify(payload(id))+'\n',{mode:0o600,flag:'wx'});
   report={audit:AUDIT,state:'fixture_written'};
  }catch{report={audit:AUDIT,state:'blocked',reason:'fixture_write_failed'};}
 }else if(process.argv.length===3&&process.argv[2]==='--run'){
  report=await runTerminalSmoke();
 }else report={audit:AUDIT,state:'blocked',reason:'explicit_run_required'};
 console.log(JSON.stringify(report));
 if(!['passed','fixture_written'].includes(report.state))process.exitCode=1;
}
