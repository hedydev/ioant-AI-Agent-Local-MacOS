#!/usr/bin/env node
// Opt-in Stage 2: single exact ChatGPT conversation, structured tasks only.
// No arbitrary shell commands, browser click exploration, Chrome cookie imports or daemons.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { acquireConversationLock } from './conversation-lock.mjs';
import { resolve, dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { privateReportDir } from '../src/report-storage.mjs';
import { fileURLToPath } from 'node:url';
import { PROTOCOL, validateChatUrl, chatKey, extractAction, responseForTask, redactFeedback } from './protocol.mjs';
import { runAction } from './runner.mjs';

const call=promisify(execFile);
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MARKER='IOANT_MAC_LOOP_RESULT::';
const readPageFunction=`() => {
  const select='[data-message-author-role="assistant"]';
  const elements=Array.from(document.querySelectorAll(select));
  const messages=elements.slice(-6).map(el=>({
    codes:Array.from(el.querySelectorAll('pre code')).slice(0,8).map(code=>(code.textContent||'').slice(0,5000))
  }));
  const users=Array.from(document.querySelectorAll('[data-message-author-role="user"]')).slice(-5)
    .map(el=>(el.innerText||'').slice(0,1200));
  const editing=document.querySelector('#prompt-textarea');
  const generating=!!document.querySelector('[data-testid="stop-button"],button[aria-label="Stop generating"],button[aria-label="Stop streaming"]');
  return '${MARKER}' + JSON.stringify({url:location.href,selectorFound:elements.length>0,generating,messages,users,composerPresent:!!editing,composerEmpty:!editing||!editing.textContent?.trim()});
}`;

function argsOf(argv){
  const out={mode:'watch',interval:15,url:null,initialize:false,enableAlicePreflight:false};
  for(let i=0;i<argv.length;i++){
    if(argv[i]==='--once')out.mode='once';
    else if(argv[i]==='--watch')out.mode='watch';
    else if(argv[i]==='--list')out.mode='list';
    else if(argv[i]==='--initialize')out.initialize=true;
    else if(argv[i]==='--enable-alice-preflight')out.enableAlicePreflight=true;
    else if(argv[i]==='--chat-url')out.url=validateChatUrl(argv[++i]??'');
    else if(argv[i]==='--interval'){out.interval=Number(argv[++i]); if(!Number.isInteger(out.interval)||out.interval<10||out.interval>3600)throw Error('--interval must be 10..3600 seconds');}
    else throw Error('Unknown flag: '+argv[i]);
  }
  if(out.mode!=='list'&&!out.url)throw Error('Use --chat-url with the exact ChatGPT conversation URL; --list shows OpenClaw-profile tabs.');
  if(out.initialize&&out.mode==='once')throw Error('--initialize requires --watch');
  return out;
}
const profile=process.env.IOANT_CHATGPT_BROWSER_PROFILE || 'openclaw';
if(!['openclaw','user','chrome'].includes(profile)) {
  throw Error('Unsupported browser profile: only openclaw, user or chrome may be used for this loop');
}
const bin=process.env.IOANT_OPENCLAW_BIN || join(homedir(),'.openclaw','bin','openclaw');

async function browser(...args){
  const {stdout}=await call(bin,['browser','--browser-profile',profile,...args],{timeout:45000,maxBuffer:1024*1024});
  return stdout;
}

function jsonObject(stdout){
  try{return JSON.parse(stdout)}catch{throw Error('OpenClaw browser --json tabs returned invalid JSON');}
}
async function exactTab(url){
  const result=jsonObject(await browser('--json','tabs'));
  const tabs=Array.isArray(result)?result:result?.tabs??result?.result?.tabs;
  if(!Array.isArray(tabs))throw Error('OpenClaw tab list not available');
  if(!url)return tabs;
  const matches=tabs.filter(t=>t.url===url);
  if(matches.length!==1)throw Error(`Expected one open target ChatGPT tab in isolated OpenClaw profile; found ${matches.length}. Open and sign in to ${url} in that profile.`);
  const id=matches[0].suggestedTargetId??matches[0].tabId??matches[0].targetId;
  if(typeof id!=='string'||!/^[a-zA-Z0-9_:-]{1,128}$/.test(id))throw Error('Browser has no safe exact target handle');
  return id;
}

function unpackMarked(value){
  if(typeof value==='string'){
    if(value.startsWith(MARKER))return JSON.parse(value.slice(MARKER.length));
    if(value.trim().startsWith('{')||value.trim().startsWith('"')){
      try{return unpackMarked(JSON.parse(value))}catch{return null}
    }
    const idx=value.indexOf(MARKER);
    if(idx!==-1){
      const fragment=value.slice(idx+MARKER.length).trim();
      try{return JSON.parse(fragment)}catch{return null}
    }
    return null;
  }
  if(value&&typeof value==='object'){
    for(const candidate of ['result','value','text','output','content','data']){
      if(candidate in value){const found=unpackMarked(value[candidate]);if(found)return found;}
    }
  }
  return null;
}

async function readPage(target, url){
  const raw=await browser('--json','evaluate','--target-id',target,'--fn',readPageFunction);
  const parsed=unpackMarked(raw);
  if(!parsed||parsed.url!==url)throw Error('Browser DOM result does not match the exact authorized conversation URL');
  if(!parsed.composerPresent)throw Error('ChatGPT conversation input not ready. Sign in within isolated OpenClaw profile first.');
  return parsed;
}

function composerRef(snapshot){
  const matches=[...snapshot.matchAll(/[^\n]*\b(?:textbox|searchbox)\b[^\n]*\[ref=([a-zA-Z0-9_-]+)\][^\n]*/gi)]
    .filter(m=>/message|prompt|ChatGPT|ask anything|提问|消息/i.test(m[0]));
  if(matches.length!==1)throw Error(`Expected one ChatGPT message input reference, found ${matches.length}; refusing to type.`);
  return matches[0][1];
}

async function sendToChat(target,url,content,receipt){
  // Cannot mistake a pending uncertain send for a fresh task; always verify first.
  let state=await readPage(target,url);
  if(state.users.some(msg=>msg.includes(receipt)))return {confirmed:true,alreadySent:true};
  if(state.generating||!state.composerPresent||!state.composerEmpty)throw Error('ChatGPT is generating or composer is not empty/available; no automatic send');
  const snap=await browser('snapshot','--target-id',target,'--interactive');
  const ref=composerRef(snap);
  await browser('type','--target-id',target,ref,content);
  // Ensure text actually landed in the intended field before pressing Send.
  state=await readPage(target,url);
  if(state.composerEmpty||state.generating)throw Error('Composer did not accept text or assistant is still generating; no Enter sent');
  await browser('press','--target-id',target,'Enter');
  // A failed confirmation is an uncertain send, never blindly re-post it.
  await new Promise(resolve=>setTimeout(resolve,1000));
  state=await readPage(target,url);
  if(!state.users.some(msg=>msg.includes(receipt)))throw Error('Message send could not be confirmed; inspect ChatGPT manually before restarting (no automatic retry).');
  return {confirmed:true,alreadySent:false};
}

async function atomicState(file,state){
  const temp=file+'.'+process.pid+'.tmp';
  await writeFile(temp,JSON.stringify(state,null,2)+'\n',{mode:0o600,flag:'wx'});
  await rename(temp,file);
}
async function loadState(file){
  try{return JSON.parse(await readFile(file,'utf8'))}catch(err){if(err.code==='ENOENT')return {lastTaskId:null,feedbackPending:null,initSent:false};throw err}
}
async function writeReport(dir,task,result){
  const reports=join(homedir(),'Desktop','Ioant-AI-Agent-Reports','chatgpt-loop');
  await privateReportDir(reports);
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const filename=join(reports,stamp+'-'+task.id+'.md');
  const clean=redactFeedback(result.output??'');
  const body=[`# ChatGPT local task — ${task.id}`,'',`- Action: ${task.action}`,`- Status: ${result.status}`,`- Exit code: ${result.exitCode??'n/a'}`,`- Time: ${new Date().toISOString()}`,'','## Bounded output','', '```text',clean,'```',''].join('\n');
  await writeFile(filename,body,{mode:0o600,flag:'wx'});
  console.log('[loop] Desktop report: '+filename);
}

const INIT=`Ioant Mac local command feedback protocol ${PROTOCOL}\n启用本地命令反馈。你可以讨论任何工作；只有需要本机自动执行安全检查时，才输出一个独立 JSON 代码块，字段必须恰好为 protocol、id、action。例如 {"protocol":"${PROTOCOL}","id":"test-001","action":"project-tests"}。可自动执行的 action 仅有 project-tests、project-status、project-head、environment-scan，作用于 ioant-AI-Agent-Local-MacOS 仓库。其他操作会被明确拒绝/要求审批。不要输出 shell 字符串、cwd、argv、密钥或敏感文件内容。收到以 [IOANT-MAC-OPS RESULT id] 开头的执行结果后再判断下一步，需要下一项检查就输出新的唯一 id；无任务就正常回答。不要重复先前 id。`;

const INIT_ALICE=`Ioant Mac Alice witness workflow ioant-mac-ops-v1. 当前对话已连接你的 Mac 安全执行器。请先查看本对话上一条等待用户执行的命令：若正是 AliceAI 的 witness-preflight 预检，就立即输出唯一任务编号开始执行；如果不是，正常回答且不要自动执行其他操作。在需要执行 AliceAI 预检时，请只输出一个独立 JSON 代码块：{"protocol":"ioant-mac-ops-v1","id":"alice-唯一新任务编号","action":"alice-witness-preflight"}。此动作由 Mac 使用预先固定的仓库路径与本机配置的 SSH 目标，依次执行 Git fetch/ff-only pull、alice-mac.sh sync（内含本地/Mint 测试）、witness-preflight，只在所有步骤成功后读取本次新生成 schemaVersion 2 的 JSON 报告。失败会直接把错误反馈回来，不需要让我重复复制命令、寻找桌面文件或发送报告。收到 [IOANT-MAC-OPS RESULT id] 及原始失败摘要或经过校验的 JSON 后，先分析/修复，然后再输出新的唯一任务编号；不要重复上一任务。不要要求执行任意 shell、deploy/restart、改世界、安装行为包、管理账号或绕过 BDS 门禁。除这个固定工作流及原有四项本地检查外，其他操作都需要另行明确授权。`;

async function main(){
  const opts=argsOf(process.argv.slice(2));
  if(opts.mode==='list'){
    const tabs=await exactTab(null);
    const matches=tabs.filter(t=>{try{return !!validateChatUrl(t.url)}catch{return false}});
    console.log('[loop] ChatGPT tabs found in OpenClaw profile: '+matches.length);
    matches.forEach(t=>console.log('  '+t.url));
    return;
  }
  const store=process.env.PROJECT_DEV_CACHE;
  const volume=process.env.IOANT_DEV_VOLUME;
  if(!store||!volume||!resolve(store).startsWith(resolve(volume)+'/DeveloperCache/'))
    throw Error('Run through scripts/dev-env.sh exec, with explicitly verified development volume and PROJECT_DEV_CACHE');
  if(opts.enableAlicePreflight && !process.env.ALICE_SSH_TARGET) throw Error('Provide ALICE_SSH_TARGET on the Mac before --enable-alice-preflight');
  const workDir=join(store,'chatgpt-loop',chatKey(opts.url));
  await mkdir(workDir,{recursive:true,mode:0o700});
  const unlock=await acquireConversationLock(workDir);
  const stateFile=join(workDir,'state.json');
  const session=randomUUID().slice(0,8);
  let stopping=false;
  process.on('SIGINT',()=>{stopping=true;console.log('[loop] Stop requested; finishing current operation.');});
  process.on('SIGTERM',()=>{stopping=true;console.log('[loop] Stop requested; finishing current operation.');});
  let state,previousFingerprint='',stable=0;
  console.log('[loop] Tracking only: '+opts.url);
  console.log('[loop] Actions: project-tests / project-status / project-head / environment-scan'+(opts.enableAlicePreflight?' / alice-witness-preflight (scoped Mint sync)':'')+'. Ctrl-C stops.');
  try{
    state=await loadState(stateFile); // Must be within finally so a read failure does not leak lock.
    // A user may need to finish signing into ChatGPT in the managed browser.
    let target;
    while(!target){
      try{target=await exactTab(opts.url);await readPage(target,opts.url)}
      catch(e){if(opts.mode==='once')throw e;target=null;console.log('[loop] ChatGPT tab/sign-in not ready; waiting for the exact URL.');await new Promise(r=>setTimeout(r,opts.interval*1000));}
    }
    if(opts.initialize&&!opts.enableAlicePreflight&&!state.initSent){
      const receipt='Ioant Mac local command feedback protocol '+PROTOCOL;
      await sendToChat(target,opts.url,INIT,receipt);
      state.initSent=true;
      await atomicState(stateFile,state);
      console.log('[loop] One-time protocol sent to selected ChatGPT conversation.');
    }
    if(opts.initialize && opts.enableAlicePreflight && !state.aliceInitSent){
      const receipt='Ioant Mac Alice witness workflow ioant-mac-ops-v1';
      await sendToChat(target,opts.url,INIT_ALICE,receipt);
      state.aliceInitSent=true;
      await atomicState(stateFile,state);
      console.log('[loop] Alice witness-preflight workflow enabled in selected conversation.');
    }
    do {
      if(stopping)break;
      let nowTarget, page;
      try{
        nowTarget=await exactTab(opts.url); // Verify tab cannot switch between iterations.
        page=await readPage(nowTarget,opts.url);
      }catch(e){
        if(opts.mode==='once')throw e;
        console.log('[loop] ChatGPT tab not ready: '+redactFeedback(e.message));
        await new Promise(r=>setTimeout(r,opts.interval*1000));
        continue;
      }
      if(state.feedbackPending){
        // Commands never re-run after a crash / unclear send.
        const receipt='[IOANT-MAC-OPS RESULT '+state.feedbackPending.id+']';
        if(page.users.some(msg=>msg.includes(receipt))){
          state.lastTaskId=state.feedbackPending.id;state.feedbackPending=null;await atomicState(stateFile,state);
          console.log('[loop] Previously sent feedback confirmed; moving on.');
        } else {
          throw Error('Feedback pending for '+state.feedbackPending.id+'; sending again could duplicate a message. Check conversation manually.');
        }
      }
      const a=extractAction(page);
      if(a.status==='task'&&a.task.id!==state.lastTaskId){
        if(a.fingerprint===previousFingerprint)stable++; else {previousFingerprint=a.fingerprint;stable=1;}
        if(stable>=2){
          const task=a.task;
          const authorized=task.authorized || (task.action==='alice-witness-preflight' && opts.enableAlicePreflight);
          const result=authorized?await runAction(task.action,ROOT,{enableAlicePreflight:opts.enableAlicePreflight}):{status:'approval_required',reason:task.known?'This operation needs separate authorization.':'Action is not recognized or authorized.'};
          await writeReport(workDir,task,result);
          const feedback=responseForTask(task,result,session);
          state.feedbackPending={id:task.id,feedback};
          await atomicState(stateFile,state); // Persist BEFORE the send; no duplicate command execution.
          const receipt='[IOANT-MAC-OPS RESULT '+task.id+']';
          await sendToChat(nowTarget,opts.url,feedback,receipt);
          state.lastTaskId=task.id;state.feedbackPending=null;
          await atomicState(stateFile,state);
          console.log(`[loop] ${task.id}: ${result.status}. Feedback confirmed; waiting for next task.`);
          stable=0;previousFingerprint='';
        }
      } else {stable=0;previousFingerprint='';}
      if(opts.mode==='once')break;
      await new Promise(resolve=>setTimeout(resolve,opts.interval*1000));
    }while(!stopping);
  }finally{await unlock()}
}
main().catch(e=>{console.error('[loop] STOP: '+redactFeedback(e.message));process.exitCode=1});
