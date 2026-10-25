#!/usr/bin/env node
// Single-shot read-only UI probe of ONE registered ChatGPT Project conversation.
// No browser navigation, typing, clicks, screenshots or Agent access.
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {observeProjectChatUi} from './project-chat-ui-observer.mjs';

const exec=promisify(execFile);
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const MANIFEST=join(ROOT,'config','chat-projects.json');
const BIN=join(homedir(),'.openclaw','bin','openclaw');
const reply=(state,reason)=>({audit:'IOANT_PROJECT_CHAT_UI_PROBE',
  schemaVersion:1,state,readOnly:true,...(reason?{reason}:{})});

async function main(argv){
 if(argv.length!==2||argv[0]!=='probe'||
    !/^[a-z][a-z0-9-]{2,60}$/.test(argv[1]))
   return reply('blocked','invalid_command');
 let manifest;
 try{
   const raw=await readFile(MANIFEST,'utf8');
   if(raw.length>16384)throw Error('oversized');
   manifest=JSON.parse(raw);
 }catch{return reply('blocked','project_registry_unavailable')}
 const browser=async(...args)=>{
   // Fixed Chrome extension profile: DO NOT create/attach other profiles.
   // Only the 'tabs' and single targeted 'evaluate' read APIs are allowed.
   if(!((args.length===2&&args[0]==='--json'&&args[1]==='tabs')||
       (args.length===6&&args[0]==='--json'&&args[1]==='evaluate'&&
        args[2]==='--target-id'&&args[4]==='--fn'&&
        typeof args[3]==='string'&&typeof args[5]==='string')))
     throw Error('unapproved_browser_command');
   const {stdout}=await exec(BIN,['browser','--browser-profile','chrome',...args],
     {timeout:45000,maxBuffer:1024*256});
   return stdout;
 };
 return observeProjectChatUi({manifest,projectKey:argv[1],browser});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await main(process.argv.slice(2))))}
 catch{console.log(JSON.stringify(reply('inconclusive','observer_unavailable')));process.exitCode=1}
}
export {main as probeRegisteredProjectChat};
