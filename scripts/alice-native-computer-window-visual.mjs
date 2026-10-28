#!/usr/bin/env node
// One-shot exact AliceAI native Chrome window IMAGE capture via Computer Use.
// No browser DOM/Relay, clicks, typing, chat sends, model calls or workflow edits.
// Private image stays on the user's Mac; only hash, dimensions and file path report.
import {execFileSync} from 'node:child_process';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {homedir} from 'node:os';
import {resolve,join} from 'node:path';
import {realpath,lstat,open} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chooseConnectedMacNode,extractBoundedImage} from './openclaw-mac-visual.mjs';
import {chromeAppleScript,verifyChromeTarget,selectNativeWindow} from
 './alice-native-browser-readonly.mjs';
import {walkNativePayload} from './openclaw-cua-fixture-native-observe.mjs';
import {scopedCloseRequest} from './openclaw-cua-owned-session-guard.mjs';
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const RUNTIME=join(homedir(),'Library','Application Support','ioant-openclaw-ops','runtime');
const CLI=join(homedir(),'.openclaw','bin','openclaw');
const AUDIT='IOANT_ALICE_NATIVE_COMPUTER_WINDOW_VISUAL';
const base=()=>({audit:AUDIT,schemaVersion:1,readOnly:true,
 screenshotTaken:false,browserRelayUsed:false,browserDomRead:false,
 computerInput:false,chatMessageSent:false,workflowMutated:false,
 localOnly:true,chatContentEmitted:false,modelInvoked:false,
 windowIdentityRechecked:false});
const id=x=>typeof x==='string'&&x.length>=3&&x.length<=1024;
export function visualReadArgs(nodeId,executionId,windowRef){
 if(!id(nodeId)||!id(executionId)||!id(windowRef))
  throw Error('invalid_native_references');
 return ['nodes','invoke','--node',nodeId,'--command','computer.act',
  '--params',JSON.stringify({action:'get_window_state',executionId,
   windowRef,includeScreenshot:true}),'--json'];
}
// The node result may wrap the image in its details/screenshot/observation
// envelope. Scan just these provider-owned result branches, never dump them.
export function extractWindowImage(raw){
 const queue=[raw],seen=new Set();
 for(let depth=0;depth<5&&queue.length;depth++){
  const n=queue.length;
  for(let i=0;i<n;i++){
   const x=queue.shift();
   if(!x||typeof x!=='object'||seen.has(x))continue;
   seen.add(x);
   try{return extractBoundedImage(x)}catch{}
   for(const k of ['result','details','screenshot','image','observation',
     'content','payload','data','response','output','value']){
    if(x[k]&&typeof x[k]==='object')queue.push(x[k]);
   }
  }
 }
 throw Error('window_image_not_delivered');
}
async function writeOwnerImage(bytes,format){
 const dir=join(homedir(),'Desktop');
 const st=await lstat(dir);
 if(!st.isDirectory()||st.isSymbolicLink())throw Error('desktop_unavailable');
 const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\..*$/,'Z');
 const name='IOANT-Alice-Window-Visual-'+stamp+'-'+randomBytes(5).toString('hex')+'.'+format;
 const file=join(dir,name);
 const fh=await open(file,'wx',0o600);
 try{await fh.writeFile(bytes);await fh.sync()}finally{await fh.close()}
 const saved=await lstat(file);
 if(!saved.isFile()||saved.isSymbolicLink()||(saved.mode&0o077)!==0||
  saved.size!==bytes.length)throw Error('private_file_unverified');
 return file;
}
export async function captureAliceWindow({cli,readOS,uuid=randomUUID,save=writeOwnerImage}={}){
 const out=base();
 if(process.platform!=='darwin'||ROOT!==RUNTIME||await realpath(RUNTIME)!==RUNTIME)
  return {...out,state:'blocked',reason:'private_runtime_required'};
 const run=cli??((args,timeout=30000)=>JSON.parse(execFileSync(CLI,args,{
  encoding:'utf8',timeout,maxBuffer:32*1024*1024,
  stdio:['ignore','pipe','pipe']})));
 const os=readOS??(()=>execFileSync('/usr/bin/osascript',
  ['-e',chromeAppleScript()],{encoding:'utf8',timeout:7000,maxBuffer:8192,
  stdio:['ignore','pipe','pipe']}));
 let node=null,execId=null,opened=false;
 try{
  const before=verifyChromeTarget(os());
  if(!before||before.targetActive!==true)
   return {...out,state:'blocked',reason:'exact_alice_tab_not_active'};
  const status=run(['nodes','status','--json'],20000);
  const selected=chooseConnectedMacNode(status);
  const rows=(status.result??status).nodes;
  const info=rows.find(x=>x?.connected===true&&
   (x.nodeId===selected.id||x.id===selected.id));
  if(info?.computerUse?.provider?.id!=='cua-computer'||
     info.computerUse?.contractVersion!==2||
     !['list_windows','get_window_state'].every(x=>
      info.computerUse?.actions?.includes(x)))
   return {...out,state:'blocked',reason:'native_window_provider_unavailable'};
  node=selected.id;execId=uuid();opened=true;
  const windows=run(['nodes','invoke','--node',node,'--command','computer.act',
   '--params',JSON.stringify({action:'list_windows',executionId:execId}),
   '--json'],30000);
  if(windows?.ok!==true)
   return {...out,state:'inconclusive',reason:'window_list_not_confirmed'};
  const match=selectNativeWindow(windows,before.title);
  if(match.state!=='matched')
   return {...out,state:'inconclusive',reason:'exact_chrome_window_unverified'};
  const snapshot=run(visualReadArgs(node,execId,match.windowRef),45000);
  if(snapshot?.ok!==true)
   return {...out,state:'inconclusive',reason:'native_window_visual_refused'};
  const observations=new Set(walkNativePayload(snapshot)
   .map(x=>x?.observationId).filter(id));
  if(observations.size!==1)
   return {...out,state:'inconclusive',reason:'window_observation_unverified'};
  const after=verifyChromeTarget(os());
  if(!after||after.targetActive!==true||after.title!==before.title)
   return {...out,state:'blocked',reason:'active_tab_identity_changed'};
  const image=extractWindowImage(snapshot);
  const file=await save(image.bytes,image.format);
  return {...out,state:'captured',screenshotTaken:true,
   windowIdentityRechecked:true,file,format:image.format,
   width:image.width,height:image.height,
   bytes:image.bytes.length,
   imageSha256:createHash('sha256').update(image.bytes).digest('hex'),
   composerIdentityVerified:false,chatDeliveryAuthorized:false};
 }catch{
  return {...out,state:'inconclusive',reason:'native_visual_capture_unavailable'};
 }finally{
  if(opened&&node&&execId){
   let acknowledged=false;
   try{
    const x=run(scopedCloseRequest(node,execId),15000);
    acknowledged=x?.ok===true||x?.result?.ok===true;
   }catch{}
   console.log(JSON.stringify({audit:'IOANT_ALICE_NATIVE_VISUAL_CLOSE',
    closeAttempted:true,closeAcknowledged:acknowledged,
    ownerReleaseVerified:false}));
  }
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let r;
 try{r=process.argv.length===2?await captureAliceWindow():
  {...base(),state:'blocked',reason:'unexpected_args'}}catch{
  r={...base(),state:'inconclusive',reason:'preflight_unavailable'};}
 console.log(JSON.stringify(r));
 if(r.state!=='captured')process.exitCode=1;
}
