#!/usr/bin/env node
// One-shot, exact-chat, read-only structural diagnosis for already delivered
// synthetic attachment. Never sends, uploads, clicks, types, or screenshots.
// Only fixed Boolean evidence and bounded structural counts leave the browser.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {exactTab} from './openclaw-chatgpt-fixture-upload.mjs';

const exec=promisify(execFile), HOME=homedir();
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(HOME,'Library','Application Support','ioant-openclaw-ops','runtime');
const BIN=join(HOME,'.openclaw','bin','openclaw');
const CHAT='https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/6ae18e93-e2a0-83ec-aac9-88105079f208';
const MARK='IOANT-UPLOAD-FIXTURE-20261028-196';
const NAME='IOANT-ChatGPT-Upload-Fixture-20261028.txt';
const PREFIX='IOANT_RECEIPT_DIAG:';
const AUDIT='IOANT_CHATGPT_UPLOAD_RECEIPT_READONLY';
const BASE={audit:AUDIT,schemaVersion:1,state:'inconclusive',
 readOnly:true,exactConversationOnly:true,syntheticFixtureOnly:true,
 uploadTriggered:false,messageSent:false,changedBrowser:false,
 userTextReturned:false,rawDOMReturned:false,screenshotTaken:false,
 invokedComputerAct:false};

export function buildReceiptProbe(){
 const selectors=[
  '[data-message-author-role="user"]',
  '[data-content-search-unit-key$=":user"]',
  '[data-conversation-role="user"]',
  '[data-user-message-bubble="true"]'
 ];
 const constants='const URL='+JSON.stringify(CHAT)+
  ',MARK='+JSON.stringify(MARK)+',NAME='+JSON.stringify(NAME)+
  ',SELECTORS='+JSON.stringify(selectors)+
  ',PREFIX='+JSON.stringify(PREFIX)+';';
 return '() => {'+constants+
  'const root=document.querySelector("main");'+
  'const groups=SELECTORS.map(s=>Array.from(document.querySelectorAll(s)).slice(-80));'+
  'const nodes=Array.from(new Set(groups.flat()));'+
  'const txt=e=>String(e?.innerText??"")+" "+String(e?.textContent??"");'+
  'const markerNodes=nodes.filter(e=>txt(e).includes(MARK));'+
  'const same=markerNodes.some(e=>txt(e).includes(NAME));'+
  'let parent=false;'+
  'for(const el of markerNodes){'+
   'let p=el.parentElement;'+
   'for(let i=0;i<4&&p&&p!==root;i++,p=p.parentElement)'+
    'if(txt(p).includes(NAME))parent=true;'+
  '}'+
  'const mainText=String(root?.innerText??"")+" "+String(root?.textContent??"");'+
  'const attrs=Array.from(root?.querySelectorAll("[title],[aria-label]")??[]).slice(-3000);'+
  'const attr=attrs.some(e=>String(e.getAttribute("title")??"").includes(NAME)||'+
    'String(e.getAttribute("aria-label")??"").includes(NAME));'+
  'return PREFIX+JSON.stringify({exact:location.href===URL,main:!!root,'+
   'counts:groups.map(g=>g.length),markerRole:markerNodes.length>0,'+
   'sameRole:same,parent,markerMain:mainText.includes(MARK),'+
   'filenameMain:mainText.includes(NAME),filenameAttr:attr});'+
 '}';
}

const BOOLEAN_KEYS=['markerRole','sameRole','parent','markerMain','filenameMain','filenameAttr'];
export function summarizeReceipt(raw){
 let parsed=null;
 const visit=(x,depth=0)=>{
  if(depth>12||x==null)return;
  if(typeof x==='string'){
   if(x.startsWith(PREFIX)){try{parsed=JSON.parse(x.slice(PREFIX.length))}catch{};return}
   if(x.length>500000)return;
   if(x.startsWith('{')||x.startsWith('"')||x.startsWith('[')){
    try{visit(JSON.parse(x),depth+1)}catch{}
   }
   return;
  }
  if(typeof x!=='object')return;
  if(Array.isArray(x)){for(const row of x.slice(0,24)){visit(row,depth+1);if(parsed)return}return}
  for(const k of ['result','value','text','output','content','data']){
   if(k in x){visit(x[k],depth+1);if(parsed)return}
  }
 };
 visit(raw);
 if(!parsed||parsed.exact!==true||parsed.main!==true)
  return {...BASE,reason:'exact_chat_dom_unverified'};
 if(!Array.isArray(parsed.counts)||parsed.counts.length!==4||
  !parsed.counts.every(x=>Number.isSafeInteger(x)&&x>=0&&x<=80)||
  !BOOLEAN_KEYS.every(k=>typeof parsed[k]==='boolean'))
  return {...BASE,reason:'unexpected_bounded_dom_structure'};
 return {...BASE,state:'observed',reason:'fixed_receipt_structure_observed',
  roleCounts:parsed.counts,
  ...Object.fromEntries(BOOLEAN_KEYS.map(k=>[k,parsed[k]]))};
}
async function cli(args){
 const {stdout}=await exec(BIN,['browser','--browser-profile','chrome',...args],
  {cwd:RUNTIME,shell:false,timeout:25000,maxBuffer:1024*1024});
 return stdout;
}
export async function inspectReceipt({call=cli,allowedRuntime=async()=>
 process.platform==='darwin'&&ROOT===RUNTIME&&await realpath(RUNTIME)===RUNTIME}={}){
 try{
  if(!await allowedRuntime())return {...BASE,reason:'private_runtime_required'};
  const t=JSON.parse(await call(['--json','tabs']));
  const id=exactTab(t);
  const result=await call(['--json','evaluate','--target-id',id,'--fn',buildReceiptProbe()]);
  return summarizeReceipt(result);
 }catch{return {...BASE,reason:'browser_readonly_probe_unavailable'}}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const answer=process.argv.length===2?await inspectReceipt():
  {...BASE,reason:'unsupported_arguments'};
 console.log(JSON.stringify(answer));
 if(answer.state!=='observed')process.exitCode=1;
}
