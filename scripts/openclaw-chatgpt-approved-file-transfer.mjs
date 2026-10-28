#!/usr/bin/env node
// Exact-chat, explicitly approved, one-shot Mac file handoff.
// No browser navigation, native CUA, global focus, clipboard or blind resend.
// Uploading a file is disclosure: run --send ONLY for an approved exact path.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join,resolve,relative,basename,extname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {lstat,realpath,open,stat,mkdir,mkdtemp,writeFile,rename,rm} from 'node:fs/promises';
import {constants} from 'node:fs';
import {exactTab,uniqueRef} from './openclaw-chatgpt-fixture-upload.mjs';
import {buildScopedReceiptProbe,classifyScopedReceipt}
 from '../stage2/chatgpt-upload-scoped-receipt.mjs';

const exec=promisify(execFile),HOME=homedir();
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(HOME,'Library','Application Support','ioant-openclaw-ops','runtime');
const CLI=join(HOME,'.openclaw','bin','openclaw');
const CHAT='https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/6ae18e93-e2a0-83ec-aac9-88105079f208';
const UPLOADS='/tmp/openclaw/uploads';
const REPORTS=join(HOME,'Library','Application Support','ioant-openclaw-ops','reports');
const RECORDS=join(REPORTS,'file-transfer');
const MAX_BYTES=20*1024*1024;
const AUDIT='IOANT_EXACT_CHAT_APPROVED_FILE_TRANSFER';
const PREFIX='IOANT_TRANSFER_COMPOSER:';
const EXT=new Set(['.txt','.md','.log','.json','.jsonl','.csv','.tsv','.pdf','.zip',
 '.png','.jpg','.jpeg','.webp','.gif','.docx','.xlsx','.pptx']);
const BASE={audit:AUDIT,schemaVersion:1,exactConversationOnly:true,
 browserNavigation:false,invokedComputerAct:false,
 screenshotTaken:false,globalPointerOrKeyboardInput:false,
 noAutomaticResend:true};
