import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,existsSync,lstatSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const moduleUrl=pathToFileURL(resolve(import.meta.dirname,'../stage2/diagnostic-log.mjs')).href;
function fixture(run){
 const root=mkdtempSync(join(tmpdir(),'ioant-local-event-'));
 const home=join(root,'home');
 mkdirSync(home,{mode:0o700});
 const base=join(home,'Library','Application Support','ioant-openclaw-ops');
 mkdirSync(base,{recursive:true,mode:0o700});
 const dir=join(base,'logs','chatgpt-loop');
 const cache=join(root,'external-cache');
 try{return run({root,home,base,dir,cache});}
 finally{rmSync(root,{recursive:true,force:true});}
}
function call(home,cache,dir){
 const code="import {createDiagnosticLog,recordDiagnosticEvent} from "+JSON.stringify(moduleUrl)+";const p=createDiagnosticLog("+JSON.stringify(dir)+");recordDiagnosticEvent('worker_start',{mode:'watch'},p);console.log(p)";
 return spawnSync(process.execPath,['--input-type=module','--eval',code],{encoding:'utf8',env:{...process.env,HOME:home,PROJECT_DEV_CACHE:cache,IOANT_BACKGROUND_SAFE_REPORTS:'1'}});
}
test('background logs use local Application Support and not LunaDrive',()=>fixture(({home,cache,dir})=>{
 const r=call(home,cache,dir);
 assert.equal(r.status,0,r.stderr);
 assert.ok(existsSync(dir));
 assert.equal(lstatSync(dir).mode&0o777,0o700);
 assert.ok(!existsSync(cache));
 assert.match(r.stdout,/Application Support/);
}));
test('background logger rejects logs-folder symlink redirect',()=>fixture(({home,base,cache,dir,root})=>{
 const other=join(root,'other');mkdirSync(other,{mode:0o700});
 symlinkSync(other,join(base,'logs'));
 const r=call(home,cache,dir);
 assert.notEqual(r.status,0);
 assert.ok(!existsSync(join(other,'chatgpt-loop','run-unknown.jsonl')));
}));
