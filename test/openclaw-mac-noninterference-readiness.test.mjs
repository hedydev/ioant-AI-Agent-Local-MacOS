import test from 'node:test';
import assert from 'node:assert/strict';
import {auditNonInterferingComputer} from
 '../scripts/openclaw-mac-noninterference-readiness.mjs';

const provider=(overrides={})=>({
 state:'observed',computerAdvertised:true,provider:'unknown',
 providerIndependentlyConfirmed:false,backgroundDeliveryAdvertised:false,
 listAppsAdvertised:null,...overrides});
test('one combined scan reports provider and read-only success without app names',async()=>{
 let calls=0;
 const result=await auditNonInterferingComputer({
  providerScan:async()=>provider({provider:'cua',
   providerIndependentlyConfirmed:true,backgroundDeliveryAdvertised:true}),
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
  providerScan:async()=>provider({listAppsAdvertised:false}),
  appsScan:async()=>{calls++;return {state:'observed'};}
 });
 assert.equal(result.listApps.state,'skipped');
 assert.equal(result.reason,'list_apps_explicitly_unavailable');
 assert.equal(calls,0);
});
test('unknown provider read failure carries bounded error classification',async()=>{
 const result=await auditNonInterferingComputer({
  providerScan:async()=>provider(),
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
  providerScan:async()=>provider(),
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
