import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const CHAT='https://chatgpt.com/c/6adb7dca-1214-83ec-b210-42efe8f2042e';
const MOCK=String.raw`#!/usr/bin/env node
import {readFileSync,writeFileSync} from 'node:fs';
const args=process.argv.slice(2);
const store=process.env.MOCK_BROWSER_STATE;
const s=JSON.parse(readFileSync(store,'utf8'));
const save=()=>writeFileSync(store,JSON.stringify(s));
const has=(k)=>args.includes(k);
if(has('tabs')){console.log(JSON.stringify({tabs:[{url:s.url,suggestedTargetId:'t1'}]}));}
else if(has('evaluate')){
 const page={url:s.url,selectorFound:s.messages.length>0,generating:false,messages:s.messages,users:s.users,composerPresent:true,composerEmpty:!s.composer};
 console.log(JSON.stringify({result:{type:'string',value:'IOANT_MAC_LOOP_RESULT::'+JSON.stringify(page)}}));
}
else if(has('snapshot')) console.log('- textbox "Message ChatGPT" [ref=e42]');
else if(has('type')){s.composer=args.at(-1);save();}
else if(has('press')){
 s.users.push(s.composer);
 if(s.composer.includes('Ioant Mac local command feedback protocol')){
   s.messages.push({codes:[JSON.stringify({protocol:'ioant-mac-ops-v1',id:'sample-1001',action:'project-head'})]});
 }
 s.composer='';save();
}
else {process.stderr.write('Unknown mock operation '+args.join(' '));process.exit(2)}
`;

test('loop observes one ChatGPT assistant instruction, executes once, reports, then waits',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'chatgpt-loop-test-'));
  const home=join(temp,'home');await mkdir(home);
  const volume=join(temp,'LunaDrive');
  const expectedCache=join(volume,'DeveloperCache','projects','ioant-loop-test');
  await mkdir(expectedCache,{recursive:true});
  const filename=join(temp,'mock-browser.mjs');
  const stateFile=join(temp,'browser.json');
  await writeFile(filename,MOCK,{mode:0o700});
  await writeFile(stateFile,JSON.stringify({url:CHAT,users:[],messages:[],composer:''}));
  const child=spawn(process.execPath,['stage2/chatgpt-loop.mjs','--chat-url',CHAT,'--initialize','--watch','--interval','10'],{
    cwd:new URL('../',import.meta.url).pathname,
    env:{...process.env,HOME:home,IOANT_OPENCLAW_BIN:filename,MOCK_BROWSER_STATE:stateFile,PROJECT_DEV_CACHE:expectedCache,IOANT_DEV_VOLUME:volume},
    stdio:['ignore','pipe','pipe']
  });
  let stdout='',stderr=''; child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
  try{
    const deadline=Date.now()+17000;
    while(Date.now()<deadline){
      const browser=JSON.parse(await readFile(stateFile,'utf8'));
      if(browser.users.some(s=>s.includes('[IOANT-MAC-OPS RESULT sample-1001]')))break;
      if(child.exitCode!==null)break;
      await new Promise(r=>setTimeout(r,250));
    }
    const browser=JSON.parse(await readFile(stateFile,'utf8'));
    assert.equal(browser.users.filter(s=>s.includes('[IOANT-MAC-OPS RESULT sample-1001]')).length,1,JSON.stringify({stdout,stderr}).slice(0,1500));
    assert.equal(browser.users.filter(s=>s.includes('Ioant Mac local command feedback protocol')).length,1);
    assert.match(browser.users.at(-1),/Status: (passed|failed)/);
    assert.doesNotMatch(stderr,/Unhandled|TypeError|SyntaxError/);
  }finally{
    child.kill('SIGTERM');
    await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.on('close',resolve);setTimeout(resolve,3000)});
    if(child.exitCode===null)child.kill('SIGKILL');
    await rm(temp,{recursive:true,force:true});

  }
}, {timeout:23000});
