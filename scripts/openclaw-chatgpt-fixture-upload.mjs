#!/usr/bin/env node
// Only the exact authorized ChatGPT conversation and synthetic desktop test file.
// This is NOT an arbitrary-path uploader. No screenshot, native CUA, navigation,
// foreground fallback, other application control, or automatic second send.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {lstat,readFile,mkdir,mkdtemp,writeFile,rename,realpath,rm} from 'node:fs/promises';
const exec=promisify(execFile),HOME=homedir();
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(HOME,'Library','Application Support','ioant-openclaw-ops','runtime');
const BIN=join(HOME,'.openclaw','bin','openclaw');
const CHAT='https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/6ae18e93-e2a0-83ec-aac9-88105079f208';
const NAME='IOANT-ChatGPT-Upload-Fixture-20261028.txt';
const BODY='IOANT CHATGPT FILE UPLOAD TEST\nSynthetic content only.\nThis file contains no personal data.\n';
const SOURCE=join(HOME,'Desktop',NAME);
const TAG='IOANT-UPLOAD-FIXTURE-20261028-196';
const RECORD=join(HOME,'Library','Application Support','ioant-openclaw-ops','reports','chatgpt-fixture-upload-196.json');
const UPLOADS='/tmp/openclaw/uploads';
const AUDIT='IOANT_CHATGPT_SYNTHETIC_ATTACHMENT';
const BASE={audit:AUDIT,schemaVersion:1,exactConversationOnly:true,
 syntheticFixtureOnly:true,invokedComputerAct:false,changedBrowserNavigation:false,
 screenshotTaken:false,performedPointerOrKeyboardInput:false};
