import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { candidatePaths, displayPath, detectTool, checkOllama, evaluateRequirements, formatSummary } from '../src/environment.mjs';

test('candidate paths include shallow Android platform-tools in Downloads', () => {
  const paths = candidatePaths('adb',{home:'/Users/test',envPath:'/usr/bin',downloads:['SwitchAndroid15-20261018-nx_tab']});
  assert.ok(paths.includes('/Users/test/Downloads/SwitchAndroid15-20261018-nx_tab/platform-tools/adb'));
  assert.equal(displayPath(paths.at(-1),'/Users/test'),'~/Downloads/SwitchAndroid15-20261018-nx_tab/platform-tools/adb');
});
test('distinguish executable on PATH versus executable found off PATH',async () => {
  const home = await mkdtemp(join(tmpdir(),'inventory-test-'));
  try {
    const dir = join(home,'Downloads','AndroidBundle','platform-tools');
    await mkdir(dir,{recursive:true});
    await writeFile(join(dir,'adb'),'#!/bin/sh\n');
    await chmod(join(dir,'adb'),0o700);
    const off = await detectTool('adb',{home,envPath:'/usr/bin',downloads:['AndroidBundle']});
    assert.equal(off.status,'found_off_path');
    assert.equal(off.executable,'~/Downloads/AndroidBundle/platform-tools/adb');
    const on = await detectTool('adb',{home,envPath:dir,downloads:['AndroidBundle']});
    assert.equal(on.status,'on_path');
  } finally { await rm(home,{recursive:true,force:true}); }
});
test('Ollama probing is loopback-only and returns safe model names',async () => {
  const called=[];
  const services=await checkOllama({ports:[11435,11434],fetchImpl:async (url) => {
    called.push(url);
    if(url.includes('11435')) return {ok:true,text:async()=>JSON.stringify({models:[{name:'gpt-oss:20b'},{name:'embeddinggemma:latest'}]})};
    throw new Error('offline');
  }});
  assert.equal(services[0].status,'reachable');
  assert.deepEqual(services[0].models,['gpt-oss:20b','embeddinggemma:latest']);
  assert.equal(services[1].status,'unreachable_or_invalid');
  assert.deepEqual(called,['http://127.0.0.1:11435/api/tags','http://127.0.0.1:11434/api/tags']);
});
test('readiness distinguishes installed, PATH and model availability', () => {
  const snapshot={
    platform:'darwin',architecture:'arm64',checked_at:'now',
    tools:[{name:'node',status:'on_path',executable:'~/node'},{name:'openclaw',status:'found_off_path',executable:'~/openclaw'}],
    services:{ollama:[{status:'reachable',models:['gpt-oss:20b']}]}
  };
  const checks=evaluateRequirements(snapshot,{tools:['node','openclaw'],ollama:true,model:'gpt-oss:20b'});
  assert.deepEqual(checks.map(c=>c.status),['ready','needs_path','ready','ready']);
  assert.match(formatSummary(snapshot),/found_off_path/);
});
