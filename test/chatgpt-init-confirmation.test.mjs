import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {chatKey} from '../stage2/protocol.mjs';

const ROOT=resolve(import.meta.dirname,'..');
const CHAT='https://chatgpt.com/c/6adb7dca-1214-83ec-b210-42efe8f2042e';
const INIT='Ioant Mac Alice witness workflow ioant-mac-ops-v1';
const MOCK=String.raw`#!/usr/bin/env node
import {readFileSync,writeFileSync} from 'node:fs';
const args=process.argv.slice(2);
const file=process.env.MOCK_BROWSER_STATE;
const s=JSON.parse(readFileSync(file,'utf8'));
const save=()=>writeFileSync(file,JSON.stringify(s));
const has=(x)=>args.includes(x);
if(has('tabs'))console.log(JSON.stringify({tabs:[{url:s.url,suggestedTargetId:'t1'}]}));
else if(has('evaluate')){
  if(s.pending&&s.delayed){
    s.readAfterPress=(s.readAfterPress||0)+1;
    if(s.readAfterPress>=4){
      s.users.push(s.pending);s.pending='';s.composer='';save();
    }else save();
  }
  const users=s.users.map(x=>x.startsWith('Ioant Mac')?x.split('\n')[0]:x);
  console.log(JSON.stringify({result:{type:'string',value:'IOANT_MAC_LOOP_RESULT::'+JSON.stringify({
    url:s.url,generating:false,selectorFound:false,composerPresent:true,composerEmpty:!s.composer,
    messages:[],users
  })}}));
}
else if(has('snapshot'))console.log('- textbox "Message ChatGPT" [ref=e42]');
else if(has('type')){s.composer=args.at(-1);s.types++;save();}
else if(has('press')){
  s.presses++;
  if(s.delayed){s.pending=s.composer;}
  else {s.users.push(s.composer);s.composer='';}
  save();
}
else process.exit(11);
`;
async function fixture(run){
 const home=await mkdtemp(join(tmpdir(),'ioant-init-reconcile-'));
 const volume=join(home,'LunaDrive');
 const cache=join(volume,'DeveloperCache','projects','test-init');
 const workspace=join(cache,'chatgpt-loop',chatKey(CHAT));
 await mkdir(workspace,{recursive:true});
 const browser=join(home,'mock-browser.mjs');
 const page=join(home,'page.json');
 await writeFile(browser,MOCK,{mode:0o700});
 const original={url:CHAT,users:[],messages:[],composer:'',types:0,presses:0,delayed:false,pending:''};
 await writeFile(page,JSON.stringify(original));
 try{
  return await run({home,volume,cache,workspace,page,browser,original});
 }finally{await rm(home,{recursive:true,force:true});}
}
function cli(f){
 return {cwd:ROOT,env:{...process.env,HOME:f.home,PROJECT_DEV_CACHE:f.cache,IOANT_DEV_VOLUME:f.volume,MOCK_BROWSER_STATE:f.page,IOANT_OPENCLAW_BIN:f.browser,IOANT_LOOP_LOG_FILE:'',ALICE_SSH_TARGET:'mockalice@127.0.0.1'}};
}
test('Alice initialization mock always supplies a synthetic SSH target; no live Mint host',async()=>fixture(async f=>{
 const configuration=cli(f);
 assert.equal(configuration.env.ALICE_SSH_TARGET,'mockalice@127.0.0.1');
 assert.equal(configuration.env.MOCK_BROWSER_STATE,f.page);
 assert.equal(configuration.env.IOANT_OPENCLAW_BIN,f.browser);
}));

async function spawnedUntil(f,needle){
 const child=spawn(process.execPath,['stage2/chatgpt-loop.mjs','--chat-url',CHAT,'--initialize','--enable-alice-preflight','--watch','--interval','10'],{...cli(f),stdio:['ignore','pipe','pipe']});
 let output='',err='';
 child.stdout.on('data',b=>output+=b);
 child.stderr.on('data',b=>err+=b);
 const deadline=Date.now()+15000;
 try{
  while(Date.now()<deadline){
   if(output.includes(needle)||child.exitCode!==null)break;
   await new Promise(ok=>setTimeout(ok,180));
  }
  return {output,err,exit:child.exitCode};
 }finally{
  if(child.exitCode===null){
   child.kill('SIGTERM');
   await new Promise(ok=>{child.once('close',ok);setTimeout(ok,2500)});
   if(child.exitCode===null)child.kill('SIGKILL');
  }
 }
}
test('delayed ChatGPT DOM receipt is confirmed after Enter, never submitted twice',async()=>fixture(async f=>{
 const s={...f.original,delayed:true};
 await writeFile(f.page,JSON.stringify(s));
 const run=await spawnedUntil(f,'alice initialization confirmed');
 assert.match(run.output,/alice initialization confirmed/,run.err);
 const state=JSON.parse(await readFile(join(f.workspace,'state.json'),'utf8'));
 const page=JSON.parse(await readFile(f.page,'utf8'));
 assert.equal(page.presses,1);
 assert.equal(page.types,1);
 assert.equal(state.aliceInitSent,true);
 assert.equal(state.initPending,null);
 assert.equal(page.users.length,1);
 assert.equal(page.readAfterPress,4);
}));

