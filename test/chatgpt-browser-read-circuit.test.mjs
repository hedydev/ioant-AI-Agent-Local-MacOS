import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserReadCircuit,classifyBrowserReadFailure,waitBrowserCircuit}
 from '../stage2/chatgpt-browser-read-circuit.mjs';
const err=(message,code)=>({message,...(code?{code}:{})});
test('ordinary reads remain allowed until exactly three consecutive failures',()=>{
 const c=new BrowserReadCircuit();
 assert.equal(c.remaining(1000),0);
 for(let i=0;i<2;i++){
  const r=c.recordFailure(err('Command failed: openclaw browser tabs'),1000+i);
  assert.equal(r.state,'retry');assert.equal(r.opened,false);
 }
 const r=c.recordFailure(err('Command failed: openclaw browser tabs'),1002);
 assert.equal(r.state,'cooldown');assert.equal(r.waitMs,300000);
 assert.equal(c.remaining(1003),299999);
 assert.equal(c.remaining(301002),0);
});
test('after first cooldown, exactly one failed probe yields longer cooldown',()=>{
 const c=new BrowserReadCircuit();
 for(let i=0;i<3;i++)c.recordFailure(err('CLI command failed'),1000+i);
 assert.equal(c.recordFailure(err('CLI command failed'),301002).waitMs,600000);
 assert.equal(c.recordFailure(err('CLI command failed'),901002).waitMs,900000);
 assert.equal(c.recordFailure(err('CLI command failed'),1801002).waitMs,900000);
});
test('successful authorized page read resets long-lived failure state',()=>{
 const c=new BrowserReadCircuit();
 for(let i=0;i<3;i++)c.recordFailure(err('Command failed'),100+i);
 assert.deepEqual(c.recordSuccess(),{recovered:true});
 assert.equal(c.remaining(101),0);
 assert.equal(c.recordFailure(err('Command failed'),200).state,'retry');
 assert.deepEqual(c.recordSuccess(),{recovered:true});
 assert.deepEqual(c.recordSuccess(),{recovered:false});
});
test('host access or policy denial halts all further browser probes',()=>{
 for(const msg of ['host browser access denied','browser host access blocked','not authorized']){
  const c=new BrowserReadCircuit();
  const x=c.recordFailure(err(msg),100);
  assert.equal(x.state,'halted');
  assert.equal(c.remaining(5000000),Infinity);
  assert.equal(c.recordFailure(err('Command failed'),1000).state,'halted');
 }
});
test('classify exact target absence separately from Relay zero tabs and CLI failure',()=>{
 assert.equal(classifyBrowserReadFailure(err('unavailable','CHROME_RELAY_ZERO_TABS')),'relay_zero_tabs');
 assert.equal(classifyBrowserReadFailure(err('Authorized ChatGPT tab unavailable: different_chat_visible')),'exact_tab_missing');
 assert.equal(classifyBrowserReadFailure(err('OpenClaw browser --json tabs returned invalid JSON')),'invalid_tab_metadata');
 assert.equal(classifyBrowserReadFailure(err('Command failed: openclaw browser --json tabs')),'browser_command_failed');
 assert.equal(classifyBrowserReadFailure(err('private text with no patterns')),'unclassified');
});
test('wait performs zero browser requests and stops early on SIGINT flag',async()=>{
 const c=new BrowserReadCircuit({baseCooldownMs:1000,maxCooldownMs:2000});
 for(let i=0;i<3;i++)c.recordFailure(err('CLI command failed'),0);
 let calls=0,now=0,stop=false;
 const ready=await waitBrowserCircuit(c,()=>stop,{
  now:()=>now,quantumMs:1000,
  sleep:async ms=>{calls++;now+=ms;if(calls===1)stop=true;}
 });
 assert.equal(ready,false);
 assert.equal(calls,1);
});
test('wait resumes once cooldown expires without hidden browser invocations',async()=>{
 const c=new BrowserReadCircuit({baseCooldownMs:1000,maxCooldownMs:2000});
 for(let i=0;i<3;i++)c.recordFailure(err('Command failed'),0);
 let now=0,n=0;
 const ready=await waitBrowserCircuit(c,()=>false,{
  now:()=>now,quantumMs:100,
  sleep:async ms=>{now+=ms;n++;}
 });
 assert.equal(ready,true);
 assert.equal(n,10);
});
test('invalid circuit parameters are rejected',()=>{
 assert.throws(()=>new BrowserReadCircuit({threshold:0}));
 assert.throws(()=>new BrowserReadCircuit({baseCooldownMs:0}));
 assert.throws(()=>new BrowserReadCircuit({baseCooldownMs:1000,maxCooldownMs:999}));
});
