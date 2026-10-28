#!/usr/bin/env node
// Fixed native CUA read-only task for the existing ChatGPT Worker dispatcher.
// No user-supplied node, action, paths, params, app/window IDs or shell.
// Provider identity is checked before and after ONE existing native cursor read.
import {homedir} from 'node:os';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {realpath} from 'node:fs/promises';
import {inspectComputerProvider} from './openclaw-computer-provider-readiness.mjs';
import {inspectNativeComputerRead} from './openclaw-native-computer-readonly-smoke.mjs';
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(homedir(),'Library','Application Support','ioant-openclaw-ops','runtime');
const AUDIT='IOANT_NATIVE_CUA_AGENT_READONLY';
const BASE=Object.freeze({audit:AUDIT,schemaVersion:1,readOnly:true,
 requestedAction:'get_cursor_position',browserAccess:false,
 chatContentRead:false,screenshotTaken:false,desktopInput:false,
 appOrWindowInventoryCalled:false,backgroundWriteRequested:false,
 providerGenerationVerified:false,computerOwnerReleasedVerified:false,
 noAutomaticRetry:true});
export function validCuaProvider(report){
 return report?.state==='observed'&&report?.readOnly===true&&
  report?.descriptorSchemaValid===true&&
  report?.providerIndependentlyConfirmed===true&&
  report?.canonicalProviderId==='cua-computer'&&
  report?.computerAdvertised===true;
}
export function validNativeCursorRead(report){
 return report?.state==='observed'&&report?.reason==='native_read_completed'&&
  report?.readOnly===true&&report?.invokedComputerAct===true&&
  report?.requestedAction==='get_cursor_position'&&
  report?.mutatedDesktop===false&&
  report?.browserAccess===false&&report?.chatContentRead===false;
}
export async function inspectNativeCuaAgent({
 provider=inspectComputerProvider,native=inspectNativeComputerRead,
 runtimeAllowed=async()=>process.platform==='darwin'&&
  ROOT===RUNTIME&&await realpath(RUNTIME)===RUNTIME
}={}){
 try{
  if(!await runtimeAllowed())return {...BASE,state:'blocked',
   reason:'private_macos_runtime_required',nativeAttempted:false};
  const before=await provider();
  if(!validCuaProvider(before))return {...BASE,state:'blocked',
   reason:'verified_cua_provider_required',nativeAttempted:false};
  // Uses its own fresh execution ID and a matching close, never an
  // unknown shared owner. Do not retry a refused/uncertain native call.
  let nativeResult;
  try{nativeResult=await native();}
  catch{return {...BASE,state:'inconclusive',reason:'native_read_unavailable',
   nativeAttempted:true};}
  if(!validNativeCursorRead(nativeResult))
   return {...BASE,state:'inconclusive',reason:'native_read_not_verified',
    nativeAttempted:nativeResult?.invokedComputerAct===true,
    ownExecutionCloseAcknowledged:nativeResult?.ownExecutionClosure?.acknowledged===true};
  let after;
  try{after=await provider()}
  catch{return {...BASE,state:'inconclusive',reason:'postread_provider_unavailable',
   nativeAttempted:true};}
  if(!validCuaProvider(after))return {...BASE,state:'inconclusive',
   reason:'postread_provider_identity_changed',nativeAttempted:true};
  return {...BASE,state:'observed',reason:'native_cua_readonly_completed',
   nativeAttempted:true,providerConfirmedBeforeAndAfter:true,
   ownExecutionCloseAcknowledged:nativeResult?.ownExecutionClosure?.acknowledged===true};
 }catch{return {...BASE,state:'inconclusive',reason:'native_cua_readiness_unavailable',
  nativeAttempted:false};}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=process.argv.length===2?await inspectNativeCuaAgent():
  {...BASE,state:'blocked',reason:'no_runtime_arguments_allowed'};
 process.stdout.write(JSON.stringify(result)+'\n');
 if(result.state!=='observed')process.exitCode=1;
}
