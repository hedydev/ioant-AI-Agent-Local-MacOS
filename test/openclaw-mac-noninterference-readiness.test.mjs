import test from 'node:test';
import assert from 'node:assert/strict';
import {auditNonInterferingComputer} from
 '../scripts/openclaw-mac-noninterference-readiness.mjs';

const provider=(overrides={})=>({
 state:'observed',computerAdvertised:true,provider:'unknown',
 providerIndependentlyConfirmed:false,backgroundDeliveryAdvertised:false,
 listAppsAdvertised:null,...overrides});
const verified=(extra={})=>provider({provider:'cua',
 providerIndependentlyConfirmed:true,descriptorSchemaValid:true,
 descriptorAvailable:true,listAppsAdvertised:true,
 backgroundDeliveryAdvertised:true,...extra});
test('one combined scan reports provider and read-only success without app names',async()=>{
 let calls=0;
 const result=await auditNonInterferingComputer({
  providerScan:async()=>verified(),
  appsScan:async()=>{calls++;return {state:'observed',
    reason:'native_read_completed',rawApps:[{name:'private app'}]};}
 });
 assert.equal(calls,1);
 assert.equal(result.state,'observed');
 assert.equal(result.provider,'cua');
 assert.equal(result.backgroundControlProven,false);
 assert.equal(result.listApps.state,'observed');
 assert.equal(JSON.stringify(result).includes('private app'),false);
});
test('explicitly unsupported list_apps is not invoked again',async()=>{
 let calls=0;
 const result=await auditNonInterferingComputer({
  providerScan:async()=>verified({listAppsAdvertised:false}),
  appsScan:async()=>{calls++;return {state:'observed'};}
 });
 assert.equal(result.listApps.state,'skipped');
 assert.equal(result.reason,'list_apps_not_advertised');
 assert.equal(calls,0);
});
test('verified provider read failure carries bounded error classification',async()=>{
 const result=await auditNonInterferingComputer({
  providerScan:async()=>verified(),
  appsScan:async()=>({state:'inconclusive',
   reason:'native_call_rejected_or_unavailable',
   errorClass:'unsupported_action',nativeCode:'COMPUTER_UNSUPPORTED_ACTION',
   cliExitCode:1,stdout:'private ChatGPT message'})
 });
 assert.deepEqual(result.listApps,{state:'inconclusive',
  reason:'native_call_rejected_or_unavailable',
  errorClass:'unsupported_action',
  nativeCode:'COMPUTER_UNSUPPORTED_ACTION',cliExitCode:1});
 assert.equal(JSON.stringify(result).includes('private ChatGPT'),false);
});
test('provider failure skips native call entirely',async()=>{
 let calls=0;
 const result=await auditNonInterferingComputer({
  providerScan:async()=>({state:'blocked',reason:'private failure'}),
  appsScan:async()=>{calls++;return {state:'observed'};}
 });
 assert.equal(result.state,'inconclusive');
 assert.equal(calls,0);
 assert.equal(JSON.stringify(result).includes('private failure'),false);
});
test('malicious backend error strings never reach chat report',async()=>{
 const result=await auditNonInterferingComputer({
  providerScan:async()=>verified(),
  appsScan:async()=>({state:'inconclusive',
   reason:'internal/sensitive/path',
   errorClass:'private-token-xyz',nativeCode:'TOKEN_SECRET',
   cliExitCode:999,apps:[{name:'sensitive app'}]})
 });
 assert.equal(result.listApps.reason,'unclassified');
 assert.equal(result.listApps.errorClass,undefined);
 assert.equal(result.listApps.nativeCode,undefined);
 assert.equal(JSON.stringify(result).includes('sensitive'),false);
});
test('missing Computer Control capability skips app inspection',async()=>{
 let calls=0;
 const result=await auditNonInterferingComputer({
  providerScan:async()=>provider({computerAdvertised:false}),
  appsScan:async()=>{calls++;return null;}
 });
 assert.equal(calls,0);
 assert.equal(result.reason,'computer_not_advertised');
 assert.equal(result.state,'blocked');
});

test('throwing provider probe safely skips all app reads',async()=>{
 let calls=0;
 const result=await auditNonInterferingComputer({
  providerScan:async()=>{throw Error('private gateway token');},
  appsScan:async()=>{calls++;return {state:'observed'};}
 });
 assert.equal(result.state,'inconclusive');
 assert.equal(result.reason,'provider_scan_failed');
 assert.equal(calls,0);
 assert.equal(JSON.stringify(result).includes('gateway token'),false);
});
test('throwing app probe returns safe diagnosis without raw exception',async()=>{
 const result=await auditNonInterferingComputer({
  providerScan:async()=>verified(),
  appsScan:async()=>{throw Error('private password in log');}
 });
 assert.equal(result.listApps.state,'inconclusive');
 assert.equal(result.listApps.reason,'app_inventory_probe_failed');
 assert.equal(JSON.stringify(result).includes('password'),false);
});

test('unverified descriptor skips app invocation; never guess from computer.act',async()=>{
 let called=0;
 const r=await auditNonInterferingComputer({
  providerScan:async()=>provider({provider:'unknown',listAppsAdvertised:null}),
  appsScan:async()=>{called++;return {state:'observed'};}
 });
 assert.equal(called,0);
 assert.equal(r.reason,'provider_descriptor_not_verified');
 assert.equal(r.listApps.state,'skipped');
 assert.equal(r.backgroundControlProven,false);
});
test('confirmed provider with missing action advertisement also skips native call',async()=>{
 let called=0;
 const r=await auditNonInterferingComputer({
  providerScan:async()=>verified({listAppsAdvertised:null}),
  appsScan:async()=>{called++;return {state:'observed'};}
 });
 assert.equal(called,0);
 assert.equal(r.reason,'list_apps_not_advertised');
});

test('canonical public CUA ID is forwarded without trusting background execution',async()=>{
 const result=await auditNonInterferingComputer({
  providerScan:async()=>verified({canonicalProviderId:'cua-computer',
   listAppsAdvertised:false,agentCursorAdvertised:false}),
  appsScan:async()=>{throw Error('never call');}
 });
 assert.equal(result.canonicalProviderId,'cua-computer');
 assert.equal(result.provider,'cua');
 assert.equal(result.backgroundControlProven,false);
 assert.equal(result.listApps.state,'skipped');
});
test('unrecognized provider ID is discarded from composite status',async()=>{
 const result=await auditNonInterferingComputer({
  providerScan:async()=>verified({provider:'unknown',
   providerIndependentlyConfirmed:false,
   canonicalProviderId:'private-token-or-node-path'}),
  appsScan:async()=>{throw Error('never call');}
 });
 assert.equal(result.canonicalProviderId,null);
 assert.equal(result.listApps.reason,'unverified_provider');
 assert.equal(JSON.stringify(result).includes('private-token'),false);
});