const reject=r=>Object.assign(new Error(r),{safeReason:r});
const REF=/^[a-zA-Z0-9_:-]{1,128}$/;
export function exactTab(raw){
 const rows=Array.isArray(raw)?raw:(raw?.tabs??raw?.result?.tabs);
 if(!Array.isArray(rows))throw reject('tab_list_unavailable');
 const hits=rows.filter(x=>{try{return new URL(x.url).href===CHAT}catch{return false}});
 if(hits.length!==1)throw reject('exact_chat_not_unique');
 const id=hits[0].suggestedTargetId??hits[0].tabId??hits[0].targetId;
 if(typeof id!=='string'||!REF.test(id))throw reject('invalid_target_ref');
 return id;
}
export function uniqueRef(snapshot,pattern){
 if(typeof snapshot!=='string')throw reject('snapshot_unavailable');
 const matches=snapshot.split(/\r?\n/).filter(x=>pattern.test(x));
 if(matches.length!==1)throw reject('ui_control_not_unique');
 const value=matches[0].match(/\[ref=([a-zA-Z0-9_:-]+)\]/)?.[1];
 if(!value||!REF.test(value))throw reject('ui_control_no_ref');
 return value;
}
export function unpack(raw){
 if(typeof raw==='string'){
  if(raw.startsWith('IOANT_FILE_UI_PROOF:'))return JSON.parse(raw.slice(20));
  if(raw.startsWith('{')||raw.startsWith('"')){try{return unpack(JSON.parse(raw))}catch{}}
  const i=raw.indexOf('IOANT_FILE_UI_PROOF:');
  if(i>=0){try{return JSON.parse(raw.slice(i+20))}catch{}}
 }else if(raw&&typeof raw==='object'){
  if(Array.isArray(raw)){for(const item of raw){const v=unpack(item);if(v)return v}}
  else for(const k of ['result','value','text','output','content','data']){
   if(k in raw){const v=unpack(raw[k]);if(v)return v}
  }
 }
 return null;
}
export function pageFunction(){
 // No user text or unrelated filenames returned; only fixed proof booleans.
 return '() => {'+
  'const U='+JSON.stringify(CHAT)+',N='+JSON.stringify(NAME)+',M='+JSON.stringify(TAG)+';'+
  'const ed=["#prompt-textarea","[data-testid=composer-input][contenteditable=true]",'+
  '"[data-testid=prompt-textarea][contenteditable=true]","form [contenteditable=true][role=textbox]"].map(x=>document.querySelector(x)).find(Boolean);'+
  'const form=ed?.closest("form"),draft=String(ed?.innerText??ed?.textContent??"");'+
  'const attached=!!form&&String(form.innerText??form.textContent??"").includes(N);'+
  'const nodes=Array.from(document.querySelectorAll("[data-message-author-role=user],[data-content-search-unit-key$=\\":user\\"],[data-user-message-bubble=true]")).slice(-40);'+
  'const receipt=nodes.some(e=>{const s=String(e.innerText??e.textContent??"");return s.includes(M)&&s.includes(N)});'+
  'const generating=!!document.querySelector("[data-testid=stop-button],button[aria-label=\\"Stop generating\\"]");'+
  'return "IOANT_FILE_UI_PROOF:"+JSON.stringify({exact:location.href===U,editor:!!ed,empty:!draft.trim(),attached,receipt,generating})'+
  '}';
}
async function cli(args){
 const {stdout}=await exec(BIN,['browser','--browser-profile','chrome',...args],{
  cwd:RUNTIME,shell:false,timeout:35000,maxBuffer:1024*1024});
 return stdout;
}
async function tab(){return exactTab(JSON.parse(await cli(['--json','tabs'])))}
async function proof(id){
 const doc=unpack(await cli(['--json','evaluate','--target-id',id,'--fn',pageFunction()]));
 if(!doc||doc.exact!==true)throw reject('exact_page_not_proven');
 return doc;
}
async function fixture(){
 const st=await lstat(SOURCE);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||
  (typeof process.getuid==='function'&&st.uid!==process.getuid())||
  st.size!==Buffer.byteLength(BODY))throw reject('fixture_identity_refused');
 const value=await readFile(SOURCE);
 if(!value.equals(Buffer.from(BODY)))throw reject('fixture_content_refused');
 return value;
}
async function state(phase){
 const tmp=RECORD+'.tmp';
 await writeFile(tmp,JSON.stringify({audit:AUDIT,phase,file:NAME})+'\n',
  {mode:0o600,flag:'wx'});
 await rename(tmp,RECORD);
}
async function stage(data){
 await mkdir(UPLOADS,{recursive:true,mode:0o700});
 const st=await lstat(UPLOADS);
 if(!st.isDirectory()||st.isSymbolicLink()||
  (typeof process.getuid==='function'&&st.uid!==process.getuid())||
  (st.mode&0o022)!==0)throw reject('uploads_directory_not_private');
 const dir=await mkdtemp(join(UPLOADS,'ioant-test-'));
 const file=join(dir,NAME);
 await writeFile(file,data,{mode:0o600,flag:'wx'});
 if(!(await realpath(file)).startsWith(await realpath(UPLOADS)+'/'))
  throw reject('stage_location_invalid');
 return {dir,file};
}
export async function run({mode='inspect',allowedRuntime=async()=>process.platform==='darwin'&&
 ROOT===RUNTIME&&await realpath(RUNTIME)===RUNTIME}={}){
 let staged=null,menu=false,uploaded=false,pressed=false,phase='preflight';
 try{
  if(!['inspect','send'].includes(mode))throw reject('unsupported_mode');
  if(!await allowedRuntime())throw reject('private_runtime_required');
  const data=await fixture();
  if(mode==='send'){
   try{await lstat(RECORD);throw reject('prior_send_state_exists')}
   catch(e){if(e.code!=='ENOENT')throw e}
  }
  const id=await tab(),current=await proof(id);
  if(!current.editor||!current.empty||current.generating||current.attached)
   throw reject('composer_not_empty_or_ready');
  const snap=await cli(['snapshot','--target-id',id,'--interactive']);
  const plus=uniqueRef(snap,/add files and more/i);
  if(mode==='send'){await state('prepared');staged=await stage(data)}
  phase='menu';
  await cli(['click','--target-id',id,plus]);menu=true;
  const options=await cli(['snapshot','--target-id',id,'--interactive']);
  const upload=uniqueRef(options,/upload from computer|upload files|browse files|上传文件|从电脑上传/i);
  if(mode==='inspect')return {...BASE,state:'observed',reason:'unique_local_upload_ref_confirmed',
   uploadTriggered:false,messageSent:false};
  phase='upload';
  await cli(['upload',staged.file,'--target-id',id,'--ref',upload]);
  uploaded=true;menu=false;
  await state('upload_returned');
  const attached=await proof(id);
  if(!attached.attached||!attached.empty||attached.generating)
   throw reject('attachment_not_confirmed_in_composer');
  const s=await cli(['snapshot','--target-id',id,'--interactive']);
  const editor=uniqueRef(s,/textbox.*(?:message|prompt|chatgpt|ask anything|消息|提问)/i);
  phase='draft';
  await cli(['type','--target-id',id,editor,TAG]);
  const draft=await proof(id);
  if(!draft.attached||draft.empty||draft.generating)
   throw reject('attachment_draft_not_confirmed');
  if(await tab()!==id)throw reject('chat_target_changed');
  // No second press, even if timeout or post-press receipt ambiguous.
  await state('press_intent');phase='send';pressed=true;
  await cli(['press','--target-id',id,'Enter']);
  phase='receipt';
  for(let i=0;i<6;i++){
   if((await proof(id)).receipt){
    await state('confirmed');
    return {...BASE,state:'observed',reason:'attachment_and_user_message_verified',
     uploadTriggered:true,messageSent:true,receiptVerified:true};
   }
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
  return {...BASE,state:'inconclusive',reason:'attachment_receipt_unconfirmed',
   uploadTriggered:true,messageSent:'unknown',noAutomaticRetry:true};
 }catch(e){
  return {...BASE,state:'blocked',reason:e?.safeReason??'browser_action_unavailable',
   phase,uploadTriggered:uploaded,messageSent:pressed?'unknown':false,
   ...(uploaded&&!pressed?{syntheticAttachmentMayRemain:true}:{}),
   noAutomaticRetry:true};
 }finally{
  if(menu){try{await cli(['press','--target-id',await tab(),'Escape'])}catch{}}
  if(staged)await rm(staged.dir,{recursive:true,force:true}).catch(()=>{});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const mode=process.argv.length===3?process.argv[2]:'';
 const report=await run({mode:mode==='--inspect'?'inspect':mode==='--send'?'send':'invalid'});
 console.log(JSON.stringify(report));
 if(report.state!=='observed')process.exitCode=1;
}
