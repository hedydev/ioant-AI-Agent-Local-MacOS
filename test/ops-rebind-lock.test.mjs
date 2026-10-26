import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,statSync,chmodSync,
 symlinkSync,appendFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chatKey} from '../stage2/protocol.mjs';
import {inspectOldWatchLock} from '../stage2/ops-rebind.mjs';

const OLD='https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/6add3565-d868-83ec-804e-1e7a00eb0a59';
const identity=()=>({pid:79690,startedAt:'2026-10-26T09:23:06.718Z',nonce:randomUUID()});
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'ioant-rebind-lock-'));
 const file=join(root,'chatgpt-loop',chatKey(OLD),'watch.lock');
 mkdirSync(dirname(file),{recursive:true,mode:0o700});
 const write=(value=identity())=>{writeFileSync(file,JSON.stringify(value)+'\n',{mode:0o600});return value;};
 return {root,file,write,clear:()=>rmSync(root,{recursive:true,force:true})};
}
test('known dead PID allows read-only preservation without unlinking old lock or state',async()=>{
 const f=fixture();
 try{
  const id=f.write();
  const oldState=join(dirname(f.file),'state.json');
  writeFileSync(oldState,'{"feedbackPending":"KEEP"}',{mode:0o600});
  const before=readFileSync(f.file);
  const result=await inspectOldWatchLock(OLD,{root:f.root,probe:pid=>pid===id.pid});
  assert.equal(result.state,'orphan');
  assert.equal(result.pid,id.pid);
  assert.equal(result.nonce,id.nonce);
  assert.deepEqual(readFileSync(f.file),before);
  assert.equal(readFileSync(oldState,'utf8'),'{"feedbackPending":"KEEP"}');
 }finally{f.clear();}
});
test('absent old lock is allowed; no files or state are created',async()=>{
 const f=fixture();
 try{
  assert.deepEqual(await inspectOldWatchLock(OLD,{root:f.root}),{state:'absent'});
  assert.throws(()=>statSync(f.file),{code:'ENOENT'});
 }finally{f.clear();}
});
test('live or uncertain PID must never be treated as orphan',async()=>{
 const f=fixture();
 try{
  f.write();
  await assert.rejects(inspectOldWatchLock(OLD,{root:f.root,probe:()=>false}),/old_lock_owner_not_proven_dead/);
  assert.equal(statSync(f.file).isFile(),true);
 }finally{f.clear();}
});
test('recovery guard, invalid PID and malformed lock all fail closed',async()=>{
 const f=fixture();
 try{
  f.write();
  const guard=join(dirname(f.file),'watch.lock.recovery');
  writeFileSync(guard,'',{mode:0o600});
  await assert.rejects(inspectOldWatchLock(OLD,{root:f.root,probe:()=>true}),/old_lock_recovery_present/);
  rmSync(guard);
  f.write({...identity(),pid:0});
  await assert.rejects(inspectOldWatchLock(OLD,{root:f.root,probe:()=>true}),/old_lock_untrusted/);
  writeFileSync(f.file,'not-json',{mode:0o600});
  await assert.rejects(inspectOldWatchLock(OLD,{root:f.root,probe:()=>true}),/old_lock_untrusted/);
 }finally{f.clear();}
});
test('world-readable or symlinked old lock must fail closed',async()=>{
 const f=fixture();
 try{
  f.write();
  chmodSync(f.file,0o644);
  await assert.rejects(inspectOldWatchLock(OLD,{root:f.root,probe:()=>true}),/old_lock_untrusted/);
  rmSync(f.file);
  const outside=join(f.root,'outside');
  writeFileSync(outside,JSON.stringify(identity()),{mode:0o600});
  symlinkSync(outside,f.file);
  await assert.rejects(inspectOldWatchLock(OLD,{root:f.root,probe:()=>true}),/old_lock_untrusted/);
 }finally{f.clear();}
});
test('lock changing after initial dead-PID observation blocks rebind',async()=>{
 const f=fixture();
 try{
  f.write();
  let probes=0;
  await assert.rejects(inspectOldWatchLock(OLD,{
   root:f.root,
   probe:()=>{
    probes++;
    if(probes===1)appendFileSync(f.file,' ');
    return true;
   }
  }),/old_lock_changed_or_owner_unverified/);
  assert.equal(probes,1);
  assert.equal(statSync(f.file).isFile(),true);
 }finally{f.clear();}
});