test('after uncertain send, existing user-role receipt reconciles without another Enter',async()=>fixture(async f=>{
 await writeFile(join(f.workspace,'state.json'),JSON.stringify({lastTaskId:null,feedbackPending:null,initSent:false,aliceInitSent:false,initPending:'alice'}),{mode:0o600});
 await writeFile(f.page,JSON.stringify({...f.original,users:[INIT+'\nAlready replied by assistant']}));
 const run=await spawnedUntil(f,'Previous initialization found in ChatGPT user messages');
 assert.match(run.output,/Previous initialization found in ChatGPT user messages/,run.err);
 const state=JSON.parse(await readFile(join(f.workspace,'state.json'),'utf8'));
 const page=JSON.parse(await readFile(f.page,'utf8'));
 assert.equal(page.presses,0);
 assert.equal(page.types,0);
 assert.equal(state.initPending,null);
 assert.equal(state.aliceInitSent,true);
}));

test('ambiguous pending initialization without proof must fail closed, never resend',async()=>fixture(async f=>{
 await writeFile(join(f.workspace,'state.json'),JSON.stringify({lastTaskId:null,feedbackPending:null,initSent:false,aliceInitSent:false,initPending:'alice'}),{mode:0o600});
 // Eight bounded receipt reads now span ~10.5s; the 9s legacy limit
 // interrupted the child before its fail-closed path could finish.
 // Keep the production retry bound unchanged; only widen test deadline.
 const run=spawnSync(process.execPath,['stage2/chatgpt-loop.mjs','--chat-url',CHAT,'--initialize','--enable-alice-preflight','--watch'],{...cli(f),encoding:'utf8',timeout:30000});
 assert.equal(run.error,undefined,'The fixture process must finish before its test deadline');
 assert.equal(run.signal,null,'The process must exit via its fail-closed error, not timeout');
 assert.equal(run.status,1,run.stdout);
 assert.match(run.stderr,/Previous initialization send remains unconfirmed/);
 const page=JSON.parse(await readFile(f.page,'utf8'));
 const state=JSON.parse(await readFile(join(f.workspace,'state.json'),'utf8'));
 assert.equal(page.presses,0);
 assert.equal(page.types,0);
 assert.equal(state.initPending,'alice');
}));

