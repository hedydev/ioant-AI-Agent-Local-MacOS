#!/usr/bin/env node
// Single read-only OpenClaw node status call. Safe provider metadata only.
// No browser, no app/window enumeration, no screenshots and no computer.act.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {realpath} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chooseConnectedMacNode} from './openclaw-mac-visual.mjs';
const exec=promisify(execFile);
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(homedir(),'Library','Application Support','ioant-openclaw-ops','runtime');
const CLI=join(homedir(),'.openclaw','bin','openclaw');
const AUDIT='IOANT_MAC_COMPUTER_PROVIDER_READINESS';
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const provider=x=>typeof x==='string'&&/^(cua|peekaboo)$/i.test(x)?x.toLowerCase():'unknown';
export function summarizeComputerProviderStatus(raw){
 const chosen=chooseConnectedMacNode(raw);
 const body=raw?.result??raw;
 const node=body.nodes.find(n=>n&&n.connected===true&&
   (n.nodeId===chosen.id||n.id===chosen.id));
 if(!node)throw Error('selected_node_lost');
 // Accept only explicit computer-provider metadata on the selected Mac.
 // Generic runtime/plugin/provider fields are not computer provenance.
 // Official v2 capability descriptor is node.computerUse with a nested
 // provider identity. Older nodes may omit it. Never infer provider from
 // computer.act availability or from a similarly named generic node field.
 const descriptor=isObj(node.computerUse)?node.computerUse:null;
 const schemaValid=descriptor?.contractVersion===2&&
  isObj(descriptor?.provider)&&
  typeof descriptor.provider.id==='string'&&
  typeof descriptor.provider.generation==='string'&&
  descriptor.provider.generation.length>0&&
  Array.isArray(descriptor.actions)&&
  Array.isArray(descriptor.deliveryModes);
 const providerId=schemaValid?descriptor.provider.id.toLowerCase():'';
 // Normalization is strictly a known provider family, not a substring
 // from arbitrary text supplied by an unrelated device.
 const providerName=/^(?:cua|cua-computer|macos-cua|cua-macos|cua-driver)$/.test(providerId)?'cua':
  /^(?:peekaboo|peekaboo-computer|macos-peekaboo|peekaboo-macos)$/.test(providerId)?'peekaboo':'unknown';
 const backgroundAdvertised=schemaValid&&
  descriptor.deliveryModes.includes('background');
 const listAppsAdvertised=schemaValid?
  descriptor.actions.includes('list_apps'):null;
 const nodeHasCommands=chosen.snapshotAdvertised&&chosen.computerActAdvertised;
 return Object.freeze({
  audit:AUDIT,schemaVersion:1,state:'observed',
  readOnly:true,browserAccess:false,chatContentRead:false,
  appOrWindowInventoryCalled:false,invokedComputerAct:false,
  computerAdvertised:nodeHasCommands,
  provider:providerName,providerIndependentlyConfirmed:providerName!=='unknown'&&schemaValid,
  descriptorAvailable:descriptor!==null,
  descriptorSchemaValid:schemaValid,
  descriptorContractVersion:schemaValid?2:null,
  agentCursorAdvertised:schemaValid&&descriptor.features?.agentCursor===true,
  // Only canonical public IDs; no custom identifier, provider label, or generation.
  canonicalProviderId:(providerName!=='unknown'&&schemaValid)?providerId:null,
  backgroundDeliveryAdvertised:backgroundAdvertised,
  listAppsAdvertised,
  // Advertisement is not validated execution; guard requires live proof.
  backgroundExecutionVerified:false,
  safeToControlActiveUserDesktop:false
 });
}
async function cli(args){
 const {stdout}=await exec(CLI,args,{cwd:RUNTIME,shell:false,
  timeout:18000,maxBuffer:1024*1024});
 return JSON.parse(stdout);
}
export async function inspectComputerProvider({request=cli,
 runtimeAllowed=async()=>ROOT===RUNTIME&&await realpath(RUNTIME)===RUNTIME}={}){
 try{
  if(!await runtimeAllowed())
   return {audit:AUDIT,state:'blocked',reason:'private_runtime_required',
    readOnly:true};
  return summarizeComputerProviderStatus(await request(['nodes','status','--json']));
 }catch{
  return {audit:AUDIT,state:'inconclusive',reason:'native_status_unavailable',
   readOnly:true,invokedComputerAct:false,browserAccess:false};
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=process.argv.length===2?await inspectComputerProvider():
  {audit:AUDIT,state:'blocked',reason:'unsupported_cli_args',readOnly:true};
 console.log(JSON.stringify(result));
 if(result.state!=='observed')process.exitCode=1;
}
