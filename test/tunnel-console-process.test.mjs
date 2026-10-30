import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {PassThrough} from 'node:stream';
import {mkdtemp,chmod,realpath,writeFile,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {TunnelController,inspectProcess} from '../console/process-control.mjs';
test('stop refuses unverified or changed process identity and sends only SIGTERM to the verified PID',async()=>{
 const events=[],signals=[],diagnostics={record:(e,f)=>events.push({e,f})};let fresh={pid:123,start:'new'};
 const c=new TunnelController(diagnostics,{identify:async()=>({pid:123,start:'old'}),inspect:async()=>fresh,signal:(...a)=>signals.push(a)});
 await assert.rejects(c.stop({url:'http://127.0.0.1:1'}),/process_identity_changed/);assert.equal(signals.length,0);
 fresh={pid:123,start:'old'};assert.equal((await c.stop({url:'http://127.0.0.1:1'})).state,'stopping');assert.deepEqual(signals,[[123,'SIGTERM']]);
 c.identify=async()=>null;await assert.rejects(c.stop({}),/verified_tunnel_process/);assert.equal(signals.length,1);
});
test('starting uses fixed argv and an in-memory key, refuses duplicate process and permits restart after signal exit',async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'console-process-')));await chmod(root,0o700);t.after(()=>rm(root,{recursive:true,force:true}));
 const binary=join(root,'client');await writeFile(binary,'fixture',{mode:0o700});await writeFile(join(root,'fixture.yaml'),'fixture',{mode:0o600});
 const events=[],calls=[],children=[];let existing=[];
 const spawnImpl=(file,args,opts)=>{calls.push({file,args,opts});const c=new EventEmitter();c.pid=345;c.stdout=new PassThrough();c.stderr=new PassThrough();c.exitCode=null;c.killed=false;children.push(c);queueMicrotask(()=>c.emit('spawn'));return c;};
 const c=new TunnelController({record:(event,fields)=>events.push({event,fields})},{binary,profileDir:root,profile:'fixture',healthFile:join(root,'health'),processFile:join(root,'process.json'),spawnImpl,findProcesses:async()=>existing,inspect:async()=>({pid:345,start:'start',binary})});
 await assert.rejects(c.start(undefined,{}),/runtime_key_required/);
 existing=[{pid:1}];await assert.rejects(c.start('sk-test-fixture-runtime-key-123456789',{}),/already_running/);assert.equal(calls.length,0);
 existing=[];await c.start(undefined,{});assert.equal(calls.length,1);
 assert.equal(calls[0].opts.env.CONTROL_PLANE_API_KEY,'sk-test-fixture-runtime-key-123456789');assert.equal(calls[0].opts.env.OPENAI_API_KEY,undefined);assert.equal(calls[0].args.join(' ').includes('sk-test'),false);
 children[0].stdout.write('password=do-not-log-this-value\n');assert.equal(JSON.stringify(events).includes('do-not-log-this-value'),false);
 const manifest=await readFile(join(root,'process.json'),'utf8');assert.equal(manifest.includes('sk-test'),false);
 children[0].emit('exit',null,'SIGTERM');await c.start(undefined,{});assert.equal(calls.length,2);c.forgetKey();assert.equal(c.key,null);
});
test('process identity refuses unrelated names without looking at their command arguments',async()=>{
 let calls=0;const command=async()=>{calls++;return {stdout:'501 Fri Oct 30 05:48:10 2026 /unrelated/process\n'};};
 assert.equal(await inspectProcess(123,{command}),null);assert.equal(calls,1);
});
test('restart validates credentials before stopping and never starts an overlapping stdio client',async()=>{
 const events=[];let alive=true,launches=0;
 const c=new TunnelController({record:(e)=>events.push(e)},{command:async()=>{throw Error('rejected private key');},identify:async()=>({pid:123,start:'old'}),inspect:async()=>alive?{pid:123,start:'old'}:null,signal:()=>{alive=false;}});
 c.launch=async()=>{assert.equal(alive,false);launches++;return {state:'starting'};};
 await assert.rejects(c.restart('sk-test-fresh-runtime-key-123456789',{url:'http://127.0.0.1:1'}),/runtime_validation_failed/);assert.equal(alive,true);assert.equal(launches,0);assert.equal(c.key,null);
 c.command=async()=>({stdout:'verified'});await c.restart('sk-test-fresh-runtime-key-123456789',{url:'http://127.0.0.1:1'});assert.equal(alive,false);assert.equal(launches,1);assert.equal(c.busy,false);
});
