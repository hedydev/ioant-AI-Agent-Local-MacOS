import test from 'node:test';
import assert from 'node:assert/strict';
import {mintBdsProcessLineage,classifyMintCwd,parseLineagePs} from '../stage2/mint-lineage.mjs';
import {actionFromJson,isSafeAction} from '../stage2/protocol.mjs';
import {runAction} from '../stage2/runner.mjs';

const H='sudo -n /usr/bin/python3 -I -S /usr/local/libexec/ioant/mint-bds-diagnostics.py';
const P='/usr/bin/ps -p 1712655,1712650 -o pid=,ppid=,comm=,lstart=';
const C='/usr/bin/readlink /proc/1712655/cwd';
const A='/usr/bin/readlink /proc/1712650/cwd';
const NOW=1792804078000;
const ROOT={audit:'IOANT_MINT_BDS_PROCESS_IDENTITY',schemaVersion:1,readOnly:true,
 observedAtUnix:1792804078,port:17880,state:'observed',pid:1712655,
 parentPid:1712650,process:'bedrock_server',birthTag:'060b5f8fe3cd',
 classification:'other_or_unverified_directory',sharesProductionPort:false,
 productionPortOwnerVisible:true,executableMatches:true,
 note:'point_in_time_identity_only_no_permission_to_stop_or_reprobe'};
const PS='1712655 1712650 bedrock_server Fri Oct 23 18:17:00 2026\n1712650 1 bash Fri Oct 23 18:16:59 2026\n';
const sample=[H,P,C,A,P,H];
const fixture=(overrides={})=>{
 const calls=[];
 const response={
  [H]:JSON.stringify(ROOT),
  [P]:PS,
  [C]:'/home/tedz/minecraft-bedrock-alice-lab-instance\n',
  [A]:'/home/tedz\n',
  ...overrides
 };
 return {calls,execute:async p=>{
  calls.push(p);
  const command=p.args.at(-1);
  if(!Object.hasOwn(response,command))throw Error('Unexpected plan');
  const value=response[command];
  return value===null?{status:'failed',output:'permission denied'}:
    {status:'passed',output:value};
 }};
};
test('unprivileged lineage runs exactly six scoped SSH reads, fresh privileged witnesses at both ends',async()=>{
 const mock=fixture();
 const result=await mintBdsProcessLineage({execute:mock.execute,sshTarget:'tedz@192.168.0.104',now:()=>NOW});
 assert.equal(result.status,'passed',JSON.stringify(result));
 assert.deepEqual(mock.calls.map(p=>p.args.at(-1)),sample);
 for(const plan of mock.calls){
  assert.equal(plan.bin,'ssh');
  assert.equal(plan.args[7],'tedz@192.168.0.104');
  assert.equal(plan.args.slice(0,7).join(' '),'-T -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=yes');
  assert.doesNotMatch(JSON.stringify(plan),/kill|rm -|startup-probe|sudo.*readlink|sudo.*ps/);
 }
 const json=JSON.parse(result.output);
 assert.equal(json.rootWitnessClassification,'other_or_unverified_directory');
 assert.equal(json.childCwdCategory,'other_bedrock_named_directory');
 assert.equal(json.parentProcess,'bash');
 assert.equal(json.parentPidOfParent,1);
 assert.equal(json.parentCwdCategory,'other_tedz_home_directory');
 assert.equal(json.parentSameCwd,false);
 assert.doesNotMatch(result.output,/\/home\/tedz|minecraft-bedrock-alice-lab-instance/);
});
test('rejects alternate hosts before any SSH operation',async()=>{
 for(const host of ['tedz@192.168.0.105','root@192.168.0.104','abc']){
  const f=fixture();const r=await mintBdsProcessLineage({execute:f.execute,sshTarget:host,now:()=>NOW});
  assert.equal(r.status,'approval_required');assert.equal(f.calls.length,0);
 }
});
test('sudo helper unavailable does not run unprivileged follow-up',async()=>{
 const f=fixture({[H]:null});
 const r=await mintBdsProcessLineage({execute:f.execute,sshTarget:'tedz@192.168.0.104',now:()=>NOW});
 assert.equal(r.status,'approval_required');assert.equal(f.calls.length,1);
});
test('unprivileged cwd permission denied fails without widening sudo',async()=>{
 const f=fixture({[C]:null});
 const r=await mintBdsProcessLineage({execute:f.execute,sshTarget:'tedz@192.168.0.104',now:()=>NOW});
 assert.equal(r.status,'inconclusive');
 assert.equal(JSON.parse(r.output).reason,'unprivileged_child_cwd_unavailable');
 assert.ok(f.calls.every(p=>!p.args.at(-1).startsWith('sudo ')||p.args.at(-1)===H));
});
test('inaccessible parent cwd does not prevent bounded ancestry from ps',async()=>{
 const f=fixture({[A]:null});
 const r=await mintBdsProcessLineage({execute:f.execute,sshTarget:'tedz@192.168.0.104',now:()=>NOW});
 assert.equal(r.status,'passed');
 assert.equal(JSON.parse(r.output).parentCwdCategory,'unavailable');
});
test('changed BDS owner or port association fails closed even when ps remains same',async()=>{
 let n=0;
 const f=fixture();
 const exec=async plan=>{
  if(plan.args.at(-1)===H && ++n===2)
   return {status:'passed',output:JSON.stringify({...ROOT,birthTag:'ffffffffffff'})};
  return f.execute(plan);
 };
 const r=await mintBdsProcessLineage({execute:exec,sshTarget:'tedz@192.168.0.104',now:()=>NOW});
 assert.equal(JSON.parse(r.output).reason,'process_or_parent_changed_during_audit');
});
test('ps parser rejects injected extra lines and parent chain mismatch',()=>{
 assert.throws(()=>parseLineagePs(PS+'111 1 bash Fri Oct 23 18:10:00 2026',1712655,1712650));
 assert.throws(()=>parseLineagePs(PS.replace('1712655 1712650','1712655 1'),1712655,1712650));
});
test('unknown cwd is hashed/classified but never returned as raw path',()=>{
 assert.equal(classifyMintCwd('/home/tedz/minecraft-bedrock-alice-lab/tmp'),'isolated_lab_subdirectory');
 assert.equal(classifyMintCwd('/home/tedz/minecraft-bedrock'),'production_directory');
 assert.equal(classifyMintCwd('/tmp/test'),'temporary_directory');
 assert.throws(()=>classifyMintCwd('/home/tedz/foo\nbar'));
});
test('lineage requires explicit Mint opt-in; ChatGPT cannot supply PID or paths',async()=>{
 const t=actionFromJson(JSON.stringify({protocol:'ioant-mac-ops-v1',id:'lineage-001',action:'mint-bds-process-lineage'}));
 assert.equal(t.known,true);assert.equal(isSafeAction(t.action),false);
 assert.throws(()=>actionFromJson(JSON.stringify({protocol:t.protocol,id:t.id,action:t.action,pid:1712655})));
 const r=await runAction('mint-bds-process-lineage',process.cwd(),{enableMintDiagnostics:false});
 assert.equal(r.status,'approval_required');
});