test('direct DOM snapshot extracts only known user-role receipts, not message bodies',async()=>{
 const loop=await readFile(resolve(ROOT,'stage2/chatgpt-loop.mjs'),'utf8');
 assert.match(loop,/\.slice\(-100\)/);
 assert.match(loop,/\.trimStart\(\)/);
 assert.match(loop,/Ioant Mac Alice witness workflow/);
 assert.match(loop,/if\(match\)return match\[1\]/);
 assert.doesNotMatch(loop,/slice\(-5\)\s*\n\s*\.map\(el=>\(el\.innerText/);
 const tick=String.fromCharCode(96);
 const start=loop.indexOf('const readPageFunction='+tick);
 const end=loop.indexOf(tick+';\n\nfunction argsOf',start);
 assert.ok(start>=0&&end>start);
 const js=Function('MARKER',loop.slice(start,end+2)+';return readPageFunction;')('IOANT_MAC_LOOP_RESULT::');
 const read=Function('document','location','return ('+js+')()');
 const contents=[
  'Normal user content should not be logged: password=supersecret',
  INIT+' Additional text that is private',
  '[IOANT-MAC-OPS RESULT alice-sample-123] private command output',
  'A quoted '+INIT+' is not a receipt'
 ];
 const document={
  readyState:'complete',
  querySelectorAll:q=>q==='[data-message-author-role="user"]'?contents.map(innerText=>({innerText})):[],
  querySelector:q=>q==='#prompt-textarea'?{matches:()=>false,innerText:'',textContent:''}:q==='main'?{}:null
 };
 const raw=read(document,{href:CHAT});
 const parsed=JSON.parse(raw.slice('IOANT_MAC_LOOP_RESULT::'.length));
 assert.deepEqual(parsed.users,[INIT,'[IOANT-MAC-OPS RESULT alice-sample-123]']);
 assert.doesNotMatch(JSON.stringify(parsed),/supersecret|private command output/);
});


const MINT_INIT='Ioant Mac Mint read-only diagnostics ioant-mac-ops-v1';
test('nested user-role body recognizes Mint receipt without returning private contents or quoted text',async()=>{
 const loop=await readFile(resolve(ROOT,'stage2/chatgpt-loop.mjs'),'utf8');
 const tick=String.fromCharCode(96);
 const start=loop.indexOf('const readPageFunction='+tick);
 const end=loop.indexOf(tick+';\n\nfunction argsOf',start);
 assert.ok(start>=0&&end>start);
 const fn=Function('MARKER',loop.slice(start,end+2)+';return readPageFunction;')('IOANT_MAC_LOOP_RESULT::');
 const read=Function('document','location','return ('+fn+')()');
 const entries=[
  {innerText:'You said:\n'+MINT_INIT,querySelector:q=>q==='[data-message-content]'?{innerText:MINT_INIT+' payload secret',textContent:MINT_INIT+' payload secret'}:null},
  {innerText:'Quoted '+MINT_INIT,querySelector:()=>null},
  {innerText:'Unrelated password=private',querySelector:()=>null}
 ];
 const document={
  readyState:'complete',
  querySelectorAll:q=>q==='[data-message-author-role="user"]'?entries:[],
  querySelector:q=>q==='#prompt-textarea'?{matches:()=>false,innerText:'',textContent:''}:q==='main'?{}:null
 };
 const raw=read(document,{href:CHAT});
 const parsed=JSON.parse(raw.slice('IOANT_MAC_LOOP_RESULT::'.length));
 assert.deepEqual(parsed.users,[MINT_INIT]);
 assert.doesNotMatch(JSON.stringify(parsed),/payload secret|password=private|Quoted/);
});

test('Mint pending initialization is reconciled after delayed DOM hydration with zero repeated sends',async()=>fixture(async f=>{
 const state={lastTaskId:null,feedbackPending:null,initSent:false,mintInitSent:false,initPending:'mint'};
 await writeFile(join(f.workspace,'state.json'),JSON.stringify(state),{mode:0o600});
 await writeFile(f.page,JSON.stringify({...f.original,pending:MINT_INIT,delayed:true}));
 const child=spawn(process.execPath,['stage2/chatgpt-loop.mjs','--chat-url',CHAT,'--initialize','--enable-mint-diagnostics','--watch','--interval','10'],{...cli(f),stdio:['ignore','pipe','pipe']});
 let output='',err='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>err+=d);
 try{
  const deadline=Date.now()+12000;
  while(Date.now()<deadline&&!output.includes('Previous initialization found in ChatGPT user messages')&&child.exitCode===null)
   await new Promise(ok=>setTimeout(ok,120));
  assert.match(output,/Previous initialization found in ChatGPT user messages/,err);
  const page=JSON.parse(await readFile(f.page,'utf8'));
  const stateNext=JSON.parse(await readFile(join(f.workspace,'state.json'),'utf8'));
  assert.equal(page.presses,0);
  assert.equal(page.types,0);
  assert.equal(stateNext.initPending,null);
  assert.equal(stateNext.mintInitSent,true);
  assert.ok(page.readAfterPress>=4);
 }finally{
  if(child.exitCode===null){
    child.kill('SIGTERM');
    await new Promise(ok=>{child.once('close',ok);setTimeout(ok,2500)});
    if(child.exitCode===null)child.kill('SIGKILL');
  }
 }
}));


test('receipt evidence consists only of counters and booleans when message not visible',async()=>{
 const loop=await readFile(resolve(ROOT,'stage2/chatgpt-loop.mjs'),'utf8');
 const tick=String.fromCharCode(96);
 const start=loop.indexOf('const readPageFunction='+tick),end=loop.indexOf(tick+';\n\nfunction argsOf',start);
 const fn=Function('MARKER',loop.slice(start,end+2)+';return readPageFunction;')('IOANT_MAC_LOOP_RESULT::');
 const run=Function('document','location','return ('+fn+')()');
 const secret='do not export my private content';
 const entries=[{innerText:secret,textContent:secret,querySelector:()=>null}];
 const doc={
  readyState:'complete',
  querySelectorAll:q=>q==='[data-message-author-role="user"]'?entries:[],
  querySelector:q=>q==='#prompt-textarea'?{matches:()=>false,innerText:'',textContent:''}:null
 };
 const parsed=JSON.parse(run(doc,{href:CHAT}).slice('IOANT_MAC_LOOP_RESULT::'.length));
 assert.deepEqual(parsed.receiptEvidence,{userRoleNodes:1,bodyNodes:0,mintPhrasePresent:false,mintReceiptRecognized:false});
 assert.doesNotMatch(JSON.stringify(parsed),/private content/);
});
