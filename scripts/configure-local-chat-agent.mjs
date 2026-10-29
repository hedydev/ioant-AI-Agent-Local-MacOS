#!/usr/bin/env node
// Explicit, local-only chat provisioning. Never changes an existing Agent.
import {spawn,execFile} from 'node:child_process';
import {promisify,isDeepStrictEqual} from 'node:util';
import {readFile,writeFile,mkdir,lstat,realpath} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {readPrivateJson} from '../stage2/workflow-capabilities.mjs';

const CLI=join(homedir(),'.openclaw/bin/openclaw');
const CONFIG=join(homedir(),'.openclaw/openclaw.json');
const ROOT='/Volumes/LunaDrive/DeveloperCache/openclaw-agents';
export const CHAT={name:'本地聊天',description:'独立中文聊天与推理；本地模型，无电脑操作',
 workspace:join(ROOT,'local-chat'),model:{primary:'ollama/gpt-oss:20b',fallbacks:[]},
 modelPolicy:{allow:['ollama/gpt-oss:20b']},runtime:{type:'embedded'},
 thinkingDefault:'low',fastModeDefault:false,bootstrapMaxChars:2000,bootstrapTotalMaxChars:6000,
 tools:{profile:'minimal',deny:['*'],codeMode:false,exec:{mode:'deny'},
  fs:{workspaceOnly:true},elevated:{enabled:false},agentToAgent:{send:[]}},
 skills:[],subagents:{allowAgents:[]},heartbeat:{every:'0m'},
 memory:{search:{enabled:false}},params:{maxTokens:4096}};
