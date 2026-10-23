import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,lstatSync,statSync,utimesSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDiagnosticLog,recordDiagnosticEvent,diagnosticCode} from '../stage2/diagnostic-log.mjs';

function fixture(run){
 const root=mkdtempSync(join(tmpdir(),'ioant-event-log-'));
 const prevStore=process.env.PROJECT_DEV_CACHE;
 const prevLog=process.env.IOANT_LOOP_LOG_FILE;
 const store=join(root,'LunaDrive','DeveloperCache','projects','ioant-ai-agent-local-macos');
 mkdirSync(store,{recursive:true});
 process.env.PROJECT_DEV_CACHE=store;
 delete process.env.IOANT_LOOP_LOG_FILE;
 try{return run({root,store,logDir:join(store,'logs','chatgpt-loop')});}
 finally{
   if(prevStore===undefined)delete process.env.PROJECT_DEV_CACHE;
   else process.env.PROJECT_DEV_CACHE=prevStore;
   if(prevLog===undefined)delete process.env.IOANT_LOOP_LOG_FILE;
   else process.env.IOANT_LOOP_LOG_FILE=prevLog;
   rmSync(root,{recursive:true,force:true});
 }
}

test('default diagnostics create private LunaDrive JSONL log with no secrets or browser text',()=>fixture(({logDir})=>{
 const path=createDiagnosticLog(logDir);
 assert.equal(lstatSync(path).mode & 0o777,0o600);
 assert.equal(lstatSync(logDir).mode & 0o777,0o700);
 recordDiagnosticEvent('launcher_start',{},path);
 recordDiagnosticEvent('worker_start',{profile:'chrome',mode:'once'},path);
 recordDiagnosticEvent('action_finished',{taskId:'alice-0001',action:'alice-witness-preflight',status:'passed',elapsedMs:42,exitCode:0},path);
 const entries=readFileSync(path,'utf8').trim().split('\n').map(x=>JSON.parse(x));
 assert.equal(entries.length,3);
 assert.equal(entries[2].taskId,'alice-0001');
 assert.equal(entries[2].elapsedMs,42);
 assert.ok(entries.every(e=>e.at&&!('message' in e)&&!('output' in e)&&!('url' in e)&&!('token' in e)));
}));

test('untrusted metadata and unsupported events never reach diagnostic disk',()=>fixture(({logDir})=>{
 const path=createDiagnosticLog(logDir);
 const before=statSync(path).size;
 for(const meta of [
  {token:'deadbeef'}, {command:'rm -rf /'}, {url:'https://chatgpt.com'},
  {status:'Authorization: Bearer secret'}, {taskId:'bad\nmessage'}
 ])assert.throws(()=>recordDiagnosticEvent('worker_error',meta,path),/Unsafe diagnostic metadata/);
 assert.throws(()=>recordDiagnosticEvent('untrusted_page_data',{},path),/Unknown diagnostic event/);
 assert.equal(statSync(path).size,before);
}));

test('private run file rotates after 2 MiB without overwriting original',()=>fixture(({logDir})=>{
 const path=createDiagnosticLog(logDir);
 writeFileSync(path,'x'.repeat(2*1024*1024),{mode:0o600});
 recordDiagnosticEvent('watch_heartbeat',{status:'running'},path);
 const next=path.slice(0,-6)+'.part1.jsonl';
 const entry=JSON.parse(readFileSync(next,'utf8').trim());
 assert.equal(entry.event,'watch_heartbeat');
 assert.equal(statSync(path).size,2*1024*1024);
 assert.equal(lstatSync(next).mode & 0o777,0o600);
}));

test('retention only deletes old same-owner regular log files',()=>fixture(({logDir})=>{
 const first=createDiagnosticLog(logDir);
 const past=new Date(Date.now()-32*86400000);
 utimesSync(first,past,past);
 const unsafe=join(logDir,'run-20200101T000000Z-999-1234abcd.part1.jsonl');
 symlinkSync(first,unsafe);
 createDiagnosticLog(logDir);
 assert.throws(()=>lstatSync(first),{code:'ENOENT'});
 assert.equal(lstatSync(unsafe).isSymbolicLink(),true);
}));

test('errors are classified without logging raw secrets, chat text, or arbitrary URLs',()=>{
 assert.equal(diagnosticCode(new Error('gateway browser.request requires credentials before opening a websocket')),'gateway_auth');
 assert.equal(diagnosticCode(new Error('Navigation blocked: strict browser SSRF policy cannot be enforced while this browser profile is proxy-routed')),'browser_ssrf');
 assert.equal(diagnosticCode(new Error('ChatGPT input not detected')), 'composer');
 assert.equal(diagnosticCode(new Error('secret password=do-not-log https://example.com')), 'unexpected');
});

test('missing configured log file is optional for direct Node tests',()=>{
 const prev=process.env.IOANT_LOOP_LOG_FILE;
 delete process.env.IOANT_LOOP_LOG_FILE;
 try{assert.equal(recordDiagnosticEvent('worker_start'),false);}
 finally{if(prev!==undefined)process.env.IOANT_LOOP_LOG_FILE=prev;}
});
