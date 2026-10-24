import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';

const ROOT=resolve(import.meta.dirname,'..');
const GUARD=join(ROOT,'scripts/self-update-reload-guard.sh');
const LAUNCHER=join(ROOT,'scripts/chatgpt-loop.sh');

function git(repo,...args){
 const r=spawnSync('git',['-C',repo,...args],{encoding:'utf8',timeout:10000});
 assert.equal(r.status,0,'fixture git failed: '+(r.stderr||r.error?.message||r.status));
 return r.stdout.trim();
}
function check(repo,before,after){
 return spawnSync('bash',['-c','source "$1"; ioant_validated_reload_progress "$2" "$3" "$4"',
  'guard',GUARD,repo,before,after],{encoding:'utf8',timeout:10000});
}

test('reload guard accepts more than three independent real fast-forwards',async()=>{
 const scratch=await mkdtemp(join(tmpdir(),'ioant-reload-check-'));
 try{
  git(scratch,'init','-q','-b','main');
  for(const k of ['user.name','user.email'])
   git(scratch,'config',k,k==='user.name'?'Fixture Test':'fixture@localhost.invalid');
  git(scratch,'commit','--allow-empty','-qm','start');
  let prior=git(scratch,'rev-parse','HEAD');
  const genesis=prior;
  for(let i=1;i<=5;i++){
   git(scratch,'commit','--allow-empty','-qm','update-'+i);
   const current=git(scratch,'rev-parse','HEAD');
   const r=check(scratch,prior,current);
   assert.equal(r.status,0,'valid fast-forward #'+i+' was rejected: '+r.stderr);
   prior=current;
  }
  assert.notEqual(check(scratch,prior,prior).status,0,'no-progress reload must fail');
  assert.notEqual(check(scratch,prior,genesis).status,0,'reverse ancestry must fail');
  assert.notEqual(check(scratch,genesis,'0'.repeat(40)).status,0,'unknown target must fail');
  assert.notEqual(check(scratch,'invalid',prior).status,0,'non-SHA input must fail');
 }finally{await rm(scratch,{recursive:true,force:true})}
});

test('launcher must verify HEAD progress and ancestor before reload; no cumulative update cap',async()=>{
 for(const path of [GUARD,LAUNCHER]){
  const r=spawnSync('bash',['-n',path],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
 }
 const script=await readFile(LAUNCHER,'utf8');
 assert.match(script,/source "\$ROOT\/scripts\/self-update-reload-guard\.sh"/);
 assert.match(script,/before_head="\$\(git -C "\$ROOT" rev-parse --verify HEAD/);
 assert.match(script,/after_head="\$\(git -C "\$ROOT" rev-parse --verify HEAD/);
 assert.match(script,/if ! ioant_validated_reload_progress "\$ROOT" "\$before_head" "\$after_head"; then/);
 assert.match(script,/if \(\( worker_rc != 75 \)\); then/);
 assert.doesNotMatch(script,/reloads=\$\(\(reloads\+1\)\)|reloads > 3/);
});
