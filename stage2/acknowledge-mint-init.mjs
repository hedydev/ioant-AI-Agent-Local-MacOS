#!/usr/bin/env node
// Explicit operator confirmation for a delivered Mint init when the chat DOM
// cannot prove its presence. NO browser write, SSH, task or BDS operation.
import { readFile,writeFile,rename,unlink,lstat } from 'node:fs/promises';
import { resolve,join,sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { validateChatUrl,chatKey } from './protocol.mjs';
import { acquireConversationLock } from './conversation-lock.mjs';

const CONFIRM='ACKNOWLEDGE MINT INIT';
function assertOwnedPrivate(st,kind){
 if(st.isSymbolicLink() || (kind==='file'?!st.isFile():!st.isDirectory()) ||
    (st.mode&0o077)!==0 || (typeof process.getuid==='function'&&st.uid!==process.getuid()))
  throw Error('Unsafe private conversation state; no changes made');
}
export async function acknowledgeMintInit({chatUrl,cache,volume,operatorConfirmation}){
 const url=validateChatUrl(chatUrl);
 const base=resolve(cache||'');
 const devVolume=resolve(volume||'');
 if(!cache||!volume||!base.startsWith(devVolume+sep+'DeveloperCache'+sep))
   throw Error('Expected private LunaDrive project cache; no state modified');
 if(operatorConfirmation!==CONFIRM)throw Error('Explicit operator confirmation required; state unchanged');
 const workDir=join(base,'chatgpt-loop',chatKey(url));
 assertOwnedPrivate(await lstat(workDir),'dir');
 const unlock=await acquireConversationLock(workDir);
 try{
  const file=join(workDir,'state.json');
  const original=await lstat(file);assertOwnedPrivate(original,'file');
  if(original.size<10||original.size>65536)throw Error('Private state size is invalid');
  const state=JSON.parse(await readFile(file,'utf8'));
  if(state.initPending!=='mint'||state.mintInitSent===true||state.feedbackPending)
    throw Error('No eligible uncertain Mint initialization; no changes made');
  // No task IDs or one-shot claims are touched. Mark ONLY mint init as
  // operator-acknowledged; never describe this as DOM-verified.
  state.mintInitSent=true;
  state.initPending=null;
  state.mintInitOperatorAcknowledgedAt=new Date().toISOString();
  const temp=file+'.'+randomUUID()+'.tmp';
  try{
   await writeFile(temp,JSON.stringify(state,null,2)+'\n',{mode:0o600,flag:'wx'});
   await rename(temp,file);
  }catch(error){
   try{await unlink(temp)}catch{}
   throw error;
  }
  return {status:'operator_acknowledged',init:'mint',browserReceiptVerified:false,taskExecuted:false};
 }finally{
  await unlock();
 }
}
async function main(){
 const args=process.argv.slice(2);
 if(args.length!==2||args[0]!=='--chat-url')throw Error('Usage: node stage2/acknowledge-mint-init.mjs --chat-url EXACT_CHAT_URL');
 const url=validateChatUrl(args[1]);
 if(!process.stdin.isTTY||!process.stdout.isTTY)
   throw Error('Interactive local Mac terminal required for operator-only acknowledgement');
 console.log('[ack] Exact conversation: '+url);
 console.log('[ack] Confirm ONLY if the Ioant Mac Mint read-only diagnostics initialization appears as YOUR user message in this chat.');
 console.log('[ack] This does NOT verify it through the browser, resend a message, execute a task or allow BDS changes.');
 const rl=createInterface({input:process.stdin,output:process.stdout});
 let answer;
 try{answer=await rl.question('[ack] Type '+CONFIRM+' to continue: ')}
 finally{rl.close()}
 const result=await acknowledgeMintInit({chatUrl:url,
  cache:process.env.PROJECT_DEV_CACHE,volume:process.env.IOANT_DEV_VOLUME,
  operatorConfirmation:answer});
 console.log('[ack] '+JSON.stringify(result));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(e=>{console.error('[ack] STOP: '+e.message);process.exitCode=1});
}
