import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {sanitizeTccEventLines} from '../scripts/openclaw-chrome-tcc-live-passive.mjs';
test('sanitized TCC log returns only service counts and safe IDs',()=>{
 const raw='tccd AUTHREQ_CTX: service=kTCCServiceSystemPolicyAppDataDetailed\n'
 +'tccd AUTHREQ_ATTRIBUTION: service=kTCCServiceSystemPolicyAppDataDetailed, responsible={identifier=node, path=/Users/PRIVATE/secret}\n'
 +'tccd AUTHREQ_RESULT: service=kTCCServiceSystemPolicyAppDataDetailed, authValue=0\n'
 +'OTHER: password=never-leak\n';
 const s=sanitizeTccEventLines(raw);
 assert.equal(s.eventCount,3);assert.equal(s.attributionLines,1);assert.equal(s.deniedEventCount,1);
 assert.deepEqual(s.candidateResponsibleIdentifiers,['node']);
 assert.doesNotMatch(JSON.stringify(s),/PRIVATE|password|secret/);
});
test('unrelated and empty logs reveal no identifiers',()=>{
 assert.deepEqual(sanitizeTccEventLines('AUTHREQ_ATTRIBUTION responsible={identifier=com.private.App}'),
  {eventCount:0,attributionLines:0,candidateResponsibleIdentifiers:[],deniedEventCount:0});
 assert.equal(sanitizeTccEventLines(null).eventCount,0);
});
test('CLI responds from path with spaces without entering live capture',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ioant chrome tcc test '));
 try{
  const path=join(dir,'tcc live check.mjs');
  await copyFile(new URL('../scripts/openclaw-chrome-tcc-live-passive.mjs',import.meta.url),path);
  const r=spawnSync(process.execPath,[path,'--invalid'],{encoding:'utf8',timeout:10000,maxBuffer:8192});
  assert.equal(r.status,2,r.stderr);
  assert.deepEqual(JSON.parse(r.stdout.trim()),{audit:'IOANT_CHROME_TCC_LIVE_PASSIVE',state:'blocked',reason:'no_arguments_supported'});
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('source does not read port contents, modify TCC, or call browser',()=>{
 const s=readFileSync(new URL('../scripts/openclaw-chrome-tcc-live-passive.mjs',import.meta.url),'utf8');
 assert.match(s,/O_RDONLY\|constants\.O_NOFOLLOW/);
 assert.match(s,/fileContentRead:false/);assert.match(s,/rawLogOutput:false/);
 assert.doesNotMatch(s,/\b(?:readFile|readSync|writeFile|writeSync|chmod|chown|tccutil|browser)\s*\(/);
});
