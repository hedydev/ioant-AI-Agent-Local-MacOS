#!/usr/bin/env node
// Prepare dedicated non-browser, auto-exiting native Mac fixture.
// This script compiles only. It NEVER launches an application or invokes
// computer.act, Chrome, AppleScript or foreground keyboard/mouse primitives.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {realpath,lstat,mkdir,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const exec=promisify(execFile);
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const HOME=homedir();
const RUNTIME=join(HOME,'Library','Application Support','ioant-openclaw-ops','runtime');
const FIXTURES=join(HOME,'Library','Application Support','ioant-openclaw-ops','fixtures');
const NAME='IOANT-CUA-Noninterference-Fixture.app';
const plist=[
 '<?xml version="1.0" encoding="UTF-8"?>',
 '<plist version="1.0"><dict>',
 '<key>CFBundleExecutable</key><string>ioant-cua-fixture</string>',
 '<key>CFBundleIdentifier</key><string>ai.ioant.cua.noninterference.fixture</string>',
 '<key>CFBundleName</key><string>IOANT CUA Fixture</string>',
 '<key>CFBundlePackageType</key><string>APPL</string>',
 '<key>NSHighResolutionCapable</key><true/>',
 '</dict></plist>'
].join('\n');
const AUDIT='IOANT_CUA_FIXTURE_PREPARATION';
const hash=s=>createHash('sha256').update(s).digest('hex');
async function safeDir(p){
 const st=await lstat(p);
 if(!st.isDirectory()||st.isSymbolicLink()||
    (st.mode&0o077)!==0||
    (typeof process.getuid==='function'&&st.uid!==process.getuid()))
  throw Error('private_fixture_directory_required');
}
export async function prepareFixture({run=exec,platform=process.platform}={}){
 const base={audit:AUDIT,schemaVersion:1,fixtureKind:'native_appkit',
  changedBrowser:false,browserAccess:false,chatContentRead:false,
  invokedComputerAct:false,desktopInput:false,launchedFixture:false};
 let stage=null;
 try{
  if(platform!=='darwin'||ROOT!==RUNTIME||await realpath(RUNTIME)!==RUNTIME)
   return {...base,state:'blocked',reason:'mac_private_runtime_required'};
  await mkdir(FIXTURES,{recursive:true,mode:0o700});
  await safeDir(FIXTURES);
  const source=join(ROOT,'fixtures','cua-noninterference','Fixture.swift');
  const code=await readFile(source,'utf8');
  if(!code.includes('IOANT CUA Noninterference Fixture')||
     !code.includes('.seconds(120)')||
     !code.includes('setActivationPolicy(.accessory)'))
   return {...base,state:'blocked',reason:'fixture_source_guard_failed'};
  const fingerprint=hash(code).slice(0,16);
  const target=join(FIXTURES,'cua-fixture-'+fingerprint);
  const existing=join(target,NAME,'Contents','MacOS','ioant-cua-fixture');
  try{
   await safeDir(target);
   const stat=await lstat(existing);
   if(!stat.isFile()||stat.isSymbolicLink())throw Error('invalid_installed_fixture');
   return {...base,state:'prepared',reused:true,sourceDigestPrefix:fingerprint};
  }catch(e){
   if(e.code!=='ENOENT')return {...base,state:'blocked',reason:'fixture_path_unsafe'};
  }
  const compiler=(await run('/usr/bin/xcrun',['--find','swiftc'],
   {timeout:12000,maxBuffer:2048})).stdout.trim();
  if(!compiler.startsWith('/'))throw Error('compiler_unavailable');
  // One scoped staging directory, renamed atomically after successful compile.
  stage=join(FIXTURES,'.stage-'+fingerprint+'-'+process.pid);
  await mkdir(join(stage,NAME,'Contents','MacOS'),{recursive:true,mode:0o700});
  await writeFile(join(stage,NAME,'Contents','Info.plist'),plist,{mode:0o600,flag:'wx'});
  const binary=join(stage,NAME,'Contents','MacOS','ioant-cua-fixture');
  await run(compiler,[source,'-o',binary],{timeout:90000,maxBuffer:8192});
  const st=await lstat(binary);
  if(!st.isFile()||st.isSymbolicLink()||st.size<10000)throw Error('compile_artifact_invalid');
  // Read-only process immediately exits. It does not create a GUI/window.
  const measured=await run(binary,['--state'],{timeout:8000,maxBuffer:2048});
  const status=JSON.parse(measured.stdout);
  if(typeof status.frontmost!=='string'||!Number.isFinite(status.mouseX)||
     !Number.isFinite(status.mouseY))throw Error('fixture_state_probe_failed');
  await rename(stage,target);
  stage=null;
  return {...base,state:'prepared',reused:false,sourceDigestPrefix:fingerprint,
    compilerFound:true,readOnlyStateProbePassed:true};
 }catch{
  return {...base,state:'inconclusive',reason:'fixture_build_or_probe_failed'};
 }finally{
  if(stage)await rm(stage,{recursive:true,force:true}).catch(()=>{});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=process.argv.length===2?await prepareFixture():
  {audit:AUDIT,state:'blocked',reason:'unsupported_arguments'};
 console.log(JSON.stringify(result));
 if(result.state!=='prepared')process.exitCode=1;
}
