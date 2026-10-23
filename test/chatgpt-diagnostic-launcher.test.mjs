import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const root=resolve(import.meta.dirname,'..');
const launcher=readFileSync(resolve(root,'scripts/chatgpt-loop.sh'),'utf8');
const viewer=readFileSync(resolve(root,'scripts/chatgpt-loop-logs.sh'),'utf8');
const worker=readFileSync(resolve(root,'stage2/chatgpt-loop.mjs'),'utf8');

test('Mac launcher and diagnostics reader have valid bash syntax',()=>{
 for(const sh of ['chatgpt-loop.sh','chatgpt-loop-logs.sh']){
  const r=spawnSync('bash',['-n',resolve(root,'scripts',sh)],{encoding:'utf8'});
  assert.equal(r.status,0,sh+': '+r.stderr);
 }
});

test('watcher creates private diagnostic stream before Gateway and captures shutdown',()=>{
 assert.match(launcher,/IOANT_LOOP_LOG_FILE=.*diagnostic-log\.mjs" init/);
 assert.match(launcher,/log_event launcher_start/);
 assert.match(launcher,/log_event launcher_exit/);
 assert.match(launcher,/log_event gateway_temporary/);
 assert.match(launcher,/log_event gateway_existing/);
 assert.match(launcher,/log_event tab_found/);
 assert.match(launcher,/log_event tab_missing/);
 assert.doesNotMatch(launcher,/tee .*GATEWAY_CREDENTIAL|echo.*GATEWAY_CREDENTIAL/);
 assert.ok(launcher.indexOf('log_event launcher_start')<launcher.indexOf('GATEWAY_HEALTHY=0'));
});

test('watch-loop records status-only checkpoints and heartbeat, not raw messages',()=>{
 for(const marker of ['worker_start','page_ready','initialization_attempt','action_started',
  'action_finished','report_saved','feedback_pending','feedback_confirmed','watch_heartbeat','worker_error']){
  assert.match(worker,new RegExp("recordDiagnosticEvent\\('"+marker+"'"));
 }
 assert.doesNotMatch(worker,/recordDiagnosticEvent\([^;]*\.output/);
 assert.doesNotMatch(worker,/recordDiagnosticEvent\([^;]*\.reportJson/);
 assert.doesNotMatch(worker,/recordDiagnosticEvent\([^;]*state\.users/);
});

test('log viewer is local, constrained and excludes raw Gateway log files',()=>{
 assert.match(viewer,/source "\$ROOT\/scripts\/dev-env\.sh"/);
 assert.match(viewer,/latest\|tail\|bundle/);
 assert.match(viewer,/jsonl/);
 assert.match(viewer,/stat\(\)\.st_ino/);
 assert.doesNotMatch(viewer,/gateway.*\.log.*z\.write/);
});
