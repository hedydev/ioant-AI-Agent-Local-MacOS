import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const script=resolve('scripts/worker-log-timestamp.sh');
test('timestamp helper is Bash-syntax valid and emits one local timestamp per line',()=>{
 const syntax=spawnSync('/bin/bash',['-n',script],{encoding:'utf8',timeout:5000});
 assert.equal(syntax.status,0,syntax.stderr);
 const result=spawnSync('/bin/bash',['-c',
  'source "$1"; printf "alpha\\nbeta\\n" | ioant_timestamp_lines',
  '_',script],{encoding:'utf8',timeout:5000});
 assert.equal(result.status,0,result.stderr);
 const lines=result.stdout.trimEnd().split('\n');
 assert.equal(lines.length,2);
 for(let i=0;i<2;i++)
  assert.match(lines[i],new RegExp('^\\[\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2} [+-]\\d{4}\\] '+(i===0?'alpha':'beta')+'$'));
});
