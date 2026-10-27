#!/usr/bin/env node
// CUA fixture Swift toolchain forensics. Three compiler-only stages.
// No app launch, computer.act, browser automation, screenshots, or UI input.
// Do not emit compiler stderr, home paths, app/window titles or environment.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {realpath,readFile,mkdir,mkdtemp,rm,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const exec=promisify(execFile);
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const HOME=homedir();
const RUNTIME=join(HOME,'Library','Application Support','ioant-openclaw-ops','runtime');
const FIXTURES=join(HOME,'Library','Application Support','ioant-openclaw-ops','fixtures');
const SOURCE=join(ROOT,'fixtures','cua-noninterference','Fixture.swift');
const AUDIT='IOANT_CUA_SWIFT_COMPILER_FORENSICS';
const hash=x=>createHash('sha256').update(x).digest('hex').slice(0,16);
export function summarizeSwiftCompilerFailure(error){
 const stderr=typeof error?.stderr==='string'?error.stderr.slice(0,65536):'';
 const stdout=typeof error?.stdout==='string'?error.stdout.slice(0,65536):'';
 const combined=stderr+'\n'+stdout;
 const raw=combined.toLowerCase();
 const reason=error?.killed===true||error?.code==='ETIMEDOUT'?'timeout':
   error?.code==='EACCES'||error?.code==='EPERM'?'access_denied':
   error?.code==='ENOENT'?'tool_missing':
   /no such module ['"]?appkit|cannot find .*appkit|module .*appkit.*not found/.test(raw)?'appkit_module_missing':
   /cannot load.*sdk|sdk.*not found|invalid.*sdk|xcrun: error|active developer path|xcode-select/.test(raw)?'sdk_or_xcode_path':
   /could not load.*swift.*module|failed to load module|unable to load standard library|swiftmodule/.test(raw)?'swift_module_loading':
   /linker command failed|undefined symbols|ld:|clang: error/.test(raw)?'linker_failed':
   /permission denied|operation not permitted|sandbox|read-only file system/.test(raw)?'filesystem_denied':
   /error:\s*(?:expected|unterminated|extraneous|consecutive|invalid redeclaration|expressions are not allowed|statements are not allowed|cannot find '\)' to match|unclosed)/.test(raw)?'swift_syntax_error':
   /error:\s*(?:value of type|type .* has no member|no exact matches|cannot find|cannot convert|ambiguous use|argument passed|missing argument|cannot assign|instance member|overriding declaration|requires)/.test(raw)?'swift_type_error':
   /\berror:/.test(raw)?'swift_other_diagnostic':
   combined.length===1?'no_compiler_output':'unrecognized_compiler_failure';
 // Only fixture source locations, never paths or compiler messages.
 const lines=[...combined.matchAll(/Fixture\.swift:(\d{1,3}):\d{1,3}:\s*(?:error|fatal error):/g)]
  .slice(0,4).map(m=>Number(m[1])).filter(n=>n>0&&n<300);
 return Object.freeze({category:reason,
   exitCode:Number.isInteger(error?.code)&&error.code>=0&&error.code<=255?error.code:null,
   compilerOutputBytes:Buffer.byteLength(combined)-1,
   compilerOutputDigest:hash(combined),
   fixtureErrorLines:[...new Set(lines)]});
}
async function invoke(run,bin,args,timeout=30000){
 try{await run(bin,args,{cwd:RUNTIME,shell:false,timeout,maxBuffer:65536});
  return {state:'passed'};}
 catch(error){return {state:'failed',
  diagnosis:summarizeSwiftCompilerFailure(error)};}
}
export async function diagnoseCUAFixture({run=exec,platform=process.platform,
 runtimeCheck=async()=>ROOT===RUNTIME&&await realpath(RUNTIME)===RUNTIME}={}){
 const base={audit:AUDIT,schemaVersion:1,readOnlyDesktop:true,
  launchedFixture:false,calledComputerAct:false,changedBrowser:false,
  movedPointer:false,changedFocus:false};
 let temp=null;
 try{
  if(platform!=='darwin'||!await runtimeCheck())
   return {...base,state:'blocked',reason:'private_macos_runtime_required'};
  const st=await lstat(SOURCE);
  if(!st.isFile()||st.isSymbolicLink())
   return {...base,state:'blocked',reason:'fixture_source_invalid'};
  const source=await readFile(SOURCE,'utf8');
  if(!source.includes('IOANT CUA Noninterference Fixture')||
     !source.includes('.seconds(120)'))
   return {...base,state:'blocked',reason:'unexpected_fixture_source'};
  const tool=await invoke(run,'/usr/bin/xcrun',['--find','swiftc'],12000);
  if(tool.state==='failed')return {...base,state:'inconclusive',
   failedStage:'swift_lookup',diagnosis:tool.diagnosis};
  // Lookup and invocation go through the standard Apple tool resolver.
  const steps=[
   {name:'swift_parse',args:['swiftc','-frontend','-parse',SOURCE]},
   {name:'appkit_typecheck',args:['swiftc','-typecheck',SOURCE]}
  ];
  for(const step of steps){
   const result=await invoke(run,'/usr/bin/xcrun',step.args,45000);
   if(result.state==='failed')return {...base,state:'inconclusive',
      failedStage:step.name,diagnosis:result.diagnosis};
  }
  await mkdir(FIXTURES,{recursive:true,mode:0o700});
  const dir=await lstat(FIXTURES);
  if(!dir.isDirectory()||dir.isSymbolicLink()||
     (dir.mode&0o077)!==0||
     (typeof process.getuid==='function'&&dir.uid!==process.getuid()))
   return {...base,state:'blocked',reason:'fixture_private_directory_required'};
  temp=await mkdtemp(join(FIXTURES,'.compile-diagnostic-'));
  const binary=join(temp,'ioant-cua-fixture-check');
  const final=await invoke(run,'/usr/bin/xcrun',['swiftc',SOURCE,'-o',binary],60000);
  if(final.state==='failed')return {...base,state:'inconclusive',
   failedStage:'swift_link',diagnosis:final.diagnosis};
  return {...base,state:'compiled',parsePassed:true,typecheckPassed:true,
   linkPassed:true,noExecutableLaunched:true};
 }catch(error){
  return {...base,state:'inconclusive',failedStage:'local_diagnostic',
   diagnosis:summarizeSwiftCompilerFailure(error)};
 }finally{
  if(temp)await rm(temp,{recursive:true,force:true}).catch(()=>{});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=process.argv.length===2?await diagnoseCUAFixture():
  {audit:AUDIT,state:'blocked',reason:'arguments_not_supported'};
 console.log(JSON.stringify(result));
 if(result.state!=='compiled')process.exitCode=1;
}
