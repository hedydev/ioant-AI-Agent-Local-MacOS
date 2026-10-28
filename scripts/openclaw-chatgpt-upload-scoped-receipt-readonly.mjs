#!/usr/bin/env node
// One-shot read-only check of a previously sent synthetic attachment receipt.
// No retry of the file send, no clicks, no Enter, no navigation.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {realpath} from 'node:fs/promises';
import {exactTab} from './openclaw-chatgpt-fixture-upload.mjs';
import {buildScopedReceiptProbe,classifyScopedReceipt}
 from '../stage2/chatgpt-upload-scoped-receipt.mjs';

const exec=promisify(execFile),HOME=homedir();
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(HOME,'Library','Application Support','ioant-openclaw-ops','runtime');
const BIN=join(HOME,'.openclaw','bin','openclaw');
const audit={audit:'IOANT_SYNTHETIC_RECEIPT_SCOPE_READONLY',schemaVersion:1,
 readOnly:true,uploadTriggered:false,messageSent:false,
 screenshotTaken:false,rawChatReturned:false};
const call=async(args)=>{
 const {stdout}=await exec(BIN,['browser','--browser-profile','chrome',...args],
  {cwd:RUNTIME,shell:false,timeout:30000,maxBuffer:1048576});
 return stdout;
};
export async function inspect({invoke=call,allowedRuntime=async()=>process.platform==='darwin'&&
 ROOT===RUNTIME&&await realpath(RUNTIME)===RUNTIME}={}){
 try{
  if(!await allowedRuntime())return {...audit,state:'blocked',reason:'private_runtime_required'};
  const id=exactTab(JSON.parse(await invoke(['--json','tabs'])));
  const raw=await invoke(['--json','evaluate','--target-id',id,
   '--fn',buildScopedReceiptProbe()]);
  return {...audit,...classifyScopedReceipt(raw)};
 }catch{return {...audit,state:'inconclusive',reason:'scoped_readonly_probe_unavailable'}}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=process.argv.length===2?await inspect():
  {...audit,state:'blocked',reason:'unsupported_arguments'};
 console.log(JSON.stringify(result));
 if(result.state!=='confirmed')process.exitCode=1;
}
