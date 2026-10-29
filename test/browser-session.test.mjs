import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,realpath,chmod,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {browserSessionStatus,openclawCapabilities,browserSession} from '../integrations/chatgpt-openclaw/browser-session.mjs';
import {ComputerTaskStore} from '../integrations/chatgpt-openclaw/computer-task-store.mjs';
test('a running Chrome service without attached debug tabs is not browser readiness',async()=>{
 const r=await browserSessionStatus({command:async a=>a==='status'?{enabled:true,running:true}:{tabs:[]}});
 assert.equal(r.state,'not_attached');assert.equal(r.serviceRunning,true);assert.equal(r.chromeDebugConnected,false);assert.equal(r.repositoryExecutionRequiresChromeDebug,false);
 const attached=await browserSessionStatus({command:async a=>a==='status'?{enabled:true,running:true}:{tabs:[{url:'not returned'}]}});
 assert.equal(attached.state,'connected');assert.equal(attached.attachedTabCount,1);assert.equal(JSON.stringify(attached).includes('not returned'),false);
});
test('script capability remains independent of Chrome Debug being canceled or unavailable',async()=>{
 const r=await openclawCapabilities({}, {load:async()=>({roots:[]}),status:async()=>({state:'not_attached',chromeDebugConnected:false})});
 assert.equal(r.repositoryTasks.requiresChromeDebug,false);assert.equal(r.repositoryTasks.requiresComputerControl,false);assert.equal(r.repositoryTasks.requiresLocalModel,false);
 assert.equal(r.browser.chromeDebugConnected,false);assert.equal((await openclawCapabilities({command:'anything'})).state,'blocked');
});
test('one connection attempt is persisted; no-op browser start cannot claim Chrome attachment',async t=>{
 const parent=await realpath(await mkdtemp(join(tmpdir(),'ioant-browser-connect-')));await chmod(parent,0o700);t.after(()=>rm(parent,{recursive:true,force:true}));
 const store=new ComputerTaskStore(join(parent,'browser'),parent);let starts=0;
 const options={store,command:async a=>{if(a==='start')starts++;return {};},status:async()=>({chromeDebugConnected:false,serviceRunning:true,attachedTabCount:0})};
 const input={action:'connect',operation_id:'browser_connect_fixture_0001'};
 const r=await browserSession(input,options);assert.equal(r.state,'user_action_required');assert.equal(r.reason,'chrome_debug_not_attached');assert.equal(starts,1);
 const cached=await browserSession(input,options);assert.equal(cached.cached,true);assert.equal(starts,1);
 assert.equal((await browserSession({...input,command:'anything'},options)).state,'blocked');
});
