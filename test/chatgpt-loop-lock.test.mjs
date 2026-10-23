import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, lstat, chmod, rm, access, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { acquireConversationLock } from '../stage2/conversation-lock.mjs';

const fresh=()=>mkdtemp(join(tmpdir(),'ioant-loop-lock-'));
const lockFile=dir=>join(dir,'watch.lock');
const record=pid=>JSON.stringify({pid,startedAt:new Date().toISOString()})+'\n';

test('recover only prior watcher PID proven exited, then acquire and release cleanly',async()=>{
  const dir=await fresh();
  try{
    const child=spawn(process.execPath,['-e','process.exit(0)'],{stdio:'ignore'});
    const pid=child.pid;
    await once(child,'close');
    assert.ok(pid>1);
    await writeFile(lockFile(dir),record(pid),{mode:0o600});
    const release=await acquireConversationLock(dir);
    const current=JSON.parse(await readFile(lockFile(dir),'utf8'));
    assert.equal(current.pid,process.pid);
    assert.match(current.nonce,/^[a-f0-9-]{36}$/);
    await release();
    await assert.rejects(access(lockFile(dir)),{code:'ENOENT'});
    await assert.rejects(access(join(dir,'watch.lock.recovery')),{code:'ENOENT'});
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('living owner never has its lock removed or replaced',async()=>{
  const dir=await fresh();
  try{
    await writeFile(lockFile(dir),record(process.pid),{mode:0o600});
    await assert.rejects(acquireConversationLock(dir),/watch\.lock PID/);
    assert.equal(JSON.parse(await readFile(lockFile(dir),'utf8')).pid,process.pid);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('invalid, public and symlink locks are never cleared',async()=>{
  const dir=await fresh();
  try{
    await writeFile(lockFile(dir),'untrusted',{mode:0o600});
    await assert.rejects(acquireConversationLock(dir));
    assert.equal(await readFile(lockFile(dir),'utf8'),'untrusted');
    await chmod(lockFile(dir),0o644);
    await assert.rejects(acquireConversationLock(dir),/Untrusted existing watch\.lock/);
    const saved=join(dir,'saved-lock');
    await rename(lockFile(dir),saved);
    await import('node:fs/promises').then(fs=>fs.symlink(saved,lockFile(dir)));
    await assert.rejects(acquireConversationLock(dir),/Untrusted existing watch\.lock/);
    assert.equal((await lstat(lockFile(dir))).isSymbolicLink(),true);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('first owner cleanup cannot remove a replacement lock',async()=>{
  const dir=await fresh();
  try{
    const release=await acquireConversationLock(dir);
    await rename(lockFile(dir),join(dir,'old-owned-lock'));
    await writeFile(lockFile(dir),record(process.pid),{mode:0o600});
    await release();
    assert.equal(JSON.parse(await readFile(lockFile(dir),'utf8')).pid,process.pid);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('recovery guard contention fails closed without touching original lock',async()=>{
  const dir=await fresh();
  try{
    await writeFile(lockFile(dir),record(2147483647),{mode:0o600});
    await writeFile(join(dir,'watch.lock.recovery'),'held',{mode:0o600});
    await assert.rejects(acquireConversationLock(dir),/Lock recovery already in progress or interrupted/);
    assert.ok(await readFile(lockFile(dir),'utf8'));
  }finally{await rm(dir,{recursive:true,force:true});}
});
