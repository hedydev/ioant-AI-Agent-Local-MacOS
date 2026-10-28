import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,copyFile,rm,mkdir,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {posixAllow,classifyMetadata,parsePids,parsePs,summarizeAclListing} from '../scripts/openclaw-chrome-mcp-permission-passive.mjs';

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
 assert.deepEqual(parsePs('0 501 1 /private/other Application Name'),
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

test('CLI entrypoint identifies symlinked /var-style path with spaces',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'ioant chrome mcp alias '));
 try{
  const actualDir=join(folder,'actual space');
  const aliasDir=join(folder,'alias space');
  await mkdir(actualDir);
  const name='passive CLI.mjs';
  await copyFile(new URL('../scripts/openclaw-chrome-mcp-permission-passive.mjs',import.meta.url),join(actualDir,name));
  await symlink(actualDir,aliasDir,'dir');
  const result=spawnSync(process.execPath,[join(aliasDir,name),'--unsupported'],{
   encoding:'utf8',timeout:10000,maxBuffer:8192
  });
  assert.equal(result.error,undefined);
  assert.equal(result.status,2,result.stderr);
  const audit=JSON.parse(result.stdout.trim());
  assert.equal(audit.audit,'IOANT_CHROME_MCP_PERMISSION_PASSIVE');
  assert.equal(audit.reason,'no_arguments_supported');
 }finally{
  await rm(folder,{recursive:true,force:true});
 }
});

test('macOS ACL classification redacts principals, distinguishes deny delete from read/search',()=>{
 const raw='drwx------ 20 local group 640 Oct 29 00:00 hidden\n'
  +' 0: group:everyone deny delete\n'
  +' 1: user:PRIVATEUSER deny search,read\n'
  +' 2: group:SECRETGROUP allow readattr\n';
 const summary=summarizeAclListing(raw);
 assert.deepEqual(summary,{count:3,denyReadOrSearchCount:1,denyDeleteOnlyCount:1,otherCount:1});
 assert.doesNotMatch(JSON.stringify(summary),/PRIVATEUSER|SECRETGROUP/);
 const harmless=summarizeAclListing('dir\n 0: group:everyone deny delete\n');
 const dirs=Array.from({length:5},()=>({state:'observed',type:'directory',
  posixAllowsExpected:true,aclEntries:0,aclDeleteOnlyCount:0,aclDenyReadOrSearchCount:0}));
 const port={state:'observed',type:'file',posixAllowsExpected:true,
  aclEntries:0,aclDeleteOnlyCount:0,aclDenyReadOrSearchCount:0};
 assert.equal(classifyMetadata([{...dirs[0],aclEntries:harmless.count,
  aclDeleteOnlyCount:harmless.denyDeleteOnlyCount},...dirs.slice(1),port]),
  'only_delete_acl_observed');
 assert.equal(classifyMetadata([{...dirs[0],aclEntries:summary.count,
  aclDenyReadOrSearchCount:summary.denyReadOrSearchCount},...dirs.slice(1),port]),
  'acl_read_or_search_deny_present');
});
test('Darwin ps effective uid is uid and real uid is ruid',()=>{
 const parsed=parsePs('0 501 1 /usr/local/bin/node');
 assert.equal(parsed.euid,0);
 assert.equal(parsed.uid,501);
 const source=readFileSync(new URL('../scripts/openclaw-chrome-mcp-permission-passive.mjs',import.meta.url),'utf8');
 assert.match(source,/uid=,ruid=,ppid=,comm=/);
 assert.doesNotMatch(source,/uid=,euid=,ppid=,comm=/);
});
