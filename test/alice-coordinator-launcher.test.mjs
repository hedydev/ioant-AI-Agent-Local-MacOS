import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,lstatSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';

const ROOT=resolve(import.meta.dirname,'..');
const LAUNCHER=resolve(ROOT,'scripts/alice-coordinator-readonly.sh');
const LOG_CLI=resolve(ROOT,'stage2/diagnostic-log.mjs');
const source=readFileSync(LAUNCHER,'utf8');

test('Alice coordinator selects the exact private diagnostic root for foreground and background modes',()=>{
 assert.match(source,/IOANT_BACKGROUND_SAFE_REPORTS:-0/);
 assert.match(source,/LOGDIR="\$HOME\/Library\/Application Support\/ioant-openclaw-ops\/logs\/chatgpt-loop"/);
 assert.match(source,/LOGDIR="\$PROJECT_DEV_CACHE\/logs\/chatgpt-loop"/);
 assert.doesNotMatch(source,/unset IOANT_BACKGROUND_SAFE_REPORTS|export IOANT_BACKGROUND_SAFE_REPORTS=0/);
 assert.match(source,/--project-key alice-ai --chat-url "\$CHAT_URL" "\$MODE" --enable-gui-readonly/);
 const r=spawnSync('bash',['-n',LAUNCHER],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});
for(const background of ['0','1'])test('Alice diagnostic init succeeds in isolated '+(background==='1'?'background':'foreground')+' fixture',()=>{
 const root=mkdtempSync(join(tmpdir(),'alice-coordinator-logs-'));
 const home=join(root,'home');
 const cache=join(root,'DeveloperCache','projects','ioant-ai-agent-local-macos');
 mkdirSync(home,{recursive:true,mode:0o700});
 mkdirSync(cache,{recursive:true,mode:0o700});
 const dir=background==='1'?
  join(home,'Library','Application Support','ioant-openclaw-ops','logs','chatgpt-loop'):
  join(cache,'logs','chatgpt-loop');
 try{
  const result=spawnSync(process.execPath,[LOG_CLI,'init',dir],{encoding:'utf8',
   env:{...process.env,HOME:home,PROJECT_DEV_CACHE:cache,
    IOANT_BACKGROUND_SAFE_REPORTS:background},timeout:5000});
  assert.equal(result.status,0,result.stderr);
  const filename=result.stdout.trim();
  assert.ok(filename.startsWith(dir+'/'));
  assert.ok(existsSync(filename));
  assert.equal(lstatSync(filename).mode&0o777,0o600);
  assert.equal(lstatSync(dir).mode&0o777,0o700);
 }finally{rmSync(root,{recursive:true,force:true})}
});