export function chatPatch(c){
 if(c?.models?.providers?.ollama?.baseUrl!=='http://127.0.0.1:11435'||
  c.models.providers.ollama.api!=='ollama'||!c?.agents?.entries)throw Error('local_provider_required');
 if(Object.hasOwn(c.agents.entries,'local-chat'))throw Error('existing_agent_requires_review');
 if(Object.values(c.agents.entries).some(a=>a.workspace===CHAT.workspace))throw Error('workspace_in_use');
 return {agents:{entries:{'local-chat':structuredClone(CHAT)}}};
}
async function privateDir(path){
 const s=await lstat(path);
 if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||
  (s.mode&0o077)!==0||await realpath(path)!==path)throw Error('private_directory_required');
}
async function patch(p,flags=[]){
 return new Promise((ok,bad)=>{
  const ch=spawn(CLI,['config','patch','--stdin',...flags],{stdio:['pipe','pipe','pipe'],shell:false});
  ch.stdout.resume();ch.stderr.resume();ch.on('error',bad);
  ch.on('close',code=>code===0?ok():bad(Error('config_validation_or_write_failed')));
  ch.stdin.end(JSON.stringify(p));
 });
}
export function thinkingMetadataPatch(c){
 if(!isDeepStrictEqual(c?.agents?.entries?.['local-chat'],CHAT)||
  c?.models?.providers?.ollama?.baseUrl!=='http://127.0.0.1:11435')throw Error('chat_policy_required');
 const models=structuredClone(c.models.providers.ollama.models);
 const hits=models.filter(m=>m.id==='gpt-oss:20b');
 if(hits.length!==1)throw Error('unique_installed_model_required');
 hits[0].reasoning=true;
 hits[0].compat={...hits[0].compat,supportedReasoningEfforts:['low','medium','high']};
 return {models:{providers:{ollama:{models}}}};
}
async function enableThinking(){
 const before=await readPrivateJson(CONFIG),p=thinkingMetadataPatch(before);
 await patch(p,['--dry-run','--json']);
 const dir=join(homedir(),'.openclaw/backups','chat-thinking-'+randomUUID());
 await privateDir(join(homedir(),'.openclaw/backups'));await mkdir(dir,{mode:0o700});
 await writeFile(join(dir,'openclaw.json'),await readFile(CONFIG),{mode:0o600,flag:'wx'});
 if(!isDeepStrictEqual(await readPrivateJson(CONFIG),before))throw Error('prewrite_state_changed');
 await patch(p);
 const expected=structuredClone(before);expected.models.providers.ollama.models=p.models.providers.ollama.models;
 if(!isDeepStrictEqual(await readPrivateJson(CONFIG),expected))throw Error('metadata_readback_requires_review');
 return {agent:'local-chat',state:'applied',scope:'gpt_oss_capability_metadata_only',backupSaved:true};
}
export async function configureChat(mode){
 const out={agent:'local-chat',model:CHAT.model.primary};
 try{
  if(!['--dry-run','--apply','--enable-thinking'].includes(mode))throw Error('explicit_mode_required');
  if(['OPENCLAW_PROFILE','OPENCLAW_CONFIG_PATH','OPENCLAW_STATE_DIR'].some(k=>process.env[k]))
   throw Error('custom_profile_not_supported');
  if(mode==='--enable-thinking')return await enableThinking();
  const before=await readPrivateJson(CONFIG),p=chatPatch(before);
  await privateDir(ROOT);await patch(p,['--dry-run','--json']);
  if(mode==='--dry-run')return {...out,state:'validated'};
  const backups=join(homedir(),'.openclaw/backups');await privateDir(backups);
  const dir=join(backups,'local-chat-'+randomUUID());await mkdir(dir,{mode:0o700});
  await writeFile(join(dir,'openclaw.json'),await readFile(CONFIG),{mode:0o600,flag:'wx'});
  if(!isDeepStrictEqual(await readPrivateJson(CONFIG),before))throw Error('prewrite_state_changed');
  await mkdir(CHAT.workspace,{mode:0o700});await privateDir(CHAT.workspace);
  const files={
   'AGENTS.md':'# Local chat\n你是用户的独立中文聊天伙伴。自然、清晰、直接地交流，按问题需要给出深度；简单问题简短回答。认真核对计算和逻辑，承认不确定性，不编造事实、联网结果或操作完成。默认低思考强度，复杂任务可由用户切换。你使用本地 GPT-OSS，不是 ChatGPT，也没有联网、文件、终端或电脑控制工具。只依据本会话上下文，不引用其他项目或 Agent 的私有信息。不要展示内部思维链；提供结论和可核对的简洁解释。\n',
   'SOUL.md':'# Style\n友好坦诚，避免模板套话、无必要的长列表与反复确认。中文为默认语言。\n',
   'IDENTITY.md':'# Identity\nName: 本地聊天\nRole: local conversational assistant\n',
   'USER.md':'# User\n默认中文交流。其他偏好以本会话用户陈述为准。\n',
   'TOOLS.md':'# Tools\nNo tools are enabled.\n','HEARTBEAT.md':'# Heartbeat\nDisabled.\n'};
  for(const [name,text]of Object.entries(files))await writeFile(join(CHAT.workspace,name),text,{mode:0o600,flag:'wx'});
  await patch(p);
  const expected=structuredClone(before);expected.agents.entries['local-chat']=CHAT;
  if(!isDeepStrictEqual(await readPrivateJson(CONFIG),expected))throw Error('disk_readback_requires_review');
  const exec=promisify(execFile);
  const live=JSON.parse((await exec(CLI,['gateway','call','config.get','--json'],{timeout:20000,maxBuffer:2**20})).stdout);
  const layers=['resolved','parsed','config','sourceConfig'].map(k=>live[k]).filter(Boolean);
  if(!layers.length||layers.some(c=>!isDeepStrictEqual(c.agents?.entries?.['local-chat'],CHAT)))
   throw Error('live_readback_pending');
  return {...out,state:'applied',backupSaved:true,existingAgentsChanged:false,toolsEnabled:false};
 }catch(e){return {...out,state:'blocked',reason:/^[a-z_]+$/.test(e.message)?e.message:'configuration_requires_review'};}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const out=await configureChat(process.argv.length===3?process.argv[2]:'');console.log(JSON.stringify(out));
 if(!['validated','applied'].includes(out.state))process.exitCode=1;
}
