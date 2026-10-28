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
import { PROTOCOL, validateChatUrl, sameChatConversationUrl, chatKey, responseForTask, redactFeedback } from './protocol.mjs';
import {extractWatchedAction,invalidTaskResponse} from './task-observation.mjs';
import { runAction } from './runner.mjs';
import { reserveDevDiscussion } from './dev-discussion-claim.mjs';
import { reconcilePrewrite } from './openclaw-dev-prewrite-reconcile.mjs';
import { observeGuiReadOnly } from './gui-readonly-observation.mjs';
import { tabVisibility } from './tab-visibility.mjs';
import {resolveProjectRoute} from './project-chat-routing.mjs';
import {readHandshake,transitionHandshake,HANDSHAKE_RECEIPT,HANDSHAKE_MESSAGE} from './alice-coordinator-handshake.mjs';
import {inspectAliceOwnerReviewPacket} from './alice-owner-review-packet.mjs';
import {validateIsolatedProjectScope,sameIsolatedProjectChat,isolatedProjectAllowsAction} from './project-worker-scope.mjs';
import {enqueueZeroTabNotice,maintainerReceipt,maintainerNoticeMessage,markMaintainerPressIntent,completeMaintainerNotice,pendingMaintainerPhase} from './maintainer-outbox.mjs';
import { isBoundDevDiscussion } from './development-agent-route.mjs';
import { recordDiagnosticEvent, diagnosticCode } from './diagnostic-log.mjs';
import {nextGuardNotice,prepareGuardNotice,markGuardPressIntent,
 completeGuardNotice,receiptForGuardTicket,guardIncidentMessage,
 validateGuardOutboxState} from './guard-incident-outbox.mjs';
import { BrowserReadCircuit,waitBrowserCircuit } from './chatgpt-browser-read-circuit.mjs';

const call=promisify(execFile);
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MARKER='IOANT_MAC_LOOP_RESULT::';
const readPageFunction=`() => {
  // ChatGPT has two observed renderer families. Exact explicit role markers
  // only; never search all page text or code blocks for task JSON.
  const oldAssistant=Array.from(document.querySelectorAll('[data-message-author-role="assistant"]'));
  const newAssistant=oldAssistant.length?[]:Array.from(document.querySelectorAll('[data-content-search-unit-key$=":assistant"]'));
  const roleAssistant=(oldAssistant.length||newAssistant.length)?[]:
    Array.from(document.querySelectorAll('[data-conversation-role="assistant"]'));
  const assistantSource=oldAssistant.length?'legacy':newAssistant.length?'content_unit':roleAssistant.length?'role_unit':'absent';
  const elements=oldAssistant.length?oldAssistant:newAssistant.length?newAssistant:roleAssistant;
  const messages=elements.slice(-6).map(el=>({
    codes:Array.from(el.querySelectorAll('pre code')).slice(0,8).map(code=>(code.textContent||'').slice(0,5000))
  }));
  const oldUser=Array.from(document.querySelectorAll('[data-message-author-role="user"]'));
  // New renderer: content-search units have explicit :user suffix; if a
  // unit is not available, its dedicated user-message bubble is role-scoped.
  const newUser=oldUser.length?[]:Array.from(document.querySelectorAll('[data-content-search-unit-key$=":user"]'));
  const bubbleUser=(oldUser.length||newUser.length)?[]:
    Array.from(document.querySelectorAll('[data-user-message-bubble="true"]'));
  const userRoleNodes=(oldUser.length?oldUser:newUser.length?newUser:bubbleUser).slice(-100);
  const users=userRoleNodes.map(el=>{
    // Prefer the actual message body over UI labels on the role wrapper.
    const body=typeof el.querySelector==='function'
      ?(el.querySelector('[data-user-message-bubble="true"]')||
        el.querySelector('[data-message-content]')||
        el.querySelector('.whitespace-pre-wrap')):null;
    for(const candidate of [body,el].filter(Boolean)){
      const value=String(candidate.innerText||candidate.textContent||'').trimStart();
      const match=value.match(/^(Ioant Mac (?:local command feedback protocol ioant-mac-ops-v1|Alice witness workflow ioant-mac-ops-v1|Alice isolated 17880 startup probe ioant-mac-ops-v1|Mint read-only diagnostics ioant-mac-ops-v1)|\\[IOANT-MAC-OPS RESULT [a-zA-Z0-9_-]{4,80}\\]|\\[IOANT-GUARD-INCIDENT [0-9a-f]{24}\\])/);
      if(match)return match[1];
    }
    return null;
  }).filter(Boolean);
  const receiptEvidence={
    userRoleNodes:userRoleNodes.length,
    bodyNodes:userRoleNodes.filter(el=>typeof el.querySelector==='function'&&
      !!(el.querySelector('[data-user-message-bubble="true"]')||
         el.querySelector('[data-message-content]')||
         el.querySelector('.whitespace-pre-wrap'))).length,
    mintPhrasePresent:userRoleNodes.some(el=>String(el.textContent||el.innerText||'').includes('Ioant Mac Mint read-only diagnostics ioant-mac-ops-v1')),
    mintReceiptRecognized:users.includes('Ioant Mac Mint read-only diagnostics ioant-mac-ops-v1'),
    legacyUserNodes:oldUser.length,contentUserNodes:newUser.length,bubbleUserNodes:bubbleUser.length,
    legacyAssistantNodes:oldAssistant.length,contentAssistantNodes:newAssistant.length,roleAssistantNodes:roleAssistant.length,
    assistantSource
  };
  // ChatGPT has used both an id and a data-testid on its contenteditable composer.
  // Keep selectors narrow to the prompt area; never treat global search inputs as chat.
  const selectors=['#prompt-textarea','[data-testid="composer-input"][contenteditable="true"]',
    '[data-testid="prompt-textarea"][contenteditable="true"]','form [contenteditable="true"][role="textbox"]',
    'form textarea[aria-label*="Message"]','form textarea[aria-label*="消息"]'];
  const editing=selectors.map(selector=>document.querySelector(selector)).find(Boolean);
  const value=editing?(editing.matches('textarea')?editing.value:(editing.innerText??editing.textContent??'')):'';
  const generating=!!document.querySelector('[data-testid="stop-button"],button[aria-label="Stop generating"],button[aria-label="Stop streaming"]');
  // Structural flags only: never collect DOM, page text, cookies, or URLs of other tabs.
  return '${MARKER}' + JSON.stringify({url:location.href,selectorFound:elements.length>0,generating,messages,users,receiptEvidence,
    composerPresent:!!editing,composerEmpty:!String(value??'').trim(),
    readyState:document.readyState,hasMain:!!document.querySelector('main'),
    hasLoginForm:!!document.querySelector('form[action*="login"],input[autocomplete="current-password"]'),
    editableCount:document.querySelectorAll('[contenteditable="true"]').length});
}`;

