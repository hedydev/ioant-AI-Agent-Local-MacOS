import test from 'node:test';
import assert from 'node:assert/strict';
import {versionFrom,classifyStatus,inspectVersionParity} from '../stage2/openclaw-version-parity.mjs';
import {actionFromJson} from '../stage2/protocol.mjs';
import {actionPlan} from '../stage2/runner.mjs';

test('version parity is an exact read-only task without user-supplied CLI arguments',()=>{
 const cmd={protocol:'ioant-mac-ops-v1',id:'version-parity-task-001',action:'openclaw-version-parity'};
 const parsed=actionFromJson(JSON.stringify(cmd));
 assert.equal(parsed.authorized,true);
 assert.deepEqual(actionPlan(cmd.action,'/repo').args,['stage2/openclaw-version-parity.mjs']);
 assert.throws(()=>actionFromJson(JSON.stringify({...cmd,version:'fake'})),/Malformed/);
});
test('CLI and Gateway equal versions are positively recognized without raw JSON',()=>{
 assert.equal(versionFrom('OpenClaw 2026.10.6\n'), '2026.10.6');
 const r=classifyStatus(JSON.stringify({
  gateway:{version:'2026.10.6',auth:{token:'PRIVATE_SECRET'}},
  rpc:{status:{runtimeVersion:'2026.10.6'}},
  gatewayService:{installationDrift:false,installPath:'/Users/SECRET_NAME'}
 }), '2026.10.6');
 assert.equal(r.versionMatch,'same');
 assert.equal(r.gatewayVersionEvidence,'consistent');
 assert.equal(r.installationDrift,'not_reported');
 assert.doesNotMatch(JSON.stringify(r),/PRIVATE_SECRET|SECRET_NAME|installPath/);
});
test('version mismatch, conflicting evidence and missing live version fail to infer equality',()=>{
 const mismatch=classifyStatus(JSON.stringify({gateway:{version:'2026.10.6'}}),'2026.10.5');
 assert.equal(mismatch.versionMatch,'different');
 assert.equal(mismatch.gatewayVersion,'2026.10.6');
 const conflict=classifyStatus(JSON.stringify({gateway:{version:'2026.10.6'},rpc:{status:{runtimeVersion:'2026.10.5'}}}),'2026.10.6');
 assert.equal(conflict.versionMatch,'unresolved');
 assert.equal(conflict.gatewayVersionEvidence,'conflicting');
 const absent=classifyStatus(JSON.stringify({gateway:{port:18789}}),'2026.10.6');
 assert.equal(absent.versionMatch,'unresolved');
 assert.equal(absent.gatewayVersion,'unknown');
 assert.equal(classifyStatus('TOKEN SECRET','2026.10.6').status,'invalid_status_json');
});
test('read-only CLI commands have fixed argv, scrub auth and keep stdout private',async()=>{
 const calls=[];
 const status=await inspectVersionParity({cli:'/fixed/openclaw',execImpl:async(bin,args,opts)=>{
  calls.push({bin,args,opts});
  return {stdout:args[0]==='--version'?'OpenClaw 2026.10.6\n':JSON.stringify({
   gateway:{version:'2026.10.6'},gatewayService:{installationDrift:true},
   diagnostics:'PRIVATE_SECRET'
  })};
 }});
 assert.equal(status.status,'observed');
 assert.equal(status.installationDrift,'reported');
 assert.equal(status.versionMatch,'same');
 assert.deepEqual(calls.map(x=>x.args),[['--version'],['gateway','status','--json']]);
 assert.ok(calls.every(x=>x.bin==='/fixed/openclaw'&&x.opts.env.OPENCLAW_GATEWAY_TOKEN===undefined));
 assert.doesNotMatch(JSON.stringify(status),/PRIVATE_SECRET/);
});
test('failed Gateway status and CLI version never expose error text',async()=>{
 const failed=await inspectVersionParity({cli:'/fixed/openclaw',execImpl:async(_bin,args)=>{
  if(args[0]==='--version')return {stdout:'2026.10.6'};
  throw new Error('TOKEN VERY_PRIVATE');
 }});
 assert.equal(failed.status,'gateway_status_unavailable');
 assert.equal(failed.cliVersion,'2026.10.6');
 assert.doesNotMatch(JSON.stringify(failed),/VERY_PRIVATE/);
});
