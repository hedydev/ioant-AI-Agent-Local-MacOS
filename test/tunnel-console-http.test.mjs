import test from 'node:test';import assert from 'node:assert/strict';
import {createConsoleServer} from '../console/http-server.mjs';
test('loopback console blocks cross-site controls, protects API state, and serves local scripts with CSP',async t=>{
 const calls=[],events=[];
 const snapshot={tunnel:{state:'stopped'},projects:[],activities:[],events:[],mcpEvents:[],diagnostics:{}};
 const service={snapshot,listeners:new Set(),refresh:async()=>snapshot,diagnostics:{record:(e,f)=>events.push({e,f}),rows:[],flush:async()=>{}},controller:{start:async key=>{calls.push(key);return {state:'starting'};},stop:async()=>({state:'stopping'}),forgetKey:()=>{}}};
 const app=createConsoleServer(service,{port:0,report:async()=>({state:'report',logText:'<script>not HTML</script>'})});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>{app.server.closeAllConnections();app.server.close();});
 const url=app.origin,headers={'x-console-token':app.token,'content-type':'application/json',origin:url};
 let r=await fetch(url);assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(await r.text(),/<meta name="console-token"/);
 assert.equal((await fetch(url+'/api/snapshot')).status,403);
 assert.equal((await fetch(url+'/api/control/start',{method:'POST',headers:{...headers,origin:'https://evil.invalid'},body:'{"runtimeKey":"never-execute"}'})).status,403);assert.equal(calls.length,0);
 assert.equal((await fetch(url+'/api/control/start',{method:'POST',headers,body:'{"runtimeKey":"test-runtime"}'})).status,200);assert.deepEqual(calls,['test-runtime']);
 assert.equal(JSON.stringify(events).includes('test-runtime'),false);
 r=await fetch(url+'/api/report?project=p&operationId=op',{headers});assert.equal((await r.json()).logText,'<script>not HTML</script>');
 assert.equal((await fetch(url+'/api/report?project=p&operationId=op&path=/etc/passwd',{headers})).status,400);
 assert.equal((await fetch(url+'/app.js')).headers.get('content-type'),'text/javascript; charset=utf-8');
 assert.equal((await fetch(url+'/api/export',{headers})).headers.get('content-disposition'),'attachment; filename="openclaw-console-diagnostics.json"');
 const ac=new AbortController();r=await fetch(url+'/api/events',{headers,signal:ac.signal});assert.equal(r.headers.get('content-type'),'text/event-stream');const chunk=await r.body.getReader().read();assert.match(new TextDecoder().decode(chunk.value),/^data:/);ac.abort();
});