function argsOf(argv){
  const out={mode:'watch',interval:15,url:null,projectKey:null,initialize:false,enableAlicePreflight:false,enableAliceLabStartupProbe:false,enableMintDiagnostics:false,enableSelfUpdate:false,enableOpenClawProvision:false,enableOpenClawAgentCreate:false,enableOpenClawDevCreate:false,enableGuiReadonly:false,devAgent:null};
  for(let i=0;i<argv.length;i++){
    if(argv[i]==='--once')out.mode='once';
    else if(argv[i]==='--watch')out.mode='watch';
    else if(argv[i]==='--list')out.mode='list';
    else if(argv[i]==='--initialize')out.initialize=true;
    else if(argv[i]==='--enable-alice-preflight')out.enableAlicePreflight=true;
    else if(argv[i]==='--enable-alice-lab-startup-probe')out.enableAliceLabStartupProbe=true;
    else if(argv[i]==='--enable-mint-diagnostics')out.enableMintDiagnostics=true;
    else if(argv[i]==='--enable-self-update')out.enableSelfUpdate=true;
    else if(argv[i]==='--enable-openclaw-provision')out.enableOpenClawProvision=true;
    else if(argv[i]==='--enable-openclaw-agent-create')out.enableOpenClawAgentCreate=true;
    else if(argv[i]==='--enable-openclaw-dev-create')out.enableOpenClawDevCreate=true;
    else if(argv[i]==='--enable-gui-readonly')out.enableGuiReadonly=true;
    else if(argv[i]==='--dev-agent'){
      const id=argv[++i];
      if(!['alice-ai','openclaw-dev'].includes(id))throw Error('--dev-agent must be alice-ai or openclaw-dev');
      out.devAgent=id;
    }
    else if(argv[i]==='--project-key')out.projectKey=argv[++i]??'';
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
// Single-process, operator-selected scope, verified before any browser access.
let isolatedProjectScope=null;

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
  const details=tabVisibility(tabs,url,profile);
  const matches=tabs.filter(t=>sameChatConversationUrl(t?.url,url));
  if(matches.length!==1){
    const failure=Error('Authorized ChatGPT tab unavailable: '+details.code+
     ' (profile='+details.profile+', visible='+details.visibleTabs+
     ', chatgpt='+details.chatgptTabs+', sameConversationId='+details.sameIdTabs+
     ', exact='+details.matchingTabs+', sameId='+matches.length+'). Verify one authorized conversation ID; no automatic navigation or profile change.');
    if(tabs.length===0&&matches.length===0&&profile==='chrome')
      failure.code='CHROME_RELAY_ZERO_TABS';
    throw failure;
  }
  if(isolatedProjectScope&&!sameIsolatedProjectChat(isolatedProjectScope,matches[0]?.url))
    throw Error('Isolated Project identity mismatch');
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
  if(!parsed||!sameChatConversationUrl(parsed.url,url)||
    (isolatedProjectScope&&!sameIsolatedProjectChat(isolatedProjectScope,parsed.url)))
    throw Error('Browser DOM result does not match the authorized conversation and Project');
  if(!parsed.composerPresent) {
    const detail='profile='+profile+', readyState='+(parsed.readyState??'unknown')+
      ', assistantTurns='+(parsed.selectorFound?'present':'absent')+
      ', main='+(parsed.hasMain?'present':'absent')+
      ', editableCount='+(Number.isInteger(parsed.editableCount)?parsed.editableCount:'unknown')+
      ', loginForm='+(parsed.hasLoginForm?'present':'absent');
    throw Error('ChatGPT input not detected ('+detail+'). This may be a loading/login/error page or a changed composer selector; do not assume the browser profile is signed out.');
  }
  return parsed;
}

function composerRef(snapshot){
  const matches=[...snapshot.matchAll(/[^\n]*\b(?:textbox|searchbox)\b[^\n]*\[ref=([a-zA-Z0-9_-]+)\][^\n]*/gi)]
    .filter(m=>/message|prompt|ChatGPT|ask anything|提问|消息/i.test(m[0]));
  if(matches.length!==1)throw Error(`Expected one ChatGPT message input reference, found ${matches.length}; refusing to type.`);
  return matches[0][1];
}

// Shared bounded, read-only receipt verification for post-send and restart.
// Never sends, re-presses Enter, or executes a task.
async function confirmUserReceipt(url,receipt,{initialDelay=false}={}){
  let pageSeen=false,readErrors=0,lastEvidence=null;
  for(let attempt=0;attempt<8;attempt++){
    if(initialDelay||attempt>0)await new Promise(resolve=>setTimeout(resolve,1500));
    try{
      const currentTarget=await exactTab(url);
      const page=await readPage(currentTarget,url);
      pageSeen=true;
      lastEvidence=page.receiptEvidence;
      if(page.users.some(msg=>msg.startsWith(receipt)))return true;
    }catch(err){
      readErrors++;
      if(attempt===7)recordDiagnosticEvent('page_not_ready',{code:diagnosticCode(err)});
    }
  }
  // Structural counters only; never print user text, raw DOM, URLs or credentials.
  if(pageSeen&&lastEvidence&&typeof lastEvidence==='object'){
    const safeCount=v=>Number.isSafeInteger(v)&&v>=0&&v<=100?v:'unknown';
    console.log('[loop] Receipt read-only evidence: userRoleNodes='+safeCount(lastEvidence.userRoleNodes)+
      ', bodyNodes='+safeCount(lastEvidence.bodyNodes)+
      ', mintPhrasePresent='+(lastEvidence.mintPhrasePresent===true)+
      ', mintReceiptRecognized='+(lastEvidence.mintReceiptRecognized===true)+
      ', legacyUserNodes='+safeCount(lastEvidence.legacyUserNodes)+
      ', contentUserNodes='+safeCount(lastEvidence.contentUserNodes)+
      ', bubbleUserNodes='+safeCount(lastEvidence.bubbleUserNodes)+
      ', legacyAssistantNodes='+safeCount(lastEvidence.legacyAssistantNodes)+
      ', contentAssistantNodes='+safeCount(lastEvidence.contentAssistantNodes)+
      ', roleAssistantNodes='+safeCount(lastEvidence.roleAssistantNodes)+
      ', assistantSource='+(typeof lastEvidence.assistantSource==='string'&&
        ['legacy','content_unit','role_unit','absent'].includes(lastEvidence.assistantSource)?lastEvidence.assistantSource:'unknown'));
  }
  recordDiagnosticEvent('receipt_unconfirmed',{code:pageSeen?'user_receipt_not_visible':readErrors?'page_unavailable':'unexpected'});
  return false;
}

async function sendToChat(target,url,content,receipt,{beforePress=async()=>{}}={}){
  // Safe retry boundary: only readPage / snapshot before any typing, never
  // retry Enter. Every attempt re-verifies exact tab and empty composer.
  let ref;
  for(let attempt=0;attempt<3;attempt++){
    const currentTarget=await exactTab(url);
    const page=await readPage(currentTarget,url);
    if(page.users.some(msg=>msg.startsWith(receipt)))return {confirmed:true,alreadySent:true};
    if(page.generating||!page.composerPresent||!page.composerEmpty)
      throw Error('ChatGPT composer is not safely available; no automatic send');
    try{
      ref=composerRef(await browser('snapshot','--target-id',currentTarget,'--interactive'));
      target=currentTarget;
      break;
    }catch(e){
      if(attempt===2)throw Error('Browser snapshot unavailable before typing; safe to retry later.');
      console.log('[loop] Browser snapshot temporarily unavailable before typing; read-only retry '+(attempt+1)+'/2.');
      await new Promise(r=>setTimeout(r,1200));
    }
  }
  await browser('type','--target-id',target,ref,content);
  const state=await readPage(target,url);
  if(state.composerEmpty||state.generating)
    throw Error('Composer did not accept text or assistant is generating; no Enter sent');
  // Durable press-intent MUST be written before Enter. From then on, receipt
  // recovery is read-only, because a timed-out press may have delivered.
  await beforePress();
  await browser('press','--target-id',target,'Enter');
  if(await confirmUserReceipt(url,receipt,{initialDelay:true}))
    return {confirmed:true,alreadySent:false};
  throw Error('Message send could not be confirmed; potential delivery, no automatic retry.');
}

// Recovery of an already-executed task MUST NOT execute the task again.
// Prepared means Enter was provably never pressed (press-intent not saved);
// uncertain/legacy/press_intent requires receipt-only polling.
async function reconcileFeedback(state,stateFile,url,{afterConfirmed=async()=>{}}={}){
  const pending=state.feedbackPending;
  if(!pending)return {outcome:'none'};
  const receipt='[IOANT-MAC-OPS RESULT '+pending.id+']';
  const found=await confirmUserReceipt(url,receipt);
  if(found){
    state.lastTaskId=pending.id;
    state.feedbackPending=null;
    await atomicState(stateFile,state);
    await afterConfirmed(pending);
    return {outcome:'confirmed'};
  }
  if(pending.phase==='prepared'){
    try{
      const target=await exactTab(url);
      await sendToChat(target,url,pending.feedback,receipt,{
        beforePress:async()=>{
          pending.phase='press_intent';
          await atomicState(stateFile,state);
        }
      });
      state.lastTaskId=pending.id;
      state.feedbackPending=null;
      await atomicState(stateFile,state);
      await afterConfirmed(pending);
      return {outcome:'confirmed'};
    }catch(e){
      // If the snapshot failed before typing, pending remains prepared.
      // If typing left a draft, the next attempt refuses a nonempty composer.
      // If Enter might have happened, press_intent forbids another send.
      console.log('[loop] Pending feedback is not yet deliverable; phase='+
        (pending.phase==='prepared'?'prepared':'press_intent')+'. No task replay.');
      return {outcome:'waiting'};
    }
  }
  console.log('[loop] Previous feedback may have been submitted; receipt not visible. Read-only recovery only, no resend.');
  return {outcome:'waiting'};
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
  // launchd workers cannot assume TCC access to Desktop. This flag is
  // injected only by the known, locally installed supervisor plist; it does
  // not authorize additional ChatGPT actions or change one-shot task state.
  const background=process.env.IOANT_BACKGROUND_SAFE_REPORTS==='1';
  const reports=background
    ?join(homedir(),'Library','Application Support','ioant-openclaw-ops','reports','chatgpt-loop')
    :join(homedir(),'Desktop','Ioant-AI-Agent-Reports','chatgpt-loop');
  await privateReportDir(reports);
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const filename=join(reports,stamp+'-'+task.id+'.md');
  const clean=redactFeedback(result.output??'');
  const body=[`# ChatGPT local task — ${task.id}`,'',`- Action: ${task.action}`,`- Status: ${result.status}`,`- Exit code: ${result.exitCode??'n/a'}`,`- Time: ${new Date().toISOString()}`,'','## Bounded output','', '```text',clean,'```',''].join('\n');
  await writeFile(filename,body,{mode:0o600,flag:'wx'});
  console.log(background?'[loop] Private runtime report saved':'[loop] Desktop report: '+filename);
}

const INIT=`Ioant Mac local command feedback protocol ${PROTOCOL}\n启用本地命令反馈。你可以讨论任何工作；只有需要本机自动执行安全检查时，才输出一个独立 JSON 代码块，字段必须恰好为 protocol、id、action。例如 {"protocol":"${PROTOCOL}","id":"test-001","action":"project-tests"}。可自动执行的 action 仅有 project-tests、project-status、project-head、environment-scan，作用于 ioant-AI-Agent-Local-MacOS 仓库。其他操作会被明确拒绝/要求审批。不要输出 shell 字符串、cwd、argv、密钥或敏感文件内容。收到以 [IOANT-MAC-OPS RESULT id] 开头的执行结果后再判断下一步，需要下一项检查就输出新的唯一 id；无任务就正常回答。不要重复先前 id。唯一例外是安全的本地 AI 开发讨论：action=openclaw-agent-dev-discuss 时必须额外包含 prompt 字符串（最多1600字符/2600字节），不得含敏感资料或任意 shell 代码；它只向由 Mac 启动参数 --dev-agent 固定绑定并经无工具权限预检的 Agent 发送技术讨论文本，结果是未经验证的模型建议，不能当作执行命令、Git提交、测试或游戏行为已成功的证据。`;

const INIT_MINT=`Ioant Mac Mint read-only diagnostics ioant-mac-ops-v1. 本对话已连接 Mac OpenClaw 受控执行器，用户授权对预先配置的 Linux Mint 做只读 BDS 17879/17880 进程归属排查，禁止停止或重启服务、修改世界、删除锁或重试实验服启动。若当前仍需要确认 17880 的进程身份，请只输出一个独立 JSON 代码块：{"protocol":"ioant-mac-ops-v1","id":"mint-唯一新任务编号","action":"mint-bds-process-identity"}。这项任务不接收 PID、host、shell、cwd、argv；由 Mac 使用本地固定 SSH 目标重新读取 ss，再核实 PID 的父进程、启动身份、可执行文件和工作目录，并与 17879 对比。如果 sudo -n 无权读取，执行器将返回 approval_required，绝不自动输入密码或改变 sudoers。收到 [IOANT-MAC-OPS RESULT id] 后根据脱敏 JSON 继续分析。若不需要检查就正常回复，不要制造重复任务。`;

const INIT_ALICE=`Ioant Mac Alice witness workflow ioant-mac-ops-v1. 当前对话已连接你的 Mac 安全执行器。请先查看本对话上一条等待用户执行的命令：若正是 AliceAI 的 witness-preflight 预检，就立即输出唯一任务编号开始执行；如果不是，正常回答且不要自动执行其他操作。在需要执行 AliceAI 预检时，请只输出一个独立 JSON 代码块：{"protocol":"ioant-mac-ops-v1","id":"alice-唯一新任务编号","action":"alice-witness-preflight"}。此动作由 Mac 使用预先固定的仓库路径与本机配置的 SSH 目标，依次执行 Git fetch/ff-only pull、alice-mac.sh sync（内含本地/Mint 测试）、witness-preflight，只在所有步骤成功后读取本次新生成 schemaVersion 2 的 JSON 报告。失败会直接把错误反馈回来，不需要让我重复复制命令、寻找桌面文件或发送报告。收到 [IOANT-MAC-OPS RESULT id] 及原始失败摘要或经过校验的 JSON 后，先分析/修复，然后再输出新的唯一任务编号；不要重复上一任务。不要要求执行任意 shell、deploy/restart、改世界、安装行为包、管理账号或绕过 BDS 门禁。除这个固定工作流及原有四项本地检查外，其他操作都需要另行明确授权。`;

const INIT_LAB=`Ioant Mac Alice isolated 17880 startup probe ioant-mac-ops-v1. 用户已批准将当前待执行的 AliceAI witness-lab-startup-probe 纳入单独授权的自动流程；这不是 17879 生产服 witness-preflight，也不是授权其他实验操作。如果当前仍需要进行隔离实验 BDS 17880 启动验收，请只输出一个独立 JSON 代码块：{"protocol":"ioant-mac-ops-v1","id":"alice-lab-唯一新任务编号","action":"alice-lab-startup-probe"}。Mac 执行器只有在启动参数明确包含 --enable-alice-lab-startup-probe 且 ALICE_SSH_TARGET 已设置时，才会对固定 Alice 仓库做原点/main/干净工作区检查、fetch/ff-only pull、sync 及 Mint 测试、17880 启动前检查，并在通过后仅尝试一次 17880 隔离 BDS 启动与正常停止。17879 生产服、生产世界、玩家账号及 BDS 运行配置不得改变。任何 sudo 密码提示、进程身份不明、失败、超时或无法确认关闭时，都停止并报告，不要重复探测。看到 [IOANT-MAC-OPS RESULT id] 后基于报告分析；若没有可信的关闭证据，先请求人工检查，不能发新的探测编号。禁止要求任意 shell、远程重启、安装行为包或绕过检查。`;

async function main(){
  const opts=argsOf(process.argv.slice(2));
  if(opts.projectKey){
    const raw=await readFile(join(ROOT,'config','chat-projects.json'),'utf8');
    if(raw.length>16384)throw Error('unsafe_isolated_project_manifest');
    isolatedProjectScope=validateIsolatedProjectScope(opts,JSON.parse(raw),profile);
  }
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
  if(opts.enableAliceLabStartupProbe && !process.env.ALICE_SSH_TARGET) throw Error('Provide ALICE_SSH_TARGET on the Mac before --enable-alice-lab-startup-probe');
  if(opts.enableMintDiagnostics && !process.env.ALICE_SSH_TARGET) throw Error('Provide ALICE_SSH_TARGET on the Mac before --enable-mint-diagnostics');
  const workDir=join(store,'chatgpt-loop',chatKey(opts.url));
  await mkdir(workDir,{recursive:true,mode:0o700});
  const unlock=await acquireConversationLock(workDir);
  const stateFile=join(workDir,'state.json');
  const session=randomUUID().slice(0,8);
  let lastPageErrorEvent=0,lastHeartbeat=Date.now();
   let lastGuardNoticeWarningAt=0;
  let stopping=false;
  process.on('SIGINT',()=>{stopping=true;console.log('[loop] Stop requested; finishing current operation.');});
  process.on('SIGTERM',()=>{stopping=true;console.log('[loop] Stop requested; finishing current operation.');});
  let state,previousFingerprint='',stable=0,lastVisibleStatus='';
  const browserCircuit=new BrowserReadCircuit();
  const noteBrowserSuccess=()=>{
    if(browserCircuit.recordSuccess().recovered){
      recordDiagnosticEvent('browser_circuit_recovered',{code:'page_verified'});
      console.log('[loop] Browser read circuit recovered after an exact-page verification.');
    }
  };
  const noteBrowserFailure=e=>{
    const result=browserCircuit.recordFailure(e);
    if(result.opened){
      recordDiagnosticEvent('browser_circuit_open',{code:result.code});
      console.log(result.state==='halted'?
        '[loop] Browser access denied; watcher parked without further browser requests until explicitly stopped.':
        '[loop] Browser reads repeatedly failed; circuit opened. Pausing browser requests for '+Math.ceil(result.waitMs/60000)+' minutes.');
    }
    return result.code;
  };
  console.log('[loop] Tracking only: '+opts.url);
  if(isolatedProjectScope)console.log('[loop] AliceAI isolated coordinator: read-only UI probe only; all host/task write actions rejected.');
  console.log('[loop] Actions: project-tests / project-status / project-head / environment-scan'+(opts.enableAlicePreflight?' / alice-witness-preflight (scoped Mint sync)':'')+(opts.enableAliceLabStartupProbe?' / alice-lab-startup-probe (one-shot 17880 only)':'')+(opts.enableMintDiagnostics?' / mint-bds-process-identity / mint-bds-process-lineage (read-only, fixed SSH target)':'')
    +(opts.enableSelfUpdate?' / project-update-verify (clean main, pretested fast-forward only)':'')
    +(opts.enableOpenClawProvision?' / openclaw-ollama-provision (local model provider write only)':'')
    +(opts.enableOpenClawAgentCreate?' / openclaw-alice-create (private text-only Agent once)':'')+(opts.enableOpenClawDevCreate?' / openclaw-dev-create / openclaw-dev-prewrite-reconcile (incident-064 only)':'')+(opts.enableGuiReadonly?' / openclaw-gui-readonly-probe (exact tab, no page text or actions)':'')+(opts.devAgent?' / openclaw-agent-dev-discuss (bound to '+opts.devAgent+', no tools)':' / AI discussion disabled (requires --dev-agent)')+'. Ctrl-C stops.');
  try{
    recordDiagnosticEvent('worker_start',{mode:opts.mode,profile});
    state=await loadState(stateFile); // Must be within finally so a read failure does not leak lock.
    // Independent Project owner verification: only the registered Project Chat
    // receives maintenance notices. Unknown or other chats stay unchanged.
    let maintainerRoute=null,consecutiveZeroTabs=0;
    if(opts.mode==='watch'&&profile==='chrome'&&!isolatedProjectScope){
      try{
        const raw=await readFile(join(ROOT,'config','chat-projects.json'),'utf8');
        if(raw.length<=16384)maintainerRoute=resolveProjectRoute(JSON.parse(raw),opts.url);
      }catch{/* No registered route: no autonomous notice. */}
    }
    async function noteRelayGap(e){
      if(!maintainerRoute)return;
      if(e?.code!=='CHROME_RELAY_ZERO_TABS'){consecutiveZeroTabs=0;return}
      consecutiveZeroTabs++;
      if(consecutiveZeroTabs<2)return;
      const out=enqueueZeroTabNotice(state,{projectKey:maintainerRoute.key,
        conversationId:maintainerRoute.conversationId});
      if(out.created){
        state=out.state;
        await atomicState(stateFile,state);
        console.log('[loop] Zero-tab Relay incident queued privately; no browser changes.');
      }
    }
    // A user may need to finish signing into ChatGPT in the managed browser.
    let target, lastStartupMissingLog=0;
    while(!target&&!stopping){
      // Cooldown makes ZERO browser requests; Ctrl-C/SIGTERM still stops promptly.
      if(!await waitBrowserCircuit(browserCircuit,()=>stopping))break;
      try{
        target=await exactTab(opts.url);
        if(opts.mode==='once') {
          // ChatGPT is a SPA: wait briefly for React to hydrate before
          // declaring the exact authorized tab unsuitable. No browser writes.
          let lastError;
          for(let attempt=0;attempt<3;attempt++) {
            try {await readPage(target,opts.url);lastError=null;break}
            catch(e) {
              lastError=e;
              if(!String(e.message).startsWith('ChatGPT input not detected')||attempt===2)throw e;
              await new Promise(resolve=>setTimeout(resolve,1200));
            }
          }
          if(lastError)throw lastError;
        } else {
          await readPage(target,opts.url);
        }
        noteBrowserSuccess();
      }
      catch(e){
        if(opts.mode==='once')throw e;
        target=null;
        await noteRelayGap(e);
        const browserFailureCode=noteBrowserFailure(e);
        // Keep the per-login watcher alive through transient Chrome tab loss.
        // Throttle public logs; private events carry only allowlisted reason codes.
        const now=Date.now();
        if(now-lastStartupMissingLog>=60000){
          console.log('[loop] Waiting for authorized ChatGPT conversation; browser read failed: '+browserFailureCode);
          recordDiagnosticEvent('page_not_ready',{code:diagnosticCode(e)});
          lastStartupMissingLog=now;
        }
        await new Promise(r=>setTimeout(r,opts.interval*1000));
      }
    }
    if(stopping)return;
    consecutiveZeroTabs=0;
    recordDiagnosticEvent('page_ready',{profile});
    // --once is acceptance-only. After the first successful exact-tab DOM read,
    // exit before a second browser request, message send, or task execution.
    // The surrounding finally still releases this conversation's lock.
    if(opts.mode==='once'){
      recordDiagnosticEvent('read_only_success',{profile});
      console.log('[loop] Read-only ChatGPT probe passed: exact conversation and composer detected; no task executed or message sent.');
      return;
    }
    // Reconcile a previous ambiguous send BEFORE attempting any new message.
    // An assistant reply cannot prove a user message exists; require the exact
    // user-role prefix receipt returned by the DOM reader.
    const initMeta={
      basic:{key:'initSent',receipt:'Ioant Mac local command feedback protocol '+PROTOCOL,content:INIT},
      mint:{key:'mintInitSent',receipt:'Ioant Mac Mint read-only diagnostics ioant-mac-ops-v1',content:INIT_MINT},
      alice:{key:'aliceInitSent',receipt:'Ioant Mac Alice witness workflow ioant-mac-ops-v1',content:INIT_ALICE},
      lab:{key:'labInitSent',receipt:'Ioant Mac Alice isolated 17880 startup probe ioant-mac-ops-v1',content:INIT_LAB}
    };
    if(state.initPending!==undefined&&state.initPending!==null){
      const pending=initMeta[state.initPending];
      if(!pending)throw Error('Unrecognized pending initialization state; no automatic send');
      // Delivered user messages may render after page hydration. Recheck
      // only the same exact ChatGPT tab, without sending any more messages.
      if(!await confirmUserReceipt(opts.url,pending.receipt)){
        recordDiagnosticEvent('initialization_uncertain',{mode:state.initPending});
        throw Error('Previous initialization send remains unconfirmed; no automatic resend. Verify the exact user message in ChatGPT before resuming.');
      }
      const kind=state.initPending;
      state[pending.key]=true;
      state.initPending=null;
      await atomicState(stateFile,state);
      recordDiagnosticEvent('initialization_reconciled',{mode:kind});
      console.log('[loop] Previous initialization found in ChatGPT user messages; no duplicate sent.');
    }
    async function ensureInitialization(kind){
      const entry=initMeta[kind];
      if(state[entry.key])return;
      const page=await readPage(target,opts.url);
      if(page.users.some(msg=>msg.startsWith(entry.receipt))){
        // Also covers legacy runs that sent an initialization message before
        // durable initPending was introduced.
        state[entry.key]=true;
        await atomicState(stateFile,state);
        recordDiagnosticEvent('initialization_reconciled',{mode:kind});
        console.log('[loop] Existing '+kind+' initialization confirmed from ChatGPT; skipping duplicate.');
        return;
      }
      recordDiagnosticEvent('initialization_attempt',{mode:kind});
      await sendToChat(target,opts.url,entry.content,entry.receipt,{
        beforePress:async()=>{
          state.initPending=kind;
          await atomicState(stateFile,state);
          recordDiagnosticEvent('initialization_pending',{mode:kind});
        }
      });
      state[entry.key]=true;
      state.initPending=null;
      await atomicState(stateFile,state);
      recordDiagnosticEvent('initialization_sent',{mode:kind});
      console.log('[loop] '+kind+' initialization confirmed in selected ChatGPT conversation.');
    }
    if(opts.initialize) {
      await ensureInitialization(opts.enableAliceLabStartupProbe?'lab':opts.enableMintDiagnostics?'mint':opts.enableAlicePreflight?'alice':'basic');
    }
    do {
      if(stopping)break;
      if(!await waitBrowserCircuit(browserCircuit,()=>stopping))break;
      let nowTarget, page;
      try{
        nowTarget=await exactTab(opts.url); // Verify tab cannot switch between iterations.
        page=await readPage(nowTarget,opts.url);
        noteBrowserSuccess();
      }catch(e){
        if(opts.mode==='once')throw e;
        await noteRelayGap(e);
        const browserFailureCode=noteBrowserFailure(e);
        if(Date.now()-lastPageErrorEvent>=60000){
          recordDiagnosticEvent('page_not_ready',{code:diagnosticCode(e)});
          lastPageErrorEvent=Date.now();
        }
        if(browserCircuit.remaining()===0)
          console.log('[loop] ChatGPT tab not ready: '+browserFailureCode);
        await new Promise(r=>setTimeout(r,opts.interval*1000));
        continue;
      }
      consecutiveZeroTabs=0;
      if(state.feedbackPending){
        const recovery=await reconcileFeedback(state,stateFile,opts.url,{
          afterConfirmed:async pending=>{
            recordDiagnosticEvent('feedback_confirmed',{taskId:pending.id});
            console.log('[loop] Previously executed feedback confirmed; no task replay.');
            if(pending.reloadRequired===true&&pending.action==='project-update-verify')
              process.exitCode=75;
          }
        });
        if(process.exitCode===75)break;
        if(recovery.outcome!=='confirmed'){
          await new Promise(r=>setTimeout(r,opts.interval*1000));
          continue; // Never run a new task while previous feedback unresolved.
        }
      }
      // Do not preempt a new or ambiguous assistant task with an unsolicited
      // Guard notice. Delivery is allowed only when the latest turn has no
      // pending executable instruction, or its task ID was already handled.
      const taskBeforeGuard=extractWatchedAction(page);
      const safeGuardSlot=taskBeforeGuard.status==='idle'||
        (taskBeforeGuard.status==='task'&&taskBeforeGuard.task.id===state.lastTaskId);
      // Same exact-chat single-writer notification bridge for Guard incidents.
      // The independent Guard ONLY persists tickets and never touches Chrome.
      // A pending ordinary task receipt ALWAYS takes priority over this block.
      // The source service plist, ticket scope and digest are validated before
      // the existing, locally authorized browser sender may be called.
      if(!isolatedProjectScope){
        if(state.guardNotice&&!validateGuardOutboxState(state))
          throw Error('Untrusted pending Guard notice state; no send.');
        // Once Enter may have been pressed, receipt reconciliation has
        // priority over ANY new assistant task. Prepared notices yield to a
        // fresh task and never preempt it.
        if(state.guardNotice&&
           (safeGuardSlot||state.guardNotice.phase==='press_intent')){
          const receipt=receiptForGuardTicket(state.guardNotice.ticket);
          if(page.users.some(msg=>msg.startsWith(receipt))){
            state=completeGuardNotice(state);
            await atomicState(stateFile,state);
            console.log('[loop] Guard incident receipt confirmed; previous notice not replayed.');
          }else if(state.guardNotice.phase==='press_intent'){
            if(await confirmUserReceipt(opts.url,receipt)){
              state=completeGuardNotice(state);
              await atomicState(stateFile,state);
              console.log('[loop] Guard incident receipt reconciled; no second Enter.');
            }else{
              console.log('[loop] Guard incident delivery uncertain; receipt-only recovery.');
            }
          }else{
            try{
              await sendToChat(nowTarget,opts.url,
                guardIncidentMessage(state.guardNotice.ticket),receipt,{
                beforePress:async()=>{
                  state=markGuardPressIntent(state);
                  await atomicState(stateFile,state);
                }
              });
              state=completeGuardNotice(state);
              await atomicState(stateFile,state);
              console.log('[loop] Guard incident delivered to exact authorized Chat.');
            }catch{
              // The same safe sender preserves press_intent before Enter.
              // Never send a second Enter after an ambiguous delivery.
              console.log('[loop] Guard notice still queued; no blind resend.');
            }
          }
          await new Promise(r=>setTimeout(r,opts.interval*1000));
          continue;
        }
        if(safeGuardSlot&&!state.guardNotice)try{
          const ticket=await nextGuardNotice({chatUrl:opts.url,state});
          if(ticket){
            state=prepareGuardNotice(state,ticket);
            await atomicState(stateFile,state); // Durable before any browser input.
            console.log('[loop] Scoped Guard incident queued for exact Chat.');
            await new Promise(r=>setTimeout(r,opts.interval*1000));
            continue;
          }
        }catch(e){
          // This feature is optional; an untrusted Guard journal cannot block
          // existing tasks or become a browser message. No raw error/log leaks.
          if(!lastGuardNoticeWarningAt||Date.now()-lastGuardNoticeWarningAt>60000){
            console.log('[loop] Guard notification source unavailable; sending disabled.');
            lastGuardNoticeWarningAt=Date.now();
          }
        }
      }
      // Single writer: the same exact-chat watcher delivers one fixed
      // Maintainer incident only after Chrome Relay recovers. Its receipt is
      // verified from a fresh user-role bubble; press-intent forbids replay.
      if(maintainerRoute&&state.maintainerNotice){
        const route={projectKey:maintainerRoute.key,
          conversationId:maintainerRoute.conversationId};
        const phase=pendingMaintainerPhase(state,route);
        const receipt=maintainerReceipt(state.maintainerNotice,route);
        const present=page.users.some(msg=>msg.startsWith(receipt));
        if(present){
          state=completeMaintainerNotice(state,route);
          await atomicState(stateFile,state);
          console.log('[loop] Maintainer incident receipt confirmed in the exact ChatGPT user role.');
        }else if(phase==='press_intent'){
          if(await confirmUserReceipt(opts.url,receipt)){
            state=completeMaintainerNotice(state,route);
            await atomicState(stateFile,state);
            console.log('[loop] Maintainer incident receipt reconciled without a second Enter.');
          }else console.log('[loop] Maintainer report delivery uncertain; read-only retry only.');
        }else{
          try{
            await sendToChat(nowTarget,opts.url,
              maintainerNoticeMessage(state.maintainerNotice,route),receipt,{
                beforePress:async()=>{
                  state=markMaintainerPressIntent(state,route);
                  await atomicState(stateFile,state);
                }
              });
            state=completeMaintainerNotice(state,route);
            await atomicState(stateFile,state);
            console.log('[loop] Maintainer incident delivered and receipt confirmed.');
          }catch{
            console.log('[loop] Maintainer report still queued; no blind resend.');
          }
        }
        // Re-read any assistant task after a report. Never reuse a DOM
        // snapshot taken before sending a new user-role message.
        await new Promise(r=>setTimeout(r,opts.interval*1000));
        continue;
      }
      const a=taskBeforeGuard;
      // A fixed, operator-requested single-writer handshake. It is produced
      // only by this already-running Alice watcher, never by another Chat writer.
      // An assistant task in progress has priority; there is no unsolicited
      // message on normal idle runs without an explicit local mailbox request.
      if(isolatedProjectScope&&a.status==='idle'){
        const handshake=await readHandshake();
        if(handshake&&handshake.phase!=='confirmed'){
          const receipt=HANDSHAKE_RECEIPT;
          if(handshake.phase==='press_intent'){
            if(page.users.some(msg=>msg.startsWith(receipt))||
               await confirmUserReceipt(opts.url,receipt)){
              await transitionHandshake('press_intent','confirmed');
              console.log('[loop] Alice coordinator handshake user message confirmed without replay.');
            }else{
              console.log('[loop] Alice coordinator handshake uncertain; no second send.');
            }
          }else if(handshake.phase==='requested'){
            // If an operator has already supplied the exact handshake text,
            // reconcile it instead of sending a duplicate.
            if(page.users.some(msg=>msg.startsWith(receipt))){
              await transitionHandshake('requested','press_intent');
              await transitionHandshake('press_intent','confirmed');
              console.log('[loop] Existing Alice handshake confirmed without a second send.');
            }else{
              try{
                await sendToChat(nowTarget,opts.url,HANDSHAKE_MESSAGE,receipt,{
                  beforePress:async()=>{await transitionHandshake('requested','press_intent')}
                });
                await transitionHandshake('press_intent','confirmed');
                console.log('[loop] Alice coordinator handshake confirmed in exact Project Chat.');
              }catch{
                console.log('[loop] Alice coordinator handshake send uncertain; no blind resend.');
              }
            }
          }
          await new Promise(r=>setTimeout(r,opts.interval*1000));
          continue;
        }
      }
      // A malformed task with a valid protocol, known action and safe task ID
      // gets at most one correction receipt. Nothing from its command is run or echoed.
      if(a.status==='rejected_invalid_task'&&a.report&&a.report.id!==state.lastTaskId){
        const bad=a.report;
        if(bad.fingerprint===previousFingerprint)stable++;
        else {previousFingerprint=bad.fingerprint;stable=1;}
        if(stable>=2){
          const feedback=invalidTaskResponse(bad);
          const receipt='[IOANT-MAC-OPS RESULT '+bad.id+']';
          state.feedbackPending={id:bad.id,action:'invalid-task-feedback',
            reloadRequired:false,phase:'prepared',feedback};
          await atomicState(stateFile,state); // Persist before typing or pressing Enter.
          recordDiagnosticEvent('invalid_task_feedback_pending',{taskId:bad.id,code:bad.reason});
          try{
            await sendToChat(nowTarget,opts.url,feedback,receipt,{
              beforePress:async()=>{
                state.feedbackPending.phase='press_intent';
                await atomicState(stateFile,state);
              }
            });
          }catch{
            console.log('[loop] Invalid-task correction receipt deferred; no command executed or repeat Enter.');
            await new Promise(r=>setTimeout(r,opts.interval*1000));
            continue;
          }
          state.lastTaskId=bad.id;
          state.feedbackPending=null;
          await atomicState(stateFile,state);
          recordDiagnosticEvent('invalid_task_feedback_confirmed',{taskId:bad.id,code:bad.reason});
          console.log('[loop] Invalid task rejected and correction receipt confirmed in exact chat.');
          stable=0;previousFingerprint='';
        }
        await new Promise(r=>setTimeout(r,opts.interval*1000));
        continue;
      }
      // An assistant turn containing two or more executable JSON blocks is
      // rejected as a whole. Do not pick an action, send a receipt or exit.
      // A later unambiguous assistant turn can resume normal dispatch.
      if(a.status==='rejected_ambiguous_task'){
        stable=0;previousFingerprint='';
        if(lastVisibleStatus!=='ambiguous_task'){
          console.log('[loop] Multiple executable tasks refused; no action executed. Watch remains active until a new single-task turn.');
          recordDiagnosticEvent('ambiguous_task_refused',{code:'multiple_tasks'});
          lastVisibleStatus='ambiguous_task';
        }
        if(Date.now()-lastHeartbeat>=120000){
          recordDiagnosticEvent('watch_heartbeat',{status:'ambiguous_task'});
          console.log('[loop] Watch heartbeat: ambiguous_task; monitoring the exact ChatGPT conversation.');
          lastHeartbeat=Date.now();
        }
        await new Promise(resolve=>setTimeout(resolve,opts.interval*1000));
        continue;
      }
      if(a.status==='task'&&a.task.id!==state.lastTaskId){
        if(a.fingerprint===previousFingerprint)stable++; else {previousFingerprint=a.fingerprint;stable=1;}
        if(stable>=2){
          const task=a.task;
          const isDevDiscussion=['openclaw-alice-dev-discuss','openclaw-agent-dev-discuss'].includes(task.action);
           const devBindingOk=isBoundDevDiscussion(task.action,opts.devAgent);
           const authorized=(task.authorized&&(!isDevDiscussion||devBindingOk)) ||
             (task.action==='alice-witness-preflight' && opts.enableAlicePreflight)
            || (task.action==='alice-lab-startup-probe' && opts.enableAliceLabStartupProbe)
            || ((task.action==='mint-bds-process-identity'||task.action==='mint-bds-process-lineage') && opts.enableMintDiagnostics)
            || (task.action==='project-update-verify' && opts.enableSelfUpdate)
            || (task.action==='openclaw-ollama-provision' && opts.enableOpenClawProvision)
            || (task.action==='openclaw-alice-create' && opts.enableOpenClawAgentCreate)
             || (task.action==='openclaw-dev-create' && opts.enableOpenClawDevCreate)
             || (task.action==='openclaw-dev-prewrite-reconcile' && opts.enableOpenClawDevCreate)
             || (task.action==='openclaw-gui-readonly-probe' && opts.enableGuiReadonly)
             || (task.action==='openclaw-native-cua-readonly' && opts.enableGuiReadonly)
             || task.action==='mac-terminal'
             || task.action==='mac-window-text'
             || task.action==='alice-owner-review-preview';
          const scopedAuthorized=authorized&&
            (!isolatedProjectScope||isolatedProjectAllowsAction(isolatedProjectScope,task,opts));
          recordDiagnosticEvent('task_seen',{taskId:task.id,action:task.known?task.action:'unknown'});
          recordDiagnosticEvent('action_started',{taskId:task.id,action:task.known?task.action:'unknown'});
          let result;
          if(!scopedAuthorized) {
            result={status:'approval_required',reason:task.known?'This operation needs separate authorization.':'Action is not recognized or authorized.'};
          }else if(task.action==='alice-owner-review-preview'){
            // Only the existing exact-Project Alice coordinator can retrieve
            // a private advisory packet. No workflow mutation or acceptance.
            result=await inspectAliceOwnerReviewPacket(isolatedProjectScope);
          }else if(task.action==='alice-lab-startup-probe'){
            // Persist a permanent per-conversation one-shot barrier BEFORE ANY
            // Git/SSH/lab operation. A crash, failed report or a new task ID
            // cannot automatically launch the 17880 BDS twice.
            if(state.labProbeAttempted){
              result={status:'approval_required',reason:'The 17880 lab startup probe has already been attempted or its outcome is uncertain. No automatic repeat; inspect BDS lab process and reports before separate approval.'};
            }else{
              state.labProbeAttempted={id:task.id,at:new Date().toISOString()};
              await atomicState(stateFile,state);
              recordDiagnosticEvent('lab_probe_claimed',{taskId:task.id});
              console.log('[loop] One-shot 17880 lab probe claimed. Never auto-retry this probe.');
              result=await runAction(task.action,ROOT,{enableAliceLabStartupProbe:true});
            }
           }else if(task.action==='openclaw-dev-create'){
             // Record an irreversible per-chat claim BEFORE any config RPC or
             // filesystem mutation. An uncertain outcome requires inspection.
             if(state.devAgentCreationAttempted){
               result={status:'approval_required',reason:'The OpenClaw Dev creation attempt is already claimed or has an uncertain result. No automatic retry.'};
             }else{
               state.devAgentCreationAttempted={id:task.id,at:new Date().toISOString()};
               await atomicState(stateFile,state);
               recordDiagnosticEvent('openclaw_dev_create_claimed',{taskId:task.id});
               result=await runAction(task.action,ROOT,{enableOpenClawDevCreate:true});
             }
           }else if(task.action==='openclaw-dev-prewrite-reconcile'){
             // Only the authorized, exact-chat foreground watcher can reconcile
             // this single verified prewrite failure. Never config.patch here.
             const recovery=await reconcilePrewrite(state,{url:opts.url});
             if(recovery.ok){
               await atomicState(stateFile,recovery.state);
               state=recovery.state;
             }
             result={status:recovery.ok?'passed':'inconclusive',
               output:JSON.stringify({audit:'IOANT_OPENCLAW_DEV_PREWRITE_RECONCILE',
                schemaVersion:1,state:recovery.ok?'recovered':'blocked',
                reason:recovery.reason,configWrite:false,agentCreation:false})};
           }else if(task.action==='openclaw-gui-readonly-probe'){
             // Local opt-in, exact-tab-only. No screenshot, DOM text, raw
             // browser output, clicks, typing or navigation leaves this branch.
             const target=await exactTab(opts.url);
             const audit=await observeGuiReadOnly({url:opts.url,target,browser});
             result={status:audit.state==='observed'?'passed':
               audit.state==='blocked'?'approval_required':'inconclusive',
               output:JSON.stringify(audit)};
           }else if(isDevDiscussion){
            // Reserve before invoking Gateway. After interruption, the old ID
            // remains permanently claimed and must never trigger inference.
            const claim=reserveDevDiscussion(state,task.id);
            if(!claim.ok){
              result={status:'inconclusive',reason:claim.reason};
            }else{
              await atomicState(stateFile,claim.state);
              state=claim.state;
              recordDiagnosticEvent('dev_discussion_claimed',{taskId:task.id});
              result=await runAction(task.action,ROOT,{
                agentId:opts.devAgent,prompt:task.prompt,chatDigest:chatKey(opts.url)});
            }
          }else{
            result=await runAction(task.action,ROOT,{enableAlicePreflight:opts.enableAlicePreflight,enableMintDiagnostics:opts.enableMintDiagnostics,
              enableSelfUpdate:opts.enableSelfUpdate,enableOpenClawProvision:opts.enableOpenClawProvision,
              terminalTask:task,terminalChatUrl:opts.url,
              enableOpenClawAgentCreate:opts.enableOpenClawAgentCreate,
               enableOpenClawDevCreate:opts.enableOpenClawDevCreate,
               enableGuiReadonly:opts.enableGuiReadonly});
          }
          recordDiagnosticEvent('action_finished',{taskId:task.id,action:task.known?task.action:'unknown',status:result.status,...(Number.isInteger(result.exitCode)?{exitCode:result.exitCode}:{}),...(Number.isInteger(result.elapsedMs)?{elapsedMs:result.elapsedMs}:{})});
          await writeReport(workDir,task,result);
          recordDiagnosticEvent('report_saved',{taskId:task.id});
          const feedback=responseForTask(task,result,session);
          state.feedbackPending={id:task.id,action:task.action,
            reloadRequired:task.action==='project-update-verify'&&result.status==='passed'&&result.reloadRequired===true,
            phase:'prepared',feedback};
          await atomicState(stateFile,state); // Persist BEFORE the send; no duplicate command execution.
          recordDiagnosticEvent('feedback_pending',{taskId:task.id});
          const receipt='[IOANT-MAC-OPS RESULT '+task.id+']';
          try{
            await sendToChat(nowTarget,opts.url,feedback,receipt,{
              beforePress:async()=>{
                state.feedbackPending.phase='press_intent';
                await atomicState(stateFile,state);
              }
            });
          }catch(e){
            console.log('[loop] Feedback send deferred: browser unavailable or delivery uncertain; task not repeated.');
            await new Promise(r=>setTimeout(r,opts.interval*1000));
            continue; // Pending state controls read-only recovery or safe retry.
          }
          state.lastTaskId=task.id;state.feedbackPending=null;
          await atomicState(stateFile,state);
          recordDiagnosticEvent('feedback_confirmed',{taskId:task.id,status:result.status});
          console.log(`[loop] ${task.id}: ${result.status}. Feedback confirmed; waiting for next task.`);
          // Only a validated, finished fast-forward with positively confirmed
          // chat receipt may ask the parent launcher to reload Node modules.
          // The conversation lock is released in finally before respawning.
          if(task.action==='project-update-verify'&&result.status==='passed'&&result.reloadRequired===true){
            console.log('[loop] Validated update feedback delivered; requesting one controlled self-reload.');
            process.exitCode=75;
            break;
          }
          stable=0;previousFingerprint='';
        }
      } else {stable=0;previousFingerprint='';}
      // A normal prose response or a reply with no protocol JSON is an
      // intentional idle state. Show an operator-visible status, but never
      // manufacture an executable task or send another ChatGPT message.
      const watchStatus=a.status==='idle'?'idle'
        :a.status==='generating'?'generating'
        :a.status==='rejected_invalid_task'?'invalid_task'
        :a.task.id===state.lastTaskId?'handled':'candidate';
      if(watchStatus!==lastVisibleStatus){
        if(watchStatus==='idle')console.log('[loop] Waiting for a structured ChatGPT task; latest reply contains no executable JSON. Watch remains active.');
        else if(watchStatus==='generating')console.log('[loop] ChatGPT is replying; watch remains active.');
        else if(watchStatus==='invalid_task')console.log('[loop] Rejected malformed structured task; no action executed. Watch remains active until a new valid task.');
        else if(watchStatus==='handled')console.log('[loop] Latest structured task was already handled; awaiting a new task ID.');
        else console.log('[loop] Structured task detected; verifying a second stable page read before execution.');
        lastVisibleStatus=watchStatus;
      }
      if(Date.now()-lastHeartbeat>=120000){
        recordDiagnosticEvent('watch_heartbeat',{status:watchStatus});
        console.log('[loop] Watch heartbeat: '+watchStatus+'; still monitoring the exact ChatGPT conversation.');
        lastHeartbeat=Date.now();
      }
      await new Promise(resolve=>setTimeout(resolve,opts.interval*1000));
    }while(!stopping);
  }finally{
    recordDiagnosticEvent('watch_stopped');
    await unlock();
  }
}
main().catch(e=>{
  try{recordDiagnosticEvent('worker_error',{code:diagnosticCode(e)})}catch{}
  console.error('[loop] STOP: '+redactFeedback(e.message));process.exitCode=1;
});