const error=reason=>Object.assign(new Error(reason),{safeReason:reason});
const owner=st=>typeof process.getuid!=='function'||st.uid===process.getuid();
const safeWithin=(root,path)=>{const r=relative(root,path);return r&&!r.startsWith('..')&&!isAbsolute(r)};
export function checkPathIdentity(path){
 if(typeof path!=='string'||path.length<2||path.length>1024||
  !isAbsolute(path)||resolve(path)!==path||
  /[\u0000-\u001f]/.test(path)||path.includes('//'))throw error('invalid_absolute_path');
 const name=basename(path);
 if(!name||name.startsWith('.')||name.length>180||name.includes('\\'))
  throw error('unsafe_filename');
 const ext=extname(name).toLowerCase();
 if(!EXT.has(ext))throw error('unsupported_file_type');
 const roots=[join(HOME,'Desktop'),join(HOME,'Downloads'),
  join(HOME,'Documents','workspace')];
 if(!roots.some(root=>safeWithin(root,path)))throw error('path_outside_approved_roots');
 return {name,ext};
}
export function transferIdentity(path,digest){
 if(!/^[a-f0-9]{64}$/.test(digest))throw error('invalid_file_digest');
 const hash=createHash('sha256').update(CHAT+'\n'+path+'\n'+digest).digest('hex');
 return {key:hash,tag:'IOANT-FILE-TRANSFER-'+hash.slice(0,24).toUpperCase()};
}
async function readApprovedFile(path){
 const identity=checkPathIdentity(path);
 const canonical=await realpath(path);
 if(canonical!==path)throw error('symlink_or_redirected_path');
 const before=await lstat(path);
 if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||!owner(before)||
  before.size<1||before.size>MAX_BYTES)throw error('unsafe_file_identity_or_size');
 const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const opened=await handle.stat();
  if(!opened.isFile()||opened.dev!==before.dev||opened.ino!==before.ino||
   opened.size!==before.size||opened.mtimeMs!==before.mtimeMs)
   throw error('file_changed_before_read');
  const bytes=await handle.readFile();
  const after=await handle.stat();
  const current=await lstat(path);
  if(bytes.length!==before.size||after.dev!==before.dev||after.ino!==before.ino||
   after.mtimeMs!==before.mtimeMs||after.size!==before.size||
   current.dev!==before.dev||current.ino!==before.ino||
   current.mtimeMs!==before.mtimeMs||current.size!==before.size)
   throw error('file_changed_during_read');
  const digest=createHash('sha256').update(bytes).digest('hex');
  return {...identity,path,bytes,size:bytes.length,digest,...transferIdentity(path,digest)};
 }finally{await handle.close()}
}
export function parseProof(raw,prefix=PREFIX){
 let found=null;
 const visit=(v,d=0)=>{
  if(d>12||v==null||found!==null)return;
  if(typeof v==='string'){
   if(v.startsWith(prefix)){try{found=JSON.parse(v.slice(prefix.length))}catch{};return}
   if(v.length>500000)return;
   try{visit(JSON.parse(v),d+1)}catch{}
  }else if(Array.isArray(v))for(const x of v.slice(0,30))visit(x,d+1);
  else if(typeof v==='object')
   for(const k of ['result','content','text','value','output','data'])
    if(k in v)visit(v[k],d+1);
 };
 visit(raw);return found;
}
export function composerProbe(filename){
 const clause='const U='+JSON.stringify(CHAT)+',N='+JSON.stringify(filename)+
  ',P='+JSON.stringify(PREFIX)+';';
 return '() => {'+clause+
  'const editor=["#prompt-textarea","[data-testid=composer-input][contenteditable=true]",'+
  '"[data-testid=prompt-textarea][contenteditable=true]",'+
  '"form [contenteditable=true][role=textbox]"].map(s=>document.querySelector(s)).find(Boolean);'+
  'const form=editor?.closest("form"),text=String(editor?.innerText??editor?.textContent??"");'+
  'const attrs=Array.from(form?.querySelectorAll("[title],[aria-label]")??[]);'+
  'const attached=!!form&&(String(form.innerText??form.textContent??"").includes(N)||'+
   'attrs.some(e=>String(e.getAttribute("title")??"").includes(N)||'+
    'String(e.getAttribute("aria-label")??"").includes(N)));'+
  'const generating=!!document.querySelector("[data-testid=stop-button],button[aria-label=\\"Stop generating\\"]");'+
  'return P+JSON.stringify({exact:location.href===U,editor:!!editor,empty:!text.trim(),attached,generating});'+
 '}';
}
async function cli(args){
 const {stdout}=await exec(CLI,['browser','--browser-profile','chrome',...args],
  {cwd:RUNTIME,shell:false,timeout:35000,maxBuffer:1024*1024});
 return stdout;
}
async function getTab(){return exactTab(JSON.parse(await cli(['--json','tabs'])))}
async function getComposer(id,name){
 const v=parseProof(await cli(['--json','evaluate','--target-id',id,'--fn',composerProbe(name)]));
 if(!v||v.exact!==true||typeof v.editor!=='boolean'||
  typeof v.empty!=='boolean'||typeof v.attached!=='boolean'||
  typeof v.generating!=='boolean')throw error('composer_proof_unavailable');
 return v;
}
async function checkReceipt(id,file){
 const raw=await cli(['--json','evaluate','--target-id',id,'--fn',
  buildScopedReceiptProbe({chatUrl:CHAT,marker:file.tag,filename:file.name})]);
 return classifyScopedReceipt(raw).state==='confirmed';
}
async function record(path,phase,identity,approvalReference){
 const content={audit:AUDIT,schemaVersion:1,phase,tag:identity.tag,
  filename:identity.name,size:identity.size,digest:identity.digest,
  approvalReference};
 const tmp=path+'.tmp';
 await writeFile(tmp,JSON.stringify(content)+'\n',{mode:0o600,flag:'wx'});
 await rename(tmp,path);
}
async function makeLock(file,approvalReference){
 await mkdir(RECORDS,{recursive:true,mode:0o700});
 const rstat=await lstat(RECORDS);
 if(!rstat.isDirectory()||rstat.isSymbolicLink()||!owner(rstat)||
  (rstat.mode&0o077)!==0||await realpath(RECORDS)!==RECORDS)
  throw error('unsafe_transfer_record_directory');
 const path=join(RECORDS,file.key+'.json');
 try{await lstat(path);throw error('duplicate_or_pending_file_transfer')}
 catch(e){if(e.code!=='ENOENT')throw e}
 await writeFile(path,JSON.stringify({audit:AUDIT,phase:'prepared',
  filename:file.name,size:file.size,digest:file.digest,
  tag:file.tag,approvalReference})+'\n',{mode:0o600,flag:'wx'});
 return path;
}
async function stage(file){
 await mkdir(UPLOADS,{recursive:true,mode:0o700});
 const st=await lstat(UPLOADS);
 if(!st.isDirectory()||st.isSymbolicLink()||!owner(st)||
  (st.mode&0o022)!==0)throw error('unsafe_upload_staging_root');
 const dir=await mkdtemp(join(UPLOADS,'ioant-approved-'));
 const staged=join(dir,file.name);
 await writeFile(staged,file.bytes,{mode:0o600,flag:'wx'});
 return {dir,path:staged};
}
export async function transfer({mode,path,approvalReference,
 callReady=async()=>process.platform==='darwin'&&ROOT===RUNTIME&&
  await realpath(RUNTIME)===RUNTIME}={}){
 let phase='preflight',folder=null,menu=false,uploaded=false,pressIssued=false;
 let file=null,recordPath=null;
 try{
  if(!['inspect','send'].includes(mode))throw error('unsupported_mode');
  if(!await callReady())throw error('private_runtime_required');
  file=await readApprovedFile(path);
  if(mode==='send'&&
    (typeof approvalReference!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(approvalReference)))
   throw error('exact_file_approval_reference_required');
  const id=await getTab();
  const before=await getComposer(id,file.name);
  if(!before.editor||!before.empty||before.attached||before.generating)
   throw error('composer_not_ready');
  // All file content stays local during inspect; no upload or menu action.
  if(mode==='inspect')return {...BASE,state:'observed',reason:'file_and_chat_preflight_passed',
   basename:file.name,bytes:file.size,sha256:file.digest,
   transferTag:file.tag,uploadTriggered:false,messageSent:false};
  if(await checkReceipt(id,file))throw error('delivery_already_visible');
  recordPath=await makeLock(file,approvalReference);
  folder=await stage(file);
  phase='menu';
  const first=await cli(['snapshot','--target-id',id,'--interactive']);
  const button=uniqueRef(first,/add files and more/i);
  await cli(['click','--target-id',id,button]);menu=true;
  const second=await cli(['snapshot','--target-id',id,'--interactive']);
  const uploadRef=uniqueRef(second,/upload from computer|upload files|browse files|上传文件|从电脑上传/i);
  phase='upload';
  await cli(['upload',folder.path,'--target-id',id,'--ref',uploadRef]);
  menu=false;uploaded=true;
  await record(recordPath,'upload_returned',file,approvalReference);
  const attached=await getComposer(id,file.name);
  if(!attached.attached||!attached.empty||attached.generating)
   throw error('attachment_not_confirmed_in_composer');
  const draft=await cli(['snapshot','--target-id',id,'--interactive']);
  const editor=uniqueRef(draft,/textbox.*(?:message|prompt|chatgpt|ask anything|消息|提问)/i);
  phase='draft';
  await cli(['type','--target-id',id,editor,file.tag]);
  const typed=await getComposer(id,file.name);
  if(!typed.attached||typed.empty||typed.generating)
   throw error('draft_or_attachment_unconfirmed');
  if((await getTab())!==id)throw error('exact_chat_changed');
  // Durable and irreversible press-intent; never resend on uncertainty.
  await record(recordPath,'press_intent',file,approvalReference);
  phase='send';pressIssued=true;
  await cli(['press','--target-id',id,'Enter']);
  phase='receipt';
  for(let i=0;i<8;i++){
   if(await checkReceipt(id,file)){
    await record(recordPath,'confirmed',file,approvalReference);
    return {...BASE,state:'confirmed',reason:'same_user_turn_file_receipt_verified',
     basename:file.name,sha256:file.digest,bytes:file.size,transferTag:file.tag,
     uploadTriggered:true,messageSent:true};
   }
   await new Promise(r=>setTimeout(r,1200));
  }
  return {...BASE,state:'inconclusive',reason:'post_send_receipt_unconfirmed',
   basename:file.name,transferTag:file.tag,uploadTriggered:true,
   messageSent:'unknown'};
 }catch(e){
  return {...BASE,state:pressIssued?'inconclusive':'blocked',
   reason:e.safeReason??'file_transfer_unavailable',
   phase,uploadTriggered:uploaded,messageSent:pressIssued?'unknown':false,
   ...(file?{basename:file.name,transferTag:file.tag}:{}),
   ...(recordPath?{recordPersisted:true}:{}),
   ...(uploaded&&!pressIssued?{draftAttachmentMayRemain:true}:{})};
 }finally{
  if(menu){try{await cli(['press','--target-id',await getTab(),'Escape'])}catch{}}
  if(folder)await rm(folder.dir,{recursive:true,force:true}).catch(()=>{});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const a=process.argv.slice(2);
 const mode=a[0]==='--inspect'?'inspect':a[0]==='--send'?'send':'invalid';
 const valid=(mode==='inspect'&&a.length===2)||
  (mode==='send'&&a.length===4&&a[2]==='--approval-reference');
 const out=valid?await transfer({mode,path:a[1],approvalReference:a[3]}):
  {...BASE,state:'blocked',reason:'usage_inspect_path_or_send_path_approval_reference'};
 console.log(JSON.stringify(out));
 if(!['observed','confirmed'].includes(out.state))process.exitCode=1;
}
