import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const shell=readFileSync(resolve(root,'scripts/chatgpt-loop.sh'),'utf8');
const runner=readFileSync(resolve(root,'stage2/runner.mjs'),'utf8');
const loop=readFileSync(resolve(root,'stage2/chatgpt-loop.mjs'),'utf8');

test('Stage 2 isolated launcher is syntactically valid and neither installs nor resets apps',()=>{
  const r=spawnSync('bash',['-n',resolve(root,'scripts/chatgpt-loop.sh')],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  assert.doesNotMatch(shell,/^\s*(?:sudo|rm\s+-rf|git\s+(?:reset|clean|checkout)|openclaw\s+gateway\s+install)/m);
  assert.match(shell,/gateway run --allow-unconfigured --bind loopback --auth token --tailscale off/);
  assert.match(shell,/kill "\$GATEWAY_PID"/);
});

test('only fixed argv in project worker; browser commands never from ChatGPT content',()=>{
  assert.match(runner,/shell:false/);
  assert.match(runner,/const plans=\{/);
  assert.doesNotMatch(loop,/exec\(task|spawn\(task|execFile\(task/);
  assert.match(loop,/feedbackPending/);
  assert.match(loop,/state\.lastTaskId/);
  assert.match(loop,/await exactTab\(opts\.url\)/);
});

test('multi-task assistant turns do not kill Watcher and never dispatch either task',()=>{
  assert.match(loop,/a\.status==='rejected_ambiguous_task'/);
  assert.match(loop,/previousFingerprint='';/);
  assert.match(loop,/ambiguous_task_refused/);
  const section=loop.slice(loop.indexOf("if(a.status==='rejected_ambiguous_task')"),
    loop.indexOf("if(a.status==='task'&&a.task.id!==state.lastTaskId)"));
  assert.ok(section.length>100);
  assert.match(section,/continue;/);
  assert.doesNotMatch(section,/runAction\(|sendToChat\(|process\.exitCode/);
});
