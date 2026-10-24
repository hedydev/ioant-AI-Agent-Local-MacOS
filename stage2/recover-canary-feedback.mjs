#!/usr/bin/env node
// One-time, interactive recovery of *one known legacy canary feedback*.
// The operator supplied terminal proof that the old browser snapshot failed
// before browser type or Enter. Never rerun Git/test/task or clear state.
import {readFile,writeFile,rename,unlink,lstat} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {validateChatUrl,chatKey} from './protocol.mjs';
import {acquireConversationLock} from './conversation-lock.mjs';

const ID='self-update-20261024-canary-001';
const CONFIRM='SNAPSHOT FAILED BEFORE TYPE';
function privateOwned(st,kind){
 return !st.isSymbolicLink()&&(kind==='file'?st.isFile():st.isDirectory())&&
   (st.mode&0o077)===0&&(typeof process.getuid!=='function'||st.uid===process.getuid());
}
export async function recoverLegacyCanary({chatUrl,cache,volume,operatorConfirmation}){
 const url=validateChatUrl(chatUrl);
 if(operatorConfirmation!==CONFIRM)throw Error('Explicit operator confirmation required');
 if(!cache||!volume||!resolve(cache).startsWith(resolve(volume)+sep+'DeveloperCache'+sep))
   throw Error('Unsafe or missing LunaDrive work cache');
 const directory=join(resolve(cache),'chatgpt-loop',chatKey(url));
 if(!privateOwned(await lstat(directory),'dir'))throw Error('Unsafe conversation directory');
 const unlock=await acquireConversationLock(directory);
 try{
  const file=join(directory,'state.json'),stat=await lstat(file);
  if(!privateOwned(stat,'file')||stat.size>65536||stat.size<50)
    throw Error('Untrusted private state file');
  const state=JSON.parse(await readFile(file,'utf8'));
  const p=state.feedbackPending;
  if(!p||p.id!==ID||p.phase!==undefined||state.lastTaskId===ID||
     typeof p.feedback!=='string'||p.feedback.length>7000||
     !p.feedback.startsWith('[IOANT-MAC-OPS RESULT '+ID+']\nAction: project-update-verify\n')||
     !/\nStatus: (passed|failed|inconclusive)\n/.test(p.feedback))
    throw Error('No matching legacy canary feedback; no state modified');
  // Operator has established the old snapshot timed out *before any typing*.
  // This grant authorizes ONLY a safe attempt to send the stored feedback,
  // never re-executing project-update-verify. Worker will verify ChatGPT
  // user-role receipt and refuse nonempty composer before any type.
  p.phase='prepared';
  p.action='project-update-verify';
  p.reloadRequired=false; // The new worker will already be loaded on restart.
  state.legacyFeedbackOperatorRecoveredAt=new Date().toISOString();
  const temp=file+'.'+randomUUID()+'.tmp';
  try{
   await writeFile(temp,JSON.stringify(state,null,2)+'\n',{mode:0o600,flag:'wx'});
   await rename(temp,file);
  }catch(err){try{await unlink(temp)}catch{}throw err}
  return {state:'prepared_for_safe_feedback_only',taskId:ID,
   taskReexecuted:false,chatMessageSent:false,requiresUserRoleReceipt:true};
 }finally{await unlock()}
}
async function main(){
 const args=process.argv.slice(2);
 if(args.length!==2||args[0]!=='--chat-url')
  throw Error('Usage: node stage2/recover-canary-feedback.mjs --chat-url EXACT_CHAT_URL');
 if(!process.stdin.isTTY||!process.stdout.isTTY)throw Error('Interactive Mac operator required');
 const url=validateChatUrl(args[1]);
 console.log('[recovery] This is ONLY for '+ID);
 console.log('[recovery] Confirm that the prior OpenClaw STOP explicitly occurred on browser SNAPSHOT, BEFORE any type/press, and no result message for this task exists in the exact ChatGPT conversation.');
 console.log('[recovery] No task is reexecuted, Git updated, sudo invoked or message sent by this recovery script.');
 const rl=createInterface({input:process.stdin,output:process.stdout});
 let answer;
 try{answer=await rl.question('[recovery] Type '+CONFIRM+' to authorize re-sending stored feedback: ')}
 finally{rl.close()}
 const result=await recoverLegacyCanary({chatUrl:url,cache:process.env.PROJECT_DEV_CACHE,
  volume:process.env.IOANT_DEV_VOLUME,operatorConfirmation:answer});
 console.log('[recovery] '+JSON.stringify(result));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(e=>{console.error('[recovery] STOP: '+e.message);process.exitCode=1});
}
