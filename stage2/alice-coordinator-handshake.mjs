#!/usr/bin/env node
// Private exactly-once AliceAI handshake mailbox. No Chrome writes outside
// the *same* registered coordinator's single-writer watcher.
import {readFile,lstat,realpath,writeFile,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {validateProjectRoutes} from './project-chat-routing.mjs';
import {chatKey} from './protocol.mjs';
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const NAME='alice-coordinator-handshake.json';
const ID='alice-coordinator-verify-20261027-103';
export const HANDSHAKE_RECEIPT='Ioant Mac AliceAI coordinator handshake ioant-mac-ops-v1 '+ID;
export const HANDSHAKE_MESSAGE=HANDSHAKE_RECEIPT+
 '\n这是一项已授权的 AliceAI 本地协调 Worker 只读闭环验收。无需改变 Minecraft、终端、仓库或模型配置。请在回复中只输出一个 JSON 代码块，字段依次为 protocol、id、action，值分别为 "ioant-mac-ops-v1"、"'+ID+'"、"openclaw-gui-readonly-probe"。收到 [IOANT-MAC-OPS RESULT '+ID+'] 后判断验收结果；请勿连续输出第二个任务。';
const versions=new Set(['requested','press_intent','confirmed']);
const isPrivateDir=s=>s.isDirectory()&&!s.isSymbolicLink()&&
 (s.mode&0o077)===0&&(typeof process.getuid!=='function'||s.uid===process.getuid());
const isPrivateFile=s=>s.isFile()&&!s.isSymbolicLink()&&
 (s.mode&0o077)===0&&(typeof process.getuid!=='function'||s.uid===process.getuid());
export function validateHandshakeRecord(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||
  Object.keys(value).sort().join(',')!=='conversationId,phase,projectKey,schemaVersion,taskId'||
  value.schemaVersion!==1||value.projectKey!=='alice-ai'||
  value.taskId!==ID||!versions.has(value.phase)||
  value.conversationId!=='6ade11a5-f0c0-83ec-add1-8a0cff00c938')
  throw Error('handshake_mailbox_invalid');
 return Object.freeze(value);
}
async function locate({cache=process.env.PROJECT_DEV_CACHE,volume=process.env.IOANT_DEV_VOLUME}={}){
 if(typeof cache!=='string'||typeof volume!=='string'||
  !resolve(cache).startsWith(resolve(volume)+'/DeveloperCache/projects/')||
  !resolve(volume).startsWith('/Volumes/'))throw Error('handshake_cache_unverified');
 const raw=await readFile(join(ROOT,'config','chat-projects.json'),'utf8');
 if(raw.length>16384)throw Error('handshake_manifest_unverified');
 const route=validateProjectRoutes(JSON.parse(raw)).find(x=>x.key==='alice-ai');
 if(!route||route.agentId!=='alice-ai'||route.repo!=='hedydev/ioant-AI-Minecraft-Alice'||
  route.conversationId!=='6ade11a5-f0c0-83ec-add1-8a0cff00c938')
  throw Error('handshake_route_unverified');
 const dir=join(cache,'chatgpt-loop',chatKey(route.chatUrl));
 const st=await lstat(dir);
 if(!isPrivateDir(st)||await realpath(dir)!==dir)
  throw Error('handshake_dir_unverified');
 return {path:join(dir,NAME),conversationId:route.conversationId};
}
export async function readHandshake(options){
 const {path}=await locate(options);
 try{
  const stat=await lstat(path);
  if(!isPrivateFile(stat)||stat.size>1024||await realpath(path)!==path)
   throw Error('handshake_mailbox_invalid');
  return validateHandshakeRecord(JSON.parse(await readFile(path,'utf8')));
 }catch(e){
  if(e.code==='ENOENT')return null;
  throw e;
 }
}
export async function requestHandshake(options){
 const {path,conversationId}=await locate(options);
 const row={schemaVersion:1,projectKey:'alice-ai',conversationId,taskId:ID,phase:'requested'};
 try{await writeFile(path,JSON.stringify(row)+'\n',{flag:'wx',mode:0o600})}
 catch(e){if(e.code==='EEXIST')throw Error('handshake_already_requested');throw e}
 return validateHandshakeRecord(row);
}
export async function transitionHandshake(from,to,options){
 if(!((from==='requested'&&to==='press_intent')||
   (from==='press_intent'&&to==='confirmed')))throw Error('invalid_handshake_transition');
 const current=await readHandshake(options);
 if(!current||current.phase!==from)throw Error('handshake_phase_changed');
 const {path}=await locate(options);
 const tmp=path+'.tmp-'+process.pid+'-'+randomBytes(6).toString('hex');
 try{
  await writeFile(tmp,JSON.stringify({...current,phase:to})+'\n',{mode:0o600,flag:'wx'});
  await rename(tmp,path);
 }catch(e){throw Error('handshake_transition_failed')}
 return {...current,phase:to};
}
async function cli(argv){
 if(argv.length!==1||!['request','status'].includes(argv[0]))
  return {audit:'IOANT_ALICE_COORDINATOR_HANDSHAKE',state:'blocked',reason:'invalid_command'};
 if(argv[0]==='request'){
  const record=await requestHandshake();
  return {audit:'IOANT_ALICE_COORDINATOR_HANDSHAKE',state:record.phase,taskId:record.taskId};
 }
 const record=await readHandshake();
 return {audit:'IOANT_ALICE_COORDINATOR_HANDSHAKE',state:record?.phase??'idle',
  ...(record?{taskId:record.taskId}:{})};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=await cli(process.argv.slice(2));console.log(JSON.stringify(result));
   if(result.state==='blocked')process.exitCode=1}
 catch(e){const known=new Set(['handshake_already_requested','handshake_mailbox_invalid',
  'handshake_cache_unverified','handshake_manifest_unverified',
  'handshake_route_unverified','handshake_dir_unverified']);
  console.log(JSON.stringify({audit:'IOANT_ALICE_COORDINATOR_HANDSHAKE',state:'blocked',
   reason:known.has(e.message)?e.message:'handshake_preflight_failed'}));process.exitCode=1}
}
