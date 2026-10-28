import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseLocalChromeProxy,parseSystemHttpsProxy,candidateProxyPatch,
 summarizeOtherProfiles,runRepair} from '../scripts/alice-stale-proxy-repair.mjs';
test('extract only simple local HTTP proxy flag',()=>{
 assert.equal(parseLocalChromeProxy('--proxy-server=http://127.0.0.1:6789').port,6789);
 for(const s of ['--proxy-server=http://internal.example:88',
  '--proxy-server=socks5://127.0.0.1:6789',
  '--proxy-server=http=127.0.0.1:6789;https=127.0.0.1:6789'])
  assert.equal(parseLocalChromeProxy(s),null);
});
test('parse macOS enabled loopback HTTPS proxy without disclosing port',()=>{
 assert.equal(parseSystemHttpsProxy('HTTPSProxy : 127.0.0.1\n HTTPSPort : 7897\n HTTPSEnable : 1').port,7897);
 assert.equal(parseSystemHttpsProxy('HTTPSProxy : 1.2.3.4\n HTTPSPort : 7897\n HTTPSEnable : 1'),null);
});
test('candidate replaces exactly one flag and preserves unrelated args',()=>{
 const args=['--disable-gpu','--proxy-server=http://127.0.0.1:6789','--window-size=900,600'];
 const r=candidateProxyPatch(args,{port:7897});
 assert.equal(r.state,'candidate');
 assert.deepEqual(r.next,['--disable-gpu','--proxy-server=http://127.0.0.1:7897','--window-size=900,600']);
 assert.deepEqual(args[1],'--proxy-server=http://127.0.0.1:6789');
});
test('PAC, multiple proxies and existing correct port block mutation',()=>{
 for(const args of [
 ['--proxy-server=http://127.0.0.1:6789','--proxy-pac-url=file://secret'],
 ['--proxy-server=http://127.0.0.1:6789','--proxy-server=http://127.0.0.1:7897'],
 ['--proxy-server=socks5://127.0.0.1:6789']]){
  assert.equal(candidateProxyPatch(args,{port:7897}).state,'blocked');
 }
 assert.equal(candidateProxyPatch(['--proxy-server=http://127.0.0.1:7897'],
  {port:7897}).state,'no_change_needed');
});
test('other running managed browsers block global launch-flag write',()=>{
 const p={profiles:[{name:'alice-ai',driver:'openclaw'},
 {name:'openclaw',driver:'openclaw'},
 {name:'chrome',driver:'extension'},{name:'user',driver:'existing-session'}]};
 assert.equal(summarizeOtherProfiles(p,{openclaw:{profile:'openclaw',running:true}}).state,'blocked');
 const clean=summarizeOtherProfiles(p,{openclaw:{profile:'openclaw',running:false}});
 assert.equal(clean.state,'ready');
 assert.equal(clean.otherManagedProfileCount,1);
});
test('unknown profiles and missing states fail closed',()=>{
 assert.equal(summarizeOtherProfiles({profiles:[{name:'alice-ai',driver:'openclaw'},
 {name:'other',driver:'remote'}]},{}).state,'blocked');
 assert.equal(summarizeOtherProfiles({profiles:[{name:'alice-ai',driver:'openclaw'},
 {name:'other',driver:'openclaw'}]},{}).state,'blocked');
});
const prepared={state:'ready_for_scoped_apply',otherManagedProfileCount:0,
 otherManagedProfilesRunning:0,originalFlagCount:2,unchangedFlagCount:1,
 oldArgs:['--x','--proxy-server=http://127.0.0.1:6789'],
 newArgs:['--x','--proxy-server=http://127.0.0.1:7897']};
test('plan is non-mutating with no config or credential disclosure',async()=>{
 let written=false;
 const r=await runRepair({platform:'darwin',mode:'plan',
  runtimeCheck:async()=>true,assessFn:async()=>prepared,
  doBackup:async()=>{written=true;},run:async()=>{written=true;}});
 assert.equal(r.state,'ready_for_scoped_apply');
 assert.equal(written,false);
 assert.equal(r.configChanged,false);
 assert.equal(r.backupSaved,false);
 assert.doesNotMatch(JSON.stringify(r),/6789|7897|--proxy-server/);
});
test('apply requires private backup before a conditional config write',async()=>{
 const events=[];
 const r=await runRepair({platform:'darwin',mode:'apply',
  runtimeCheck:async()=>true,assessFn:async()=>prepared,
  doBackup:async()=>{events.push('backup');},
  run:async args=>{events.push('write');assert.ok(args.includes('--expect-current-json'));},
  read:async()=>prepared.newArgs});
 assert.equal(r.state,'scoped_config_updated');
 assert.deepEqual(events,['backup','write']);
 assert.equal(r.browserProcessRestartRequired,true);
 assert.equal(r.ssrfRelaxed,false);
});
test('backup failure and conditional write failure cannot claim success',async()=>{
 const blocked=await runRepair({platform:'darwin',mode:'apply',
  runtimeCheck:async()=>true,assessFn:async()=>prepared,
  doBackup:async()=>{throw Error('private key');}});
 assert.equal(blocked.state,'blocked');
 assert.equal(blocked.configChanged,false);
 const uncertain=await runRepair({platform:'darwin',mode:'apply',
  runtimeCheck:async()=>true,assessFn:async()=>prepared,
  doBackup:async()=>{},run:async()=>{throw Error('proxy endpoint secret')}});
 assert.equal(uncertain.state,'inconclusive');
 assert.equal(uncertain.configChanged,null);
 assert.doesNotMatch(JSON.stringify(uncertain),/private key|proxy endpoint secret/);
});
test('non-Mac or runtime mismatch does not touch host state',async()=>{
 const x=await runRepair({mode:'apply',platform:'linux',
  assessFn:async()=>{throw Error('must not execute')}});
 assert.equal(x.reason,'private_macos_runtime_required');
 assert.equal(x.configChanged,undefined);
});
test('source cannot restart gateway, disable SSRF or navigate ChatGPT',()=>{
 const s=readFileSync(new URL('../scripts/alice-stale-proxy-repair.mjs',import.meta.url),'utf8');
 assert.match(s,/--expect-current-json/);
 assert.match(s,/private-recovery/);
 assert.doesNotMatch(s,/dangerouslyAllowPrivateNetwork\s*:\s*true|['"]browser['"],\s*['"]open['"]|['"]nodes['"],\s*['"]invoke['"]/);
});
