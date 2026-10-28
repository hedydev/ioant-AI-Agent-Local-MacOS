import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chatKey} from '../stage2/protocol.mjs';

const ROOT=resolve(import.meta.dirname,'..');
const CHAT='https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/6ae18e93-e2a0-83ec-aac9-88105079f208';
const CONVERSATION=CHAT.split('/').at(-1);
const MOCK="#!/usr/bin/env node\nimport {readFileSync,writeFileSync} from 'node:fs';\nconst path=process.env.MOCK_BROWSER_STATE;\nconst s=JSON.parse(readFileSync(path,'utf8'));\nconst args=process.argv.slice(2);\nconst save=()=>writeFileSync(path,JSON.stringify(s));\nif(args.includes('tabs')){\n console.log(JSON.stringify({tabs:[{url:s.url,suggestedTargetId:'fixture-tab'}]}));\n}else if(args.includes('evaluate')){\n const page={url:s.url,selectorFound:false,generating:false,messages:[],\n  users:s.users.map(x=>x.split('\\n')[0]),composerPresent:true,\n  composerEmpty:s.composer===''};\n console.log(JSON.stringify({result:{type:'string',\n  value:'IOANT_MAC_LOOP_RESULT::'+JSON.stringify(page)}}));\n}else if(args.includes('snapshot')){\n console.log('- textbox \"Message ChatGPT\" [ref=fixture-composer]');\n}else if(args.includes('type')){\n if(s.composer)process.exit(64);\n s.composer=args.at(-1);s.types++;save();\n}else if(args.includes('press')){\n if(!s.composer)process.exit(65);\n s.users.push(s.composer);s.composer='';s.presses++;save();\n}else{process.exit(66)}\n";
const delay=ms=>new Promise(r=>setTimeout(r,ms));

async function buildFixture(base){
 const home=join(base,'home'),vol=join(base,'LunaDrive');
 const cache=join(vol,'DeveloperCache','projects','guard-e2e');
 await mkdir(home,{recursive:true,mode:0o700});
 await mkdir(cache,{recursive:true,mode:0o700});
 const mock=join(base,'mock-browser.mjs'),browserState=join(base,'browser.json');
 await writeFile(mock,MOCK,{mode:0o700});
 await writeFile(browserState,JSON.stringify({url:CHAT,users:[],composer:'',
  presses:0,types:0}),{mode:0o600});
 const env={...process.env,HOME:home,IOANT_OPENCLAW_BIN:mock,
  IOANT_CHATGPT_BROWSER_PROFILE:'chrome',MOCK_BROWSER_STATE:browserState,
  IOANT_DEV_VOLUME:vol,PROJECT_DEV_CACHE:cache};
 delete env.IOANT_LOOP_LOG_FILE;
 // Render the exact installed plist with the same HOME as the isolated watcher.
 const renderer="import {renderPlist} from './stage2/ops-supervisor.mjs';"+
  "process.stdout.write(renderPlist('/opt/homebrew/bin',{chatUrl:process.env.MOCK_CHAT_URL}));";
 const plist=execFileSync(process.execPath,
  ['--input-type=module','--eval',renderer],
  {cwd:ROOT,env:{...env,MOCK_CHAT_URL:CHAT},encoding:'utf8',timeout:9000});
 const plistFolder=join(home,'Library','LaunchAgents');
 await mkdir(plistFolder,{recursive:true,mode:0o700});
 await writeFile(join(plistFolder,'com.ioant.openclaw.safe-watcher.plist'),
  plist,{mode:0o600});
 const guardDir=join(home,'Library','Application Support','ioant-openclaw-ops','guard');
 await mkdir(guardDir,{recursive:true,mode:0o700});
 const ticket={projectKey:'openclaw-workflow',conversationId:CONVERSATION,
  code:'watcher_stopped',observedAt:'2026-10-28T08:18:39.000Z',
  delivery:'queued',messageSent:false};
 ticket.key=createHash('sha256').update([ticket.projectKey,
  ticket.conversationId,ticket.code,ticket.observedAt.slice(0,10)]
  .join('|')).digest('hex').slice(0,24);
 await writeFile(join(guardDir,'incidents.jsonl'),
  JSON.stringify(ticket)+'\n',{mode:0o600});
 return {env,cache,browserState,ticket};
}

test('205B isolated mock Browser: Guard message sent to exact Chat, verified receipt, one Enter',async()=>{
 const base=await realpath(await mkdtemp(join(tmpdir(),'ioant-guard-e2e-')));
 let child,output='',error='';
 try{
  const fixture=await buildFixture(base);
  const statePath=join(fixture.cache,'chatgpt-loop',chatKey(CHAT),'state.json');
  child=spawn(process.execPath,
   ['stage2/chatgpt-loop.mjs','--chat-url',CHAT,'--watch','--interval','10'],
   {cwd:ROOT,env:fixture.env,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',d=>{output=(output+String(d)).slice(-15000)});
  child.stderr.on('data',d=>{error=(error+String(d)).slice(-12000)});
  let confirmed=false,browser=null,ledger=null;
  const deadline=Date.now()+26000;
  while(Date.now()<deadline){
   browser=JSON.parse(await readFile(fixture.browserState,'utf8'));
   try{ledger=JSON.parse(await readFile(statePath,'utf8'))}
   catch(e){if(e?.code!=='ENOENT')throw e}
   if(browser.presses===1&&
      ledger?.guardDeliveredKeys?.includes(fixture.ticket.key)&&
      !ledger.guardNotice){confirmed=true;break}
   if(child.exitCode!==null)break;
   await delay(180);
  }
  assert.ok(confirmed,JSON.stringify({output,error,
   sent:browser?.presses,delivered:!!ledger?.guardDeliveredKeys?.length,
   pending:!!ledger?.guardNotice}).slice(0,1800));
  assert.equal(browser.presses,1);
  assert.equal(browser.types,1);
  assert.equal(browser.users.length,1);
  assert.ok(browser.users[0].startsWith(
   '[IOANT-GUARD-INCIDENT '+fixture.ticket.key+']'));
  assert.match(browser.users[0],/Audit: IOANT_GUARD_INCIDENT_NOTICE/);
  assert.deepEqual(ledger.guardDeliveredKeys,[fixture.ticket.key]);
  assert.equal(ledger.feedbackPending,null);
  assert.doesNotMatch(error,/Unhandled|TypeError|SyntaxError/);
 }finally{
  if(child&&child.exitCode===null){
   const closed=new Promise(r=>child.once('close',r));
   child.kill('SIGTERM');
   await Promise.race([closed,delay(1600)]);
   if(child.exitCode===null)child.kill('SIGKILL'); // isolated test child only
   await Promise.race([closed,delay(1600)]);
  }
  await rm(base,{recursive:true,force:true});
 }
},{timeout:34000});
