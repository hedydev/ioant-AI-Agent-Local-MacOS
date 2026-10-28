import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyProxyEvidence,inspectAliceBrowserProxy} from
 '../scripts/alice-browser-proxy-cause-readonly.mjs';
const status={profile:'alice-ai',running:true,headless:false,cdpReady:true,
 cdpPort:18801,pid:12412};
const run=(cfg,s=status,argv='Chrome --remote-debugging-port=18801')=>
 inspectAliceBrowserProxy({platform:'darwin',runtimeCheck:async()=>true,
 call:async args=>args[0]==='config'?cfg:s,ps:async()=>argv});
test('global explicit proxy is classified without exposing endpoint',async()=>{
 const x=await run({extraArgs:['--proxy-server=http://127.0.0.1:7897'],
  profiles:{'alice-ai':{cdpPort:18801}},ssrfPolicy:{}});
 assert.equal(x.state,'observed');
 assert.equal(x.globalExplicitProxyFlag,true);
 assert.equal(x.reason,'explicit_proxy_routing_detected');
 assert.equal(x.ssrfRelaxed,false);
 assert.doesNotMatch(JSON.stringify(x),/7897|127\.0\.0\.1|proxy-server=http/);
});
test('profile explicit proxy is distinguished from default browser',async()=>{
 const x=await run({profiles:{'alice-ai':{
  extraArgs:['--proxy-pac-url=http://private.invalid/proxy.pac']}}});
 assert.equal(x.profileExplicitProxyFlag,true);
 assert.equal(x.globalExplicitProxyFlag,false);
 assert.equal(x.rawArgsEmitted,false);
 assert.doesNotMatch(JSON.stringify(x),/private.invalid|proxy.pac/);
});
test('attested Chrome process flag may explain proxy if config is missing it',async()=>{
 const x=await run({profiles:{'alice-ai':{}}},
 status, 'Google Chrome --proxy-server=socks5://secret.test:9999 --remote-debugging-port=18801');
 assert.equal(x.processCommandAttested,true);
 assert.equal(x.processExplicitProxyFlag,true);
 assert.equal(x.reason,'explicit_proxy_routing_detected');
 assert.doesNotMatch(JSON.stringify(x),/secret.test|9999/);
});
test('unattested process args cannot prove current profile proxy',async()=>{
 const x=await run({profiles:{'alice-ai':{}}},status,
 'Chrome --proxy-server=http://private --remote-debugging-port=19999');
 assert.equal(x.processCommandAttested,false);
 assert.equal(x.processExplicitProxyFlag,null);
 assert.equal(x.reason,'proxy_origin_not_proven_from_visible_flags');
});
test('Gateway/provider proxy environment is not assumed to affect browser',async()=>{
 const x=await run({profiles:{'alice-ai':{}}});
 assert.equal(x.reason,'proxy_origin_not_proven_from_visible_flags');
 assert.equal(x.directEgressVerified,false);
 assert.equal(x.privateNetworkSSRFOptIn,'unset');
});
test('SSRF opt-in is merely observed; missing private access is not changed',async()=>{
 const x=await run({profiles:{'alice-ai':{}},
  ssrfPolicy:{dangerouslyAllowPrivateNetwork:false,
    allowedHostnames:['chatgpt.com']}});
 assert.equal(x.privateNetworkSSRFOptIn,'explicitly_disabled');
 assert.equal(x.ssrfRelaxed,false);
 assert.equal(x.proxySecurityVerified,false);
});
test('profile identity and missing/invalid config fail closed',()=>{
 for(const [config,s] of [[null,status],[{profiles:{}},status],
  [{profiles:{'alice-ai':{}}},{...status,profile:'chrome'}]]){
  const x=classifyProxyEvidence(config,s);
  assert.equal(x.state,'inconclusive');
 }
});
test('runtime and CLI failures return sanitized output only',async()=>{
 const bad=await inspectAliceBrowserProxy({platform:'linux'});
 assert.equal(bad.reason,'private_macos_runtime_required');
 const err=await inspectAliceBrowserProxy({platform:'darwin',
  runtimeCheck:async()=>true,call:async()=>{throw Error('password and 7897')}});
 assert.equal(err.state,'inconclusive');
 assert.equal(err.browserNavigation,false);
 assert.doesNotMatch(JSON.stringify(err),/password|7897/);
});
test('read-only source does not call browser navigation, CUA or config writes',()=>{
 const s=readFileSync(new URL('../scripts/alice-browser-proxy-cause-readonly.mjs',import.meta.url),'utf8');
 assert.match(s,/ssrfRelaxed:false/);
 assert.match(s,/proxyEndpointEmitted:false/);
 assert.doesNotMatch(s,/'browser',\s*'open'|'config',\s*'set'|['"]browser_prepare['"]|['"]computer.act['"]|['"]reset-profile['"]/);
});
