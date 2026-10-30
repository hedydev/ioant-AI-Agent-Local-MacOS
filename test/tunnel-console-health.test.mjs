import test from 'node:test';
import assert from 'node:assert/strict';
import {healthUrl,metricValue,classifyHealth,inspectHealth} from '../console/health.mjs';
test('health requests are restricted to exact loopback origins without credentials or paths',()=>{
 assert.equal(healthUrl('http://127.0.0.1:60203\n'),'http://127.0.0.1:60203');
 for(const u of ['https://127.0.0.1:4','http://localhost:4','http://example.com:4','http://127.0.0.1:4/path','http://user:pass@127.0.0.1:4','http://127.0.0.1:4/?key=secret'])assert.throws(()=>healthUrl(u));
});
test('freshness separates a running endpoint from a healthy polling connection',()=>{
 assert.equal(metricValue('commands_polled_total{channel="main"} 4\ncommands_polled_total{channel="other"} 2','commands_polled_total'),6);
 assert.equal(metricValue('unrelated 1','missing'),null);
 assert.equal(classifyHealth({ready:true,lastPollAt:1000,now:1010000}),'ready');
 assert.equal(classifyHealth({ready:true,lastPollAt:1000,now:1100000}),'stale');
 assert.equal(classifyHealth({ready:true,lastPollAt:null}),'starting');
 assert.equal(classifyHealth({ready:false,lastPollAt:Date.now()/1000}),'degraded');
});
test('vendor status selects safe fields instead of forwarding config and auth metadata',async()=>{
 const request=async url=>({ok:true,status:200,text:url.endsWith('/readyz')?'ready':url.endsWith('/metrics')?'commands_poll_last_successful_timestamp_seconds '+Date.now()/1000:url.includes('/api/logs')?'{"events":[]}':JSON.stringify({version:'test',control_plane_tunnel_id:'tunnel_fixture',client_instance_id:'fixture',authorization:'must-not-leak',control_plane_route:{proxy_url:'secret'},channels:[{name:'main',enabled:true,transport_kind:'stdio',details:'private command'}]})});
 const h=await inspectHealth('http://127.0.0.1:1',{request});assert.equal(h.state,'ready');assert.equal(h.channels[0].transport,'stdio');
 assert.equal(JSON.stringify(h).includes('must-not-leak'),false);assert.equal(JSON.stringify(h).includes('private command'),false);assert.equal(h.control_plane_route,undefined);
});
