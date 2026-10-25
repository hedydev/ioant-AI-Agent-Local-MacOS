import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const root=resolve(import.meta.dirname,'..');
const file=resolve(root,'stage2/project-chat-ui-probe.mjs');
const source=readFileSync(file,'utf8');
const uiSource=readFileSync(resolve(root,'stage2/project-chat-ui-observer.mjs'),'utf8');

function run(...args){
 const p=spawnSync(process.execPath,[file,...args],
  {encoding:'utf8',cwd:root,timeout:5000,env:{...process.env,
   HOME:'/ioant-ui-probe-test-no-home'}});
 return {code:p.status,stderr:p.stderr,data:JSON.parse(p.stdout.trim())};
}

test('live-probe CLI has fixed command grammar, no arbitrary URLs or browser targets from text',()=>{
 for(const args of [[],['probe'],['probe','AliceAI'],['probe','../outside'],
  ['probe','openclaw-workflow','--target-id','t1'],
  ['open','openclaw-workflow']]){
  const result=run(...args);
  assert.equal(result.data.state,'blocked',JSON.stringify(args));
  assert.equal(result.data.reason,'invalid_command');
  assert.equal(result.data.readOnly,true);
 }
 assert.equal(run('probe','unregistered-project').data.state,'blocked');
});
test('CLI browser command is exact chrome profile, tabs plus read-only evaluate only',()=>{
 assert.match(source,/const BIN=join\(homedir\(\),'\.openclaw','bin','openclaw'\)/);
 assert.match(source,/\['browser','--browser-profile','chrome',\.\.\.args\]/);
 assert.match(source,/args\.length===2&&args\[0\]==='--json'&&args\[1\]==='tabs'/);
 assert.match(source,/args\.length===6&&args\[0\]==='--json'&&args\[1\]==='evaluate'/);
 assert.doesNotMatch(source,/["'](?:navigate|open|click|press|type|fill|screenshot|snapshot)["']\s*,?/);
 assert.doesNotMatch(uiSource,/dangerouslyAllowPrivateNetwork|chrome\.debugger|document\.body\.innerText/);
 assert.doesNotMatch(source,/exec\(\s*['"]sh|shell:\s*true|\/bin\/bash|child_process\.spawn|writeFile\(/);
});
