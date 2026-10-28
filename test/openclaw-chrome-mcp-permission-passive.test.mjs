import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {posixAllow,classifyMetadata,parsePids,parsePs} from '../scripts/openclaw-chrome-mcp-permission-passive.mjs';

test('POSIX estimate uses owner group other bits, without claiming actual access',()=>{
 assert.equal(posixAllow({mode:0o100600,uid:501,gid:20},501,[20],4),true);
 assert.equal(posixAllow({mode:0o40700,uid:501,gid:20},502,[20],1),false);
 assert.equal(posixAllow({mode:0o40710,uid:501,gid:20},502,[20],1),true);
 assert.equal(posixAllow({mode:0o40700,uid:501,gid:20},null,[20],1),null);
});
test('assessment preserves unresolved ACL and TCC uncertainty',()=>{
 const dirs=Array.from({length:5},()=>({state:'observed',type:'directory',posixAllowsExpected:true,aclEntries:0}));
 const file={state:'observed',type:'file',posixAllowsExpected:true,aclEntries:0};
 assert.equal(classifyMetadata([...dirs,file]),'not_explained_by_posix_metadata');
 assert.equal(classifyMetadata([...dirs,{...file,aclEntries:2}]),'acl_present_requires_review');
 assert.equal(classifyMetadata([...dirs,{...file,aclEntries:null}]),'acl_observation_incomplete');
 assert.equal(classifyMetadata([...dirs,{...file,posixAllowsExpected:false}]),'posix_mode_may_block');
 assert.equal(classifyMetadata([...dirs,{...file,state:'unavailable'}]),'incomplete_metadata');
 assert.equal(classifyMetadata([{...dirs[0],type:'symlink'},...dirs.slice(1),file]),'unexpected_path_type');
});
test('process parsing never outputs process command arguments',()=>{
 assert.deepEqual(parsePids('123\n123\n345\n'),[123,345]);
 assert.deepEqual(parsePs('501 501 1 /opt/homebrew/bin/node'),
  {uid:501,euid:501,ppid:1,executableClass:'node'});
 assert.deepEqual(parsePs('501 0 1 /private/other Application Name'),
  {uid:501,euid:0,ppid:1,executableClass:'other'});
 assert.equal(parsePs('garbage'),null);
});
test('static source excludes file open/read, browser and permission-mutation operations',()=>{
 const source=readFileSync(new URL('../scripts/openclaw-chrome-mcp-permission-passive.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\b(?:open|readFile|createReadStream|access|chmod|chown|unlink|rename|writeFile)\s*\(/);
 assert.doesNotMatch(source,/\b(?:cdp|browser|tccutil)\s*\(/);
 assert.match(source,/portContentRead:false/);
 assert.match(source,/tccCausality:'not_established'/);
});

test('CLI entrypoint emits bounded audit even when installed path contains spaces',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'ioant chrome mcp CLI '));
 try{
  const target=join(folder,'chrome mcp passive.mjs');
  await copyFile(new URL('../scripts/openclaw-chrome-mcp-permission-passive.mjs',import.meta.url),target);
  // Invalid arguments take a non-mutating fast path, independent of host platform.
  const result=spawnSync(process.execPath,[target,'--unsupported'],{
   encoding:'utf8',timeout:10000,maxBuffer:8192
  });
  assert.equal(result.error,undefined);
  assert.equal(result.status,2,result.stderr);
  const lines=result.stdout.trim().split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length,1);
  const audit=JSON.parse(lines[0]);
  assert.equal(audit.audit,'IOANT_CHROME_MCP_PERMISSION_PASSIVE');
  assert.equal(audit.state,'blocked');
  assert.equal(audit.reason,'no_arguments_supported');
 }finally{
  await rm(folder,{recursive:true,force:true});
 }
});
