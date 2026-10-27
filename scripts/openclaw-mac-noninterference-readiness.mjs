#!/usr/bin/env node
// One-shot meta-readiness report; never perform mouse/keyboard/browser input.
// Provider audit is strictly status-only. Optionally replays ONE read-only
// list_apps action when provider has not explicitly declared it unavailable.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectComputerProvider} from './openclaw-computer-provider-readiness.mjs';
import {inspectNativeAppInventory} from './openclaw-native-app-inventory-readonly.mjs';
const AUDIT='IOANT_MAC_NONINTERFERENCE_READINESS';
export async function auditNonInterferingComputer({
 providerScan=inspectComputerProvider,appsScan=inspectNativeAppInventory
}={}){
 let provider;
 try{provider=await providerScan();}
 catch{return {audit:AUDIT,schemaVersion:1,state:'inconclusive',
   reason:'provider_scan_failed',readOnly:true,changedDesktop:false,
   changedBrowser:false,backgroundControlProven:false,
   listApps:{state:'skipped'}};}
 if(!provider||typeof provider!=='object')
  return {audit:AUDIT,schemaVersion:1,state:'inconclusive',
   reason:'invalid_provider_result',readOnly:true,changedDesktop:false,
   changedBrowser:false,backgroundControlProven:false,
   listApps:{state:'skipped'}};
 const base={audit:AUDIT,schemaVersion:1,readOnly:true,
  browserAccess:false,chatContentRead:false,changedBrowser:false,
  changedDesktop:false,performedPointerOrKeyboardInput:false,
  backgroundControlProven:false,
  provider:provider.provider??'unknown',
  computerAdvertised:provider.computerAdvertised===true,
  providerIndependentlyConfirmed:provider.providerIndependentlyConfirmed===true,
  backgroundDeliveryAdvertised:provider.backgroundDeliveryAdvertised===true,
  listAppsAdvertised:provider.listAppsAdvertised??null,
  descriptorAvailable:provider.descriptorAvailable===true,
  descriptorSchemaValid:provider.descriptorSchemaValid===true,
  agentCursorAdvertised:provider.agentCursorAdvertised===true};
 if(provider.state!=='observed')return {...base,state:'inconclusive',
  reason:'provider_status_not_verified',listApps:{state:'skipped'}};
 if(!base.computerAdvertised)return {...base,state:'blocked',
  reason:'computer_not_advertised',listApps:{state:'skipped'}};
 if(!base.providerIndependentlyConfirmed||!base.descriptorSchemaValid)
  return {...base,state:'observed',
   reason:'provider_descriptor_not_verified',
   listApps:{state:'skipped',reason:'unverified_provider'}};
 if(base.listAppsAdvertised!==true)
  return {...base,state:'observed',
   reason:'list_apps_not_advertised',
   listApps:{state:'skipped',reason:'not_advertised'}};
 let result;
 try{result=await appsScan();}
 catch{result={state:'inconclusive',reason:'app_inventory_probe_failed'};}
 // Explicit output field whitelist. Any raw app data is discarded.
 const listApps={state:['observed','inconclusive','blocked','refused'].includes(result?.state)?
  result.state:'inconclusive',reason:typeof result?.reason==='string'&&
  /^[a-z_]{3,70}$/.test(result.reason)?result.reason:'unclassified'};
 if(typeof result?.errorClass==='string'&&/^[a-z_]{3,70}$/.test(result.errorClass))
  listApps.errorClass=result.errorClass;
 if(typeof result?.nativeCode==='string'&&/^(COMPUTER|NODE|ACCESSIBILITY)_[A-Z_]{3,72}$/.test(result.nativeCode))
  listApps.nativeCode=result.nativeCode;
 if(Number.isInteger(result?.cliExitCode)&&result.cliExitCode>=0&&result.cliExitCode<=255)
  listApps.cliExitCode=result.cliExitCode;
 return {...base,state:'observed',
  reason:listApps.state==='observed'?'native_apps_read_completed':
    'native_apps_read_not_confirmed',
  listApps};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=process.argv.length===2?await auditNonInterferingComputer():
  {audit:AUDIT,state:'blocked',reason:'unsupported_arguments'};
 console.log(JSON.stringify(result));
 if(result.state!=='observed')process.exitCode=1;
}
