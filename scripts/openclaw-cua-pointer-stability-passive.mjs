#!/usr/bin/env node
// Read-only launch-free pointer stability probe using the already built
// IOANT-owned AppKit fixture's --state option. No GUI launch, screenshot,
// browser, native computer.act, keyboard/mouse commands or raw coordinates.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {lstat,realpath,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const exec=promisify(execFile);
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const HOME=homedir();
const RUNTIME=join(HOME,'Library','Application Support','ioant-openclaw-ops','runtime');
const FIXTURES=join(HOME,'Library','Application Support','ioant-openclaw-ops','fixtures');
const NAME='IOANT-CUA-Noninterference-Fixture.app';
const FILE='ioant-cua-fixture';
const BUNDLE_ID='ai.ioant.cua.noninterference.fixture';
const AUDIT='IOANT_CUA_LAUNCH_FREE_POINTER_STABILITY';
const SAMPLE_COUNT=12;
const BASE={audit:AUDIT,schemaVersion:1,readOnly:true,
 fixtureLaunched:false,guiLaunched:false,invokedComputerAct:false,
 browserAccess:false,screenCapture:false,desktopInput:false,
 rawMouseCoordinatesReturned:false,frontmostApplicationReturned:false,
 changedPermissions:false,restartedServices:false};
const fail=reason=>Object.assign(new Error(reason),{safeReason:reason});
const owned=st=>typeof process.getuid!=='function'||st.uid===process.getuid();
export function summarizeStateSamples(samples){
 if(!Array.isArray(samples)||samples.length<2||samples.length>32)
  return {...BASE,state:'inconclusive',reason:'insufficient_or_invalid_samples'};
 const valid=samples.every(s=>typeof s?.frontmost==='string'&&
  s.frontmost.length>0&&s.frontmost.length<=1024&&
  Number.isFinite(s.mouseX)&&Number.isFinite(s.mouseY));
 if(!valid)return {...BASE,state:'inconclusive',reason:'invalid_state_sample'};
 let frontmostChanges=0,pointerChanges=0,maximum=0;
 let subpixelSteps=0;
 for(let i=1;i<samples.length;i++){
  const before=samples[i-1],after=samples[i];
  if(before.frontmost!==after.frontmost)frontmostChanges++;
  const dx=after.mouseX-before.mouseX,dy=after.mouseY-before.mouseY;
  const magnitude=Math.hypot(dx,dy);
  if(magnitude!==0){pointerChanges++;if(magnitude<1)subpixelSteps++}
  maximum=Math.max(maximum,magnitude);
 }
 const motionBand=maximum===0?'none':maximum<1?'subpixel':
  maximum<5?'under_5px':maximum<50?'under_50px':'50px_or_more';
 return {...BASE,state:'observed',reason:'launch_free_sampling_completed',
  sampleCount:samples.length,frontmostChanged:frontmostChanges>0,
  frontmostChangeSteps:frontmostChanges,pointerChanged:pointerChanges>0,
  pointerChangeSteps:pointerChanges,subpixelChangeSteps:subpixelSteps,
  largestStepBand:motionBand,
  strictlyStable:frontmostChanges===0&&pointerChanges===0,
  // Stability here cannot prove that launching a new GUI will be harmless.
  nativeCUAExecutionVerified:false,safeToWriteBackground:false};
}
async function verifyFixture(){
 const src=await readFile(join(ROOT,'fixtures','cua-noninterference','Fixture.swift'),'utf8');
 const digest=createHash('sha256').update(src).digest('hex').slice(0,16);
 const parent=join(FIXTURES,'cua-fixture-'+digest);
 const app=join(parent,NAME);
 const bundle=join(app,'Contents');
 const executableDir=join(bundle,'MacOS');
 const bin=join(executableDir,FILE);
 for(const directory of [FIXTURES,parent,app,bundle,executableDir]){
  const st=await lstat(directory);
  if(!st.isDirectory()||st.isSymbolicLink()||!owned(st))
   throw fail('private_fixture_directory_not_verified');
 }
 const st=await lstat(bin);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||!owned(st)||
  (st.mode&0o111)===0||(await realpath(bin))!==bin)
  throw fail('fixture_binary_not_verified');
 const plist=await readFile(join(bundle,'Info.plist'),'utf8');
 if(!plist.includes(BUNDLE_ID))throw fail('fixture_bundle_identity_invalid');
 return bin;
}
async function readState(binary){
 const {stdout}=await exec(binary,['--state'],{
  shell:false,timeout:7000,maxBuffer:4096,cwd:RUNTIME});
 if(stdout.length>4096)throw fail('oversized_state_reply');
 return JSON.parse(stdout);
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export async function inspectPointerStability({
 allowedRuntime=async()=>process.platform==='darwin'&&
  ROOT===RUNTIME&&await realpath(RUNTIME)===RUNTIME,
 resolveBinary=verifyFixture,read=readState,wait=pause,count=SAMPLE_COUNT
}={}){
 try{
  if(!await allowedRuntime())return {...BASE,state:'blocked',
   reason:'private_runtime_required'};
  if(!Number.isInteger(count)||count<2||count>32)
   return {...BASE,state:'blocked',reason:'unsupported_sample_count'};
  const bin=await resolveBinary();
  const samples=[];
  for(let i=0;i<count;i++){
   const response=await read(bin);
   samples.push(response);
   if(i<count-1)await wait(130);
  }
  return summarizeStateSamples(samples);
 }catch(e){
  return {...BASE,state:'inconclusive',
   reason:e?.safeReason??'passive_state_sampling_unavailable'};
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const answer=process.argv.length===2?await inspectPointerStability():
  {...BASE,state:'blocked',reason:'unsupported_arguments'};
 console.log(JSON.stringify(answer));
 if(answer.state!=='observed')process.exitCode=1;
}
