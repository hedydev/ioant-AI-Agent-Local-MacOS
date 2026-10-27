#!/usr/bin/env node
// IOANT Mac visual helper: short, pinned, operator-invoked CLI.
// Read-only node inspection, or ONE explicit screen snapshot. No computer.act,
// browser navigation, clicks, text entry, service restarts or model invocation.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile,realpath,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {randomBytes,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile);
const HOME=homedir();
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(HOME,'Library','Application Support','ioant-openclaw-ops','runtime');
const CLI=join(HOME,'.openclaw','bin','openclaw');
const AUDIT='IOANT_MAC_VISUAL_NODE';
const MAX_IMAGE_BYTES=8*1024*1024;
const json=x=>JSON.parse(x);
const id=x=>typeof x==='string'&&x.length>0&&x.length<256;
const fail=(ok,why)=>{if(!ok)throw Error(why)};
export function chooseConnectedMacNode(raw){
 const body=raw?.result??raw;
 const nodes=body?.nodes??[];
 fail(Array.isArray(nodes),'invalid_node_list');
 // Status rows may use nodeId (Gateway identity) rather than id. An
 // activeNodeId also denotes computer presence, not a grant or mandatory
 // unique selector. Select only a unique connected macOS node; where
 // multiple exist, require exactly one explicit active ID match.
 const macs=nodes.filter(x=>x&&x.connected===true&&
   typeof x.platform==='string'&&/^macos\b/i.test(x.platform));
 fail(macs.length>0,'connected_macos_node_missing');
 const active=body?.activeNodeId;
 const activeMatches=id(active)?macs.filter(n=>
   n.nodeId===active||n.id===active):[];
 let node,selection;
 if(activeMatches.length===1){
  node=activeMatches[0];
  selection='active_connected_mac';
 }else if(macs.length===1){
  node=macs[0];
  selection='unique_connected_mac';
 }else{
  throw Error('ambiguous_connected_mac_nodes');
 }
 // Prefer the documented Gateway nodeId to legacy id, but never guess from
 // a display name, IP address or data from a disconnected/other-platform node.
 const nodeId=id(node.nodeId)?node.nodeId:id(node.id)?node.id:null;
 fail(nodeId!==null,'mac_node_identifier_missing');
 const cmds=[node.commands,node.capabilities,node.supportedCommands];
 const text=JSON.stringify(cmds);
 return Object.freeze({id:nodeId,platform:node.platform,selection,
   identifierField:id(node.nodeId)?'nodeId':'id',
   snapshotAdvertised:text.includes('screen.snapshot'),
   computerActAdvertised:text.includes('computer.act')});
}
export function extractBoundedImage(raw){
 const seen=new Set();
 function walk(x,depth=0){
  if(depth>8||x==null)return null;
  if(typeof x==='string'){
   if(x.length>20_000_000)return null;
   if(!x.trim().startsWith('{')&&!x.trim().startsWith('['))return null;
   try{return walk(JSON.parse(x),depth+1)}catch{return null}
  }
  if(typeof x!=='object'||seen.has(x))return null;
  seen.add(x);
  if(Array.isArray(x)){
   for(const v of x){const y=walk(v,depth+1);if(y)return y}
   return null;
  }
  if(typeof x.base64==='string'&&x.base64.length>0&&
     x.base64.length<=Math.ceil(MAX_IMAGE_BYTES*4/3)+100&&
     /^(jpeg|jpg|png)$/i.test(x.format??'')){
   const format=x.format.toLowerCase();
   const bytes=Buffer.from(x.base64,'base64');
   const jpeg=bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
   const png=bytes.length>=8&&bytes.subarray(0,8).equals(
      Buffer.from([137,80,78,71,13,10,26,10]));
   fail(bytes.length>0&&bytes.length<=MAX_IMAGE_BYTES&&
     ((format==='jpg'||format==='jpeg')?jpeg:png),'image_encoding_unverified');
   return {format:format==='png'?'png':'jpg',bytes,
     width:Number.isInteger(x.width)?x.width:null,
     height:Number.isInteger(x.height)?x.height:null};
  }
  for(const key of ['result','payload','data','response','content','output','value']){
   const v=walk(x[key],depth+1);if(v)return v;
  }
  return null;
 }
 const found=walk(raw);
 fail(found,'snapshot_payload_unavailable');
 return found;
}
async function callCli(args,timeout=20000,maxBuffer=1024*1024){
 try{
  const {stdout}=await exec(CLI,args,{cwd:RUNTIME,timeout,maxBuffer,
   shell:false,windowsHide:true});
  return json(stdout);
 }catch{
  throw Error('openclaw_cli_unavailable_or_rejected');
 }
}
function stamp(){
 return new Date().toISOString().replace(/[-:]/g,'').replace(/\..*Z$/,'Z');
}
async function saveDesktop(prefix,extension,data){
 const desktop=join(HOME,'Desktop');
 const st=await lstat(desktop);
 fail(st.isDirectory()&&!st.isSymbolicLink(),'desktop_unavailable');
 const filename=prefix+'-'+stamp()+'-'+randomBytes(4).toString('hex')+'.'+extension;
 const path=join(desktop,filename);
 await writeFile(path,data,{flag:'wx',mode:0o600});
 return path;
}
export async function macVisualTask(mode){
 fail(['inspect','capture'].includes(mode),'unsupported_operation');
 fail(ROOT===RUNTIME&&await realpath(RUNTIME)===RUNTIME,'private_runtime_required');
 const selected=chooseConnectedMacNode(await callCli(['nodes','status','--json']));
 const base={audit:AUDIT,mode,connected:true,
  platform:selected.platform,selection:selected.selection,
  identifierField:selected.identifierField,snapshotAdvertised:selected.snapshotAdvertised,
  computerActAdvertised:selected.computerActAdvertised,
  invokedComputerAct:false,changedBrowser:false};
 if(mode==='inspect')return {...base,state:'observed'};
 fail(selected.snapshotAdvertised,'screen_snapshot_not_advertised');
 // No alternate browser or CDP route; invoke the already-paired macOS node once.
 const raw=await callCli(['nodes','invoke','--node',selected.id,
   '--command','screen.snapshot',
   '--params',JSON.stringify({screenIndex:0,format:'jpeg',maxWidth:1280,quality:0.75}),
   '--json'],65000,32*1024*1024);
 const image=extractBoundedImage(raw);
 const file=await saveDesktop('IOANT-Mac-Visual-Snapshot',''+image.format,image.bytes);
 return {...base,state:'captured',file,bytes:image.bytes.length,
   imageSha256:createHash('sha256').update(image.bytes).digest('hex'),
   width:image.width,height:image.height};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const argv=process.argv.slice(2);
 const mode=argv.length===1?argv[0]:'';
 let result;
 try{result=await macVisualTask(mode);}
 catch(e){
  const publicErrors=new Set(['unsupported_operation','private_runtime_required',
   'connected_macos_node_missing','ambiguous_connected_mac_nodes',
   'mac_node_identifier_missing','screen_snapshot_not_advertised',
   'snapshot_payload_unavailable','image_encoding_unverified','desktop_unavailable']);
  result={audit:AUDIT,state:'blocked',reason:publicErrors.has(e.message)?
   e.message:'preflight_or_capture_failed',invokedComputerAct:false};
  process.exitCode=1;
 }
 // Never print image bytes or other node data. Owner-only Desktop log.
 try{
  const log=await saveDesktop('IOANT-Mac-Visual-Result','log',
    JSON.stringify(result)+'\n');
  console.log(JSON.stringify({...result,log}));
 }catch{
  console.log(JSON.stringify(result));
  process.exitCode=1;
 }
}
