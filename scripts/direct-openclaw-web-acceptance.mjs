#!/usr/bin/env node
// Operator-authorized infrastructure Chat test through the existing Browser Relay.
// Never opens another chat, reads auth storage, uploads files or resends messages.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {executionEnvironment,redactExecutionOutput} from '../integrations/chatgpt-openclaw/project-execution-command.mjs';
import {privateExecutionPath} from '../integrations/chatgpt-openclaw/project-execution-store.mjs';
const exec=promisify(execFile),CLI=join(homedir(),'.openclaw/bin/openclaw');
const VERIFICATION='/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos/verification';
const CHAT='https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/6ae25a0b-9b38-83ec-b2df-9db1f40f9488';
const PLUGINS='https://chatgpt.com/plugins';
export function testMarker(text){
 if(typeof text!=='string'||text.length>10000||/sk-(?:proj-|[A-Za-z0-9]{12})/.test(text))throw Error('bounded_noncredential_test_message_required');
 const m=text.match(/^MCP_GENERIC_WEB_ACCEPTANCE_[A-F0-9]{16}\b/);
 if(!m)throw Error('test_message_marker_required');return m[0];
}
export function exactTestTab(tabs,kind){
 const matches=tabs.filter(t=>kind==='chat'?t.url===CHAT:kind==='plugins'&&
  (t.url===PLUGINS||t.url.startsWith(PLUGINS+'/')));
 if(matches.length!==1||typeof matches[0].targetId!=='string'||!/^[A-Fa-f0-9]{16,64}$/.test(matches[0].targetId))throw Error('unique_exact_test_tab_required');
 return matches[0].targetId;
}
async function browser(args){
 let stdout;
 try{({stdout}=await exec(CLI,['browser','--browser-profile','chrome','--json',...args],
  {env:executionEnvironment(),timeout:40000,maxBuffer:2097152}));}
 catch(e){
  const raw=String(e.stderr??'');
  const diagnostic={command:args[0],exitCode:e.code,timedOut:e.killed===true,
   signals:['timeout','ref','not found','navigation','context','permission','denied','ssrf','private network'].filter(s=>raw.toLowerCase().includes(s))};
  await writeFile(join(VERIFICATION,'web-acceptance-last-command-error.json'),JSON.stringify(diagnostic)+'\n',{mode:0o600});
  throw Error('browser_'+args[0]+'_command_failed');
 }
 try{return JSON.parse(stdout);}catch{
  await writeFile(join(VERIFICATION,'web-acceptance-last-command-error.json'),JSON.stringify({command:args[0],exitCode:0,nonJsonReply:true})+'\n',{mode:0o600});
  throw Error('browser_'+args[0]+'_non_json_reply');
 }
}
async function target(kind){const r=await browser(['tabs']);return exactTestTab(r.tabs??r.result?.tabs??[],kind);}
async function snapshot(kind){
 const id=await target(kind),raw=await browser(['snapshot','--target-id',id,'--interactive','--limit','120']);
 return {id,snapshot:raw.snapshot??raw.result?.snapshot??'',refs:raw.refs??raw.result?.refs??{}};
}
export function readComposerState(document){
 const visible=e=>e.getClientRects().length>0;
 const editors=[...document.querySelectorAll('#prompt-textarea, [role="textbox"][aria-label="Ask ChatGPT"]')].filter(visible);
 return {composerCount:editors.length,composerText:editors[0]?('value' in editors[0]?editors[0].value:editors[0].innerText??''):'',
  streaming:[...document.querySelectorAll('[data-testid="stop-button"], button[aria-label="Stop"]')].some(visible)};
}
export function emptyIdleComposer(data){
 // The current empty contenteditable contains one structural newline.
 // Preserve spaces and any nonempty user draft instead of treating them as disposable.
 return data.composerCount===1&&/^[\r\n]*$/.test(data.composerText)&&!data.streaming;
}
export function sameTestDraft(actual,expected){
 // Browser Relay types paragraphs; contenteditable innerText adds layout newlines.
 const normalize=s=>s.replace(/\r\n?/g,'\n').replace(/\n+/g,'\n').trim();
 return normalize(actual)===normalize(expected);
}
const DOM_READ=`() => {
 const composer=(${readComposerState.toString()})(document);
 const users=[...document.querySelectorAll('[data-message-author-role="user"], .bg-user-message')].filter(e=>e.getClientRects().length>0);
 const assistants=[...document.querySelectorAll('[data-message-author-role="assistant"]')];
 return {url:location.href,...composer,
  pageTail:(document.body.innerText??'').slice(-9000),
  userMarkers:users.map(x=>(x.innerText??'').match(/^MCP_GENERIC_WEB_ACCEPTANCE_[A-F0-9]{16}\\b/)?.[0]).filter(Boolean),
  assistantTail:assistants.slice(-2).map(x=>x.innerText??'').join('\\n').slice(-12000)};
}`;
async function readChat(){
 const id=await target('chat'),raw=await browser(['evaluate','--target-id',id,'--fn',DOM_READ]);
 const data=raw.result??raw.value??raw;
 if(data.url!==CHAT||!Number.isInteger(data.composerCount))throw Error('exact_chat_dom_read_unverified');return data;
}
export function allowedTestClick(row,kind){
 return row&&['button','link'].includes(row.role)&&typeof row.name==='string'&&
  (kind==='plugins'?/^(OpenClaw Mac|OpenClaw Mac No description|Manage|Refresh|Refresh tools|View details|Tools)$/.test(row.name):
   /^(Allow once|See details|OpenClaw Mac)$/.test(row.name));
}
export async function webAcceptance(args){
 const [action,kind,value]=args;
 if(!['chat','plugins'].includes(kind))throw Error('exact_test_surface_required');
 if(action==='open'&&kind==='chat'&&args.length===3){
  if(!/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(value))throw Error('web_open_operation_required');
  const journal=join(VERIFICATION,'web-open-'+value+'.json');
  try{return {...JSON.parse(await readFile(journal,'utf8')),cached:true,doNotRepeat:true};}catch(e){if(e.code!=='ENOENT')throw e;}
  const before=await browser(['tabs']),existing=(before.tabs??[]).filter(t=>t.url===CHAT);
  if(existing.length>1)throw Error('unique_exact_test_tab_required');
  if(existing.length===1)return {state:'already_open',targetId:exactTestTab(existing,'chat'),owned:false};
  await writeFile(journal,JSON.stringify({state:'open_intent',doNotRepeat:true})+'\n',{mode:0o600,flag:'wx'});
  await browser(['open',CHAT]);
  const after=await browser(['tabs']),id=exactTestTab(after.tabs??[],'chat');
  const result={state:'opened',targetId:id,owned:true,doNotRepeat:true};
  await writeFile(journal,JSON.stringify(result)+'\n',{mode:0o600});
  await browser(['focus',id]);return result;
 }
 if(action==='inspect'&&args.length===2){
  const s=await snapshot(kind),data=kind==='chat'?await readChat():{};
  return {state:'observed',kind,controls:Object.entries(s.refs).slice(0,130).map(([ref,row])=>({ref,role:row.role,name:redactExecutionOutput(row.name??'')})),
   ...(kind==='chat'?{composerCount:data.composerCount,composerEmpty:emptyIdleComposer(data),composerLength:data.composerText.length,streaming:data.streaming,
    userMarkers:data.userMarkers,assistantTail:redactExecutionOutput(data.assistantTail),pageTail:redactExecutionOutput(data.pageTail)}:{})};
 }
 if(action==='click'&&args.length===3){
  const s=await snapshot(kind);
  if(!/^e[0-9]+$/.test(value)||!allowedTestClick(s.refs[value],kind))throw Error('test_ui_target_not_allowlisted');
  // Only observed, allowlisted UI controls on the exact requested surface.
  await browser(['click','--target-id',s.id,value]);return {state:'clicked',kind,target:s.refs[value].name};
 }
 if(action!=='send'||kind!=='chat'||args.length!==3||dirname(value)!==VERIFICATION)throw Error('invalid_web_test_action');
 const st=await privateExecutionPath(value);if(st.size>16000)throw Error('test_message_too_large');
 const message=await readFile(value,'utf8'),marker=testMarker(message),journal=join(VERIFICATION,marker+'.json');
 const before=await readChat();
 let prior;try{prior=JSON.parse(await readFile(journal,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(before.userMarkers.includes(marker))return {state:'already_sent',marker,noAutomaticResend:true,userReceiptConfirmed:true};
 if(prior&&(prior.phase!=='typing_intent'||prior.marker!==marker))throw Error('send_intent_already_recorded');
 if(prior?before.composerCount!==1||before.streaming||!sameTestDraft(before.composerText,message):!emptyIdleComposer(before))throw Error('empty_idle_composer_required');
 if(!prior)await writeFile(journal,JSON.stringify({phase:'typing_intent',marker})+'\n',{mode:0o600,flag:'wx'});
 const save=async phase=>{const temp=journal+'.tmp';await writeFile(temp,JSON.stringify({phase,marker})+'\n',{mode:0o600});await rename(temp,journal);};
 const s=await snapshot('chat'),rows=Object.entries(s.refs).filter(([,r])=>r.role==='textbox'&&/Ask anything|Message|ChatGPT/i.test(r.name??''));
 if(rows.length!==1)throw Error('unique_composer_reference_required');
 if(!prior)await browser(['type','--target-id',s.id,rows[0][0],message]);
 const draft=await readChat();if(draft.composerCount!==1||draft.streaming||!sameTestDraft(draft.composerText,message))throw Error('exact_test_draft_unverified');
 await save('send_intent');await browser(['press','--target-id',s.id,'Enter']);
 const after=await readChat(),confirmed=after.userMarkers.filter(m=>m===marker).length===1;
 if(confirmed)await save('user_receipt_confirmed');
 return {state:confirmed?'sent':'inconclusive',marker,noAutomaticResend:true,userReceiptConfirmed:confirmed};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await webAcceptance(process.argv.slice(2))));}
 catch(e){console.log(JSON.stringify({state:'blocked',reason:/^[a-z_]+$/.test(e.message)?e.message:'web_test_requires_review',noAutomaticResend:true}));process.exitCode=1;}
}
