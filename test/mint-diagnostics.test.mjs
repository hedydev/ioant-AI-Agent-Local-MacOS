import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {mintBdsProcessIdentity,sanitizeMintHelperReport} from '../stage2/mint-diagnostics.mjs';
import {actionFromJson,isSafeAction} from '../stage2/protocol.mjs';

const now=1792800907000;
const report={audit:'IOANT_MINT_BDS_PROCESS_IDENTITY',schemaVersion:1,
 readOnly:true,observedAtUnix:1792800907,port:17880,state:'observed',
 pid:1712655,parentPid:31,process:'bedrock_server',birthTag:'abcdef012345',
 classification:'isolated_lab_directory',sharesProductionPort:false,
 productionPortOwnerVisible:true,executableMatches:true,
 note:'point_in_time_identity_only_no_permission_to_stop_or_reprobe'};
function fixture(r={status:'passed',output:JSON.stringify(report)}){
 const calls=[];
 return {calls,execute:async plan=>{calls.push(plan);return r}};
}
test('one SSH command runs only the root-owned exact Python helper',async()=>{
 const mock=fixture();
 const r=await mintBdsProcessIdentity({execute:mock.execute,sshTarget:'tedz@192.168.0.104',now:()=>now});
 assert.equal(r.status,'passed');assert.equal(mock.calls.length,1);
 assert.equal(mock.calls[0].bin,'ssh');
 assert.deepEqual(mock.calls[0].args.slice(0,7),
  ['-T','-o','BatchMode=yes','-o','ConnectTimeout=10','-o','StrictHostKeyChecking=yes']);
 assert.equal(mock.calls[0].args[7],'tedz@192.168.0.104');
 assert.equal(mock.calls[0].args[8],
  'sudo -n /usr/bin/python3 -I -S /usr/local/libexec/ioant/mint-bds-diagnostics.py');
});
test('only explicitly approved Mint destination accepted',async()=>{
 for(const target of ['root@192.168.0.104','tedz@192.168.0.105','invalid']){
  const mock=fixture();const r=await mintBdsProcessIdentity({execute:mock.execute,sshTarget:target});
  assert.equal(r.status,'approval_required');assert.equal(mock.calls.length,0);
 }
});
test('permission denial is redacted without sudo text',async()=>{
 const mock=fixture({status:'failed',output:'sudo: a password is required'});
 const r=await mintBdsProcessIdentity({execute:mock.execute,sshTarget:'tedz@192.168.0.104'});
 assert.equal(r.status,'approval_required');
 assert.doesNotMatch(JSON.stringify(r),/password is required/);
});
test('fresh helper report is bounded and excludes unknown private fields',()=>{
 const r=sanitizeMintHelperReport(JSON.stringify({...report,privatePath:'/home/tedz/secret'}),now);
 assert.equal(r.classification,'isolated_lab_directory');
 assert.doesNotMatch(JSON.stringify(r),/privatePath|secret/);
});
test('stale, inconsistent or forged success fails closed',()=>{
 for(const r of [{...report,pid:0},{...report,classification:'kill_now'},
  {...report,sharesProductionPort:true},{...report,readOnly:false}])
  assert.throws(()=>sanitizeMintHelperReport(JSON.stringify(r),now));
 assert.throws(()=>sanitizeMintHelperReport(JSON.stringify(report),now+900000));
});
test('inconclusive privileged result stays inconclusive',async()=>{
 const mock=fixture({status:'passed',output:JSON.stringify({
  ...report,state:'inconclusive',reason:'no_unique_visible_owner'})});
 const r=await mintBdsProcessIdentity({execute:mock.execute,sshTarget:'tedz@192.168.0.104',now:()=>now});
 assert.equal(r.status,'inconclusive');assert.equal(r.exitCode,0);
});
test('Python helper synthetic socket and proc tests run without sudo',()=>{
 const r=spawnSync('python3',['-I','-B','-S','test/test_mint_bds_helper.py'],{
  cwd:resolve(import.meta.dirname,'..'),encoding:'utf8',timeout:15000});
 assert.equal(r.status,0,r.stderr||String(r.error));
 assert.match(r.stderr,/Ran 5 tests/);
});
test('ChatGPT task remains known but not automatically authorized',()=>{
 const task=actionFromJson(JSON.stringify({protocol:'ioant-mac-ops-v1',
 id:'mint-root-helper-001',action:'mint-bds-process-identity'}));
 assert.equal(task.known,true);assert.equal(task.authorized,false);
 assert.equal(isSafeAction(task.action),false);
});
