import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {acknowledgeMintInit} from '../stage2/acknowledge-mint-init.mjs';
import {chatKey} from '../stage2/protocol.mjs';

const URL='https://chatgpt.com/g/g-p-test/c/6adbf632-37f0-83ec-b4b1-86931b5d3aec';
async function fixture(body){
 const home=await mkdtemp(join(tmpdir(),'ioant-init-ack-'));
 const volume=join(home,'LunaDrive');
 const cache=join(volume,'DeveloperCache','projects','ioant-ai-agent-local-macos');
 const workDir=join(cache,'chatgpt-loop',chatKey(URL));
 await mkdir(workDir,{mode:0o700,recursive:true});
 const file=join(workDir,'state.json');
 const original={initPending:'mint',mintInitSent:false,feedbackPending:null,lastTaskId:'prior-task',labProbeAttempted:{id:'protected-one-shot'}};
 await writeFile(file,JSON.stringify(original),{mode:0o600});
 try{await body({file,cache,volume,original,workDir})}
 finally{await rm(home,{recursive:true,force:true})}
}
const call=f=>({chatUrl:URL,cache:f.cache,volume:f.volume,operatorConfirmation:'ACKNOWLEDGE MINT INIT'});
test('explicit operator Mint ack changes only pending init, preserving task and lab barriers',()=>fixture(async f=>{
 const result=await acknowledgeMintInit(call(f));
 assert.equal(result.browserReceiptVerified,false);
 assert.equal(result.taskExecuted,false);
 const after=JSON.parse(await readFile(f.file,'utf8'));
 assert.equal(after.initPending,null);
 assert.equal(after.mintInitSent,true);
 assert.deepEqual(after.labProbeAttempted,f.original.labProbeAttempted);
 assert.equal(after.lastTaskId,f.original.lastTaskId);
 assert.ok(after.mintInitOperatorAcknowledgedAt);
}));
test('incorrect confirmation is rejected without state change',()=>fixture(async f=>{
 await assert.rejects(acknowledgeMintInit({...call(f),operatorConfirmation:'YES'}),/Explicit operator/);
 assert.deepEqual(JSON.parse(await readFile(f.file,'utf8')),f.original);
}));
test('wrong chat URL or nonpending state cannot be acknowledged',()=>fixture(async f=>{
 await assert.rejects(acknowledgeMintInit({...call(f),chatUrl:'https://chatgpt.com/c/different-chat-0001'}));
 assert.deepEqual(JSON.parse(await readFile(f.file,'utf8')),f.original);
 await writeFile(f.file,JSON.stringify({...f.original,initPending:null}),{mode:0o600});
 await assert.rejects(acknowledgeMintInit(call(f)),/No eligible/);
}));
test('no receipt ack while feedback send is pending',()=>fixture(async f=>{
 await writeFile(f.file,JSON.stringify({...f.original,feedbackPending:{id:'unknown',feedback:'unknown'}}),{mode:0o600});
 await assert.rejects(acknowledgeMintInit(call(f)),/No eligible/);
}));
test('ack refuses a live watcher lock, does not delete it',()=>fixture(async f=>{
 const lock=join(f.workDir,'watch.lock');
 await writeFile(lock,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString(),nonce:'live'})+'\n',{mode:0o600});
 await assert.rejects(acknowledgeMintInit(call(f)),/Another ChatGPT watcher/);
 assert.equal(JSON.parse(await readFile(f.file,'utf8')).initPending,'mint');
}));
test('reject symlink state file, no overwrite',()=>fixture(async f=>{
 const target=f.file+'.target';
 await writeFile(target,JSON.stringify(f.original),{mode:0o600});
 const {rename,symlink}=await import('node:fs/promises');
 await rename(f.file,f.file+'.saved');
 await symlink(target,f.file);
 await assert.rejects(acknowledgeMintInit(call(f)),/Unsafe private conversation state/);
}));
