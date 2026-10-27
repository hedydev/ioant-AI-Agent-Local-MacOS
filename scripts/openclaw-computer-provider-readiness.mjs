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
 const computer=isObj(node.computer)?node.computer:
  isObj(node.computerControl)?node.computerControl:null;
 const declared=provider(node.computerProvider??computer?.provider);
 const descriptor=isObj(computer?.descriptor)?computer.descriptor:null;
 const providerName=declared!=='unknown'?declared:
  provider(descriptor?.provider);
 const modes=descriptor?.deliveryModes??descriptor?.deliveryFamilies;
 const availableActions=descriptor?.actions??descriptor?.supportedActions;
 const backgroundAdvertised=Array.isArray(modes)&&modes.includes('background');
 const listAppsAdvertised=Array.isArray(availableActions)?
  availableActions.includes('list_apps'):null;
 const nodeHasCommands=chosen.snapshotAdvertised&&chosen.computerActAdvertised;
 return Object.freeze({
  audit:AUDIT,schemaVersion:1,state:'observed',
  readOnly:true,browserAccess:false,chatContentRead:false,
  appOrWindowInventoryCalled:false,invokedComputerAct:false,
  computerAdvertised:nodeHasCommands,
  provider:providerName,providerIndependentlyConfirmed:providerName!=='unknown',
  descriptorAvailable:descriptor!==null,
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
