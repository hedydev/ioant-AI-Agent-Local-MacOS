import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const script=resolve(import.meta.dirname,'../scripts/dev-env.sh');
test('dev-env source detection tolerates absent BASH_SOURCE under nounset',()=>{
 const s=readFileSync(script,'utf8');
 assert.match(s,/\$\{BASH_SOURCE\[0\]-\}/);
 const r=spawnSync('/bin/bash',['-n',script],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});
test('zsh nounset sourcing never fails from undefined Bash-specific variables',
 {skip:!existsSync('/bin/zsh')},()=>{
 const r=spawnSync('/bin/zsh',['-f','-c',
  'set -u; source "$1"; exit 0','source-test',script],{encoding:'utf8',timeout:4000});
 assert.doesNotMatch(r.stdout+r.stderr,/BASH_SOURCE.*parameter not set/i);
 assert.equal(r.status,0,r.stderr);
});
