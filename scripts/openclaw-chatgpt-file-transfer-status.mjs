#!/usr/bin/env node
// Read-only status of one previously authorized Mac -> exact ChatGPT file transfer.
// No ChatGPT browser access, no upload, no send, no journal modification.
// A missing record means only that no matching private journal is present.
import {open,lstat,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {homedir} from 'node:os';
import {join,resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {checkPathIdentity,transferIdentity}
 from './openclaw-chatgpt-approved-file-transfer.mjs';

const HOME=homedir();
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(HOME,'Library','Application Support','ioant-openclaw-ops','runtime');
const RECORDS=join(HOME,'Library','Application Support',
 'ioant-openclaw-ops','reports','file-transfer');
const AUDIT='IOANT_EXACT_CHAT_APPROVED_FILE_TRANSFER';
const STATUS='IOANT_EXACT_CHAT_FILE_TRANSFER_STATUS';
const BASE={audit:STATUS,schemaVersion:1,readOnly:true,browserAccess:false,
 uploadTriggered:false,messageSent:false,journalMutated:false,
 markerReturned:false,approvalReferenceReturned:false};
const MAX=20*1024*1024;
const reject=s=>Object.assign(new Error(s),{safeReason:s});
const sameOwner=s=>typeof process.getuid!=='function'||s.uid===process.getuid();
export function classifyTransferRecord(raw,expected){
 let record;
 try{record=typeof raw==='string'?JSON.parse(raw):raw}catch{}
 if(!record||typeof record!=='object'||Array.isArray(record)||
  record.audit!==AUDIT||record.schemaVersion!==1||
  record.filename!==expected.filename||record.size!==expected.size||
  record.digest!==expected.digest||
  !/^IOANT-FILE-TRANSFER-[A-F0-9]{32}$/.test(record.tag??'')||
  !['prepared','upload_returned','press_intent','confirmed'].includes(record.phase))
  return {...BASE,state:'blocked',reason:'journal_identity_or_phase_invalid'};
 if(record.phase==='confirmed')
  return {...BASE,state:'confirmed',reason:'private_journal_confirmed'};
 return {...BASE,state:'inconclusive',reason:'existing_journal_requires_review',
  journalPhase:record.phase,noAutomaticResend:true};
}
async function fileIdentity(path){
 const info=checkPathIdentity(path);
 if((await realpath(path))!==path)throw reject('symlink_or_redirected_path');
 const first=await lstat(path);
 if(!first.isFile()||first.isSymbolicLink()||first.nlink!==1||
  !sameOwner(first)||first.size<1||first.size>MAX)
  throw reject('unsafe_file_identity_or_size');
 const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const before=await handle.stat();
  if(!before.isFile()||before.ino!==first.ino||before.dev!==first.dev||
   before.size!==first.size||before.mtimeMs!==first.mtimeMs)
   throw reject('file_changed_before_read');
  const buf=await handle.readFile();
  const after=await handle.stat();
  const final=await lstat(path);
  if(buf.length!==first.size||after.size!==first.size||
   after.mtimeMs!==first.mtimeMs||after.ino!==first.ino||
   final.ino!==first.ino||final.dev!==first.dev||
   final.size!==first.size||final.mtimeMs!==first.mtimeMs)
   throw reject('file_changed_during_read');
  const digest=createHash('sha256').update(buf).digest('hex');
  return {filename:info.name,size:buf.length,digest,
   key:transferIdentity(path,digest).key};
 }finally{await handle.close()}
}
export async function transferStatus({path,allowedRuntime=async()=>process.platform==='darwin'&&
 ROOT===RUNTIME&&await realpath(RUNTIME)===RUNTIME}={}){
 try{
  if(!await allowedRuntime())throw reject('private_runtime_required');
  const file=await fileIdentity(path);
  let dir;
  try{dir=await lstat(RECORDS)}
  catch(e){
   if(e.code==='ENOENT')return {...BASE,state:'unknown',reason:'no_matching_private_record',
    basename:file.filename,bytes:file.size,sha256:file.digest};
   throw e;
  }
  if(!dir.isDirectory()||dir.isSymbolicLink()||!sameOwner(dir)||
   (dir.mode&0o077)!==0||(await realpath(RECORDS))!==RECORDS)
   throw reject('unsafe_journal_directory');
  const name=join(RECORDS,file.key+'.json');
  let journal;
  try{journal=await lstat(name)}
  catch(e){
   if(e.code==='ENOENT')return {...BASE,state:'unknown',reason:'no_matching_private_record',
    basename:file.filename,bytes:file.size,sha256:file.digest};
   throw e;
  }
  if(!journal.isFile()||journal.isSymbolicLink()||journal.nlink!==1||
   !sameOwner(journal)||(journal.mode&0o077)!==0||
   journal.size<2||journal.size>4096)
   throw reject('unsafe_journal_file');
  const fh=await open(name,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  let data;
  try{
   const st=await fh.stat();
   if(st.dev!==journal.dev||st.ino!==journal.ino||
    st.size!==journal.size||st.mtimeMs!==journal.mtimeMs)
    throw reject('journal_changed_before_read');
   data=await fh.readFile({encoding:'utf8'});
   const after=await fh.stat();
   if(after.size!==journal.size||after.mtimeMs!==journal.mtimeMs)
    throw reject('journal_changed_during_read');
  }finally{await fh.close()}
  return {...BASE,...classifyTransferRecord(data,file),
   basename:file.filename,bytes:file.size,sha256:file.digest};
 }catch(e){
  return {...BASE,state:'blocked',reason:e.safeReason??'readonly_status_unavailable'};
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 const out=args.length===1?await transferStatus({path:args[0]}):
  {...BASE,state:'blocked',reason:'usage_exact_absolute_file_path_required'};
 console.log(JSON.stringify(out));
 if(!['confirmed','unknown','inconclusive'].includes(out.state))process.exitCode=1;
}
