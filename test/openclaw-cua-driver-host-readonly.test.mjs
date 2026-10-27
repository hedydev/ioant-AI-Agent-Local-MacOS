import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {
 safeCuaHostLogFlags,safeCuaProcessIdentity,inspectSocketRoot,
 inspectHostLogs,cuaDriverHostReadonly
} from '../scripts/openclaw-cua-driver-host-readonly.mjs';
const code=readFileSync(resolve(import.meta.dirname,'..',
 'scripts/openclaw-cua-driver-host-readonly.mjs'),'utf8');
const root='/private/test/OpenClaw/cua';
const ownedDir=(privateOnly=false)=>({
 isDirectory:()=>true,isSymbolicLink:()=>false,
 mode:privateOnly?0o40700:0o40755,uid:process.getuid()
});
const ownedSocket=()=>({
 isSocket:()=>true,isSymbolicLink:()=>false,uid:process.getuid()
});
const ownedFile=()=>({
 isFile:()=>true,isSymbolicLink:()=>false,uid:process.getuid(),size:5
});
test('unified-log messages are mapped only to fixed boolean flags',()=>{
 const out=safeCuaHostLogFlags(
  'embedded CUA ready at /Users/private/Secret/cua.sock\n'+
  'embedded CUA launch failed: secret user password\n'+
  'unrelated Safari personal document'
 );
 assert.deepEqual(out,{
  available:true,ready:true,startupTimeout:false,launchFailure:true,
  unexpectedExit:false,unbundledDriver:false,socketError:false,
  pidRecordFailure:false
 });
 assert.equal(Object.isFrozen(out),true);
 const encoded=JSON.stringify(out);
 for(const word of ['private','Secret','password','Safari','document','/Users/'])
  assert.equal(encoded.includes(word),false);
 assert.deepEqual(safeCuaHostLogFlags(null),{available:false});
});
test('only CUA daemon executable basenames match process identity',()=>{
 for(const valid of [
  'cua-driver-rs','/Applications/OpenClaw.app/Contents/MacOS/cua-driver-rs',
  '/long/path/cua-driver'
 ])assert.equal(safeCuaProcessIdentity(valid),true);
 for(const invalid of [
  'Chrome','/bin/zsh','other-cua-driver-rs','',
  '/tmp/cua-driver-rs\n/secret/password',
  'my-cua-driver','cua-driver-rs --unsafe'
 ])assert.equal(safeCuaProcessIdentity(invalid),false);
});
test('valid private CUA directory is observed without connecting a socket',async()=>{
 const dir='0123456789abcdef';
 const states={ [root]:ownedDir(),[root+'/'+dir]:ownedDir(true),
  [root+'/'+dir+'/cua.sock']:ownedSocket(),
  [root+'/'+dir+'/cua.pid']:ownedFile() };
 let psCalled=0;
 const out=await inspectSocketRoot({
  root,
  stat:async path=>{
   if(!(path in states))throw Error('missing');
   return states[path];
  },
  list:async()=>[{name:dir,isDirectory:()=>true},
   {name:'private-user-folder',isDirectory:()=>true}],
  read:async()=> '2317\n',
  ps:async(bin,args)=>{
   assert.equal(bin,'/bin/ps');
   assert.deepEqual(args,['-p','2317','-o','comm=']);
   psCalled++;
   return {stdout:'/Applications/OpenClaw.app/Contents/MacOS/cua-driver-rs'};
  }
 });
 assert.equal(out.socketRoot,'present');
 assert.equal(out.socketDirectoriesExamined,1);
 assert.equal(out.socketsPresent,1);
 assert.equal(out.pidFilesPresent,1);
 assert.equal(out.pidProcessesAlive,1);
 assert.equal(out.cuaProcessIdentityMatches,1);
 assert.equal(psCalled,1);
 assert.equal(JSON.stringify(out).includes('2317'),false);
});
test('missing or symlinked root fails closed without process probes',async()=>{
 const missing=await inspectSocketRoot({
  root,stat:async()=>{const e=Error('missing');e.code='ENOENT';throw e},
  list:async()=>{throw Error('should not enumerate')}
 });
 assert.equal(missing.socketRoot,'absent');
 const symlink=await inspectSocketRoot({
  root,stat:async()=>({
   isDirectory:()=>true,isSymbolicLink:()=>true,uid:process.getuid()
  }),
  list:async()=>{throw Error('should not enumerate')}
 });
 assert.equal(symlink.socketRoot,'unavailable');
 assert.equal(symlink.pidFilesPresent,0);
});
test('invalid PID content is never forwarded to ps or included in report',async()=>{
 const dir='1234567890abcdef';
 let psCalled=false;
 const result=await inspectSocketRoot({
  root,
  stat:async p=>p===root?ownedDir():p===root+'/'+dir?
   ownedDir(true):p.endsWith('/cua.pid')?ownedFile():ownedSocket(),
  list:async()=>[{name:dir,isDirectory:()=>true}],
  read:async()=> '1234; rm -rf /secret',
  ps:async()=>{psCalled=true;throw Error('never execute')}
 });
 assert.equal(result.pidFilesPresent,0);
 assert.equal(result.cuaProcessIdentityMatches,0);
 assert.equal(psCalled,false);
 assert.equal(JSON.stringify(result).includes('secret'),false);
});
test('log observer executes a fixed read-only predicate and never returns logs',async()=>{
 let args;
 const out=await inspectHostLogs({run:async(bin,a,opts)=>{
  assert.equal(bin,'/usr/bin/log');
  args=a;
  assert.equal(opts.shell,false);
  assert.equal(opts.timeout,15000);
  return {stdout:'embedded CUA startup timed out: secret token'};
 }});
 assert.equal(args[0],'show');
 assert.equal(args[2],'45m');
 assert.equal(args.at(-1),'subsystem == "ai.openclaw" AND category == "cua-driver-host"');
 assert.equal(out.available,true);
 assert.equal(out.startupTimeout,true);
 assert.equal(JSON.stringify(out).includes('token'),false);
 assert.deepEqual(await inspectHostLogs({run:async()=>{
  throw Error('private user error')}}),{available:false});
});
test('composed live report exposes bounded flags and refuses foreign keys',async()=>{
 const out=await cuaDriverHostReadonly({
  platform:'darwin',checkRuntime:false,
  sockets:async()=>({socketRoot:'present',socketsPresent:2,
   socketDirectoriesExamined:2,pidFilesPresent:2,pidProcessesAlive:2,
   cuaProcessIdentityMatches:2,privateWindowTitle:'private sensitive'}),
  logs:async()=>({available:true,ready:true,launchFailure:true,
   privateError:'secret'})
 });
 assert.equal(out.state,'observed');
 assert.equal(out.socketRoot,'present');
 assert.equal(out.hostLogs.ready,true);
 assert.equal(out.hostLogs.launchFailure,true);
 assert.equal(out.invokedComputerAct,false);
 assert.equal(out.driverSocketConnected,false);
 assert.equal(out.desktopInput,false);
 assert.equal(out.changedPermissions,false);
 assert.equal(out.changedServices,false);
 for(const v of ['private','secret','sensitive'])
  assert.equal(JSON.stringify(out).includes(v),false);
 const unknown=await cuaDriverHostReadonly({
  platform:'darwin',checkRuntime:false,
  sockets:async()=>{throw Error('hidden')},
  logs:async()=>{throw Error('hidden')}
 });
 assert.equal(unknown.state,'inconclusive');
 assert.equal(unknown.socketRoot,'unavailable');
 assert.equal(unknown.hostLogs.available,false);
});
test('diagnostic source contains no UI automation, capture or socket action',()=>{
 assert.match(code,/const APP_CUA=join\(homedir\(\)/);
 assert.match(code,/readOnly:true/);
 assert.match(code,/driverSocketConnected:false/);
 assert.match(code,/changedPermissions:false/);
 assert.match(code,/await ps\('\/bin\/ps'/);
 assert.match(code,/await run\('\/usr\/bin\/log'/);
 assert.doesNotMatch(code,/from ['"]node:net['"]|connect\(|spawn\(|\bkill\(/);
 assert.doesNotMatch(code,/exec\(['"]\/usr\/bin\/osascript['"]|exec\(['"]\/usr\/sbin\/screencapture['"]/);
});
