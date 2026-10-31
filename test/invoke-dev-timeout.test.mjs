import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {invokeDevCli} from '../stage2/openclaw-alice-dev-discuss.mjs';
test('a hung Agent CLI is bounded even when SIGTERM produces no close event',async()=>{
 const signals=[];const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin={end(){}};child.kill=s=>signals.push(s);
 const r=await invokeDevCli(['agent'],'fixture',{timeoutMs:5,spawnImpl:()=>child});
 assert.deepEqual(signals,['SIGTERM','SIGKILL']);assert.equal(r.state,'inconclusive');assert.equal(r.note,'gateway_timeout');assert.equal(r.diagnostics.timedOut,true);
});
