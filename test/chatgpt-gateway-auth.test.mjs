import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { executeStep } from '../stage2/runner.mjs';

const root=resolve(import.meta.dirname,'..');
const shell=readFileSync(resolve(root,'scripts/chatgpt-loop.sh'),'utf8');

test('Gateway auth recovery is terminal-only, hidden, and never weakens existing auth',()=>{
  const syntax=spawnSync('bash',['-n',resolve(root,'scripts/chatgpt-loop.sh')],{encoding:'utf8'});
  assert.equal(syntax.status,0,syntax.stderr);
  assert.match(shell,/requires credentials before opening a websocket/);
  assert.match(shell,/\[\[ ! -t 0 \]\]/);
  assert.match(shell,/read -rs GATEWAY_CREDENTIAL/);
  assert.match(shell,/unset GATEWAY_CREDENTIAL/);
  assert.match(shell,/gateway health/);
  assert.match(shell,/Gateway credential accepted; reusing the existing service/);
  assert.match(shell,/No restart, retry or config overwrite performed/);
  assert.match(shell,/gateway run --allow-unconfigured --bind loopback --auth token --tailscale off/);
  assert.doesNotMatch(shell,/echo[^\n]*\$GATEWAY_CREDENTIAL/);
  assert.doesNotMatch(shell,/^\s*(?:gateway auth disable|openclaw gateway stop|rm -rf|sudo)/m);
});

test('bounded project child never inherits Gateway token, password or URL',async()=>{
  const previous={};
  const names=['OPENCLAW_GATEWAY_TOKEN','OPENCLAW_GATEWAY_PASSWORD','OPENCLAW_GATEWAY_URL'];
  for(const name of names){previous[name]=process.env[name];process.env[name]='SENSITIVE-LOCAL-TEST';}
  try{
    const result=await executeStep({
      bin:process.execPath,
      args:['-e',"process.stdout.write(JSON.stringify(['OPENCLAW_GATEWAY_TOKEN','OPENCLAW_GATEWAY_PASSWORD','OPENCLAW_GATEWAY_URL'].map(k=>Object.hasOwn(process.env,k))))"],
      cwd:root,timeout:10000
    });
    assert.equal(result.status,'passed',result.output);
    assert.equal(result.output,'[false,false,false]');
    assert.doesNotMatch(result.output,/SENSITIVE-LOCAL-TEST/);
  } finally {
    for(const name of names){
      if(previous[name]===undefined)delete process.env[name];
      else process.env[name]=previous[name];
    }
  }
});
