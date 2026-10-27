import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {aliceCoordinatorManifest,renderAliceCoordinatorPlist,
 recognizeAliceCoordinatorPlist,launchdServiceAbsent} from '../stage2/alice-coordinator-service.mjs';
const root=resolve(import.meta.dirname,'..');
const source=readFileSync(resolve(root,'stage2/alice-coordinator-service.mjs'),'utf8');
const plist=renderAliceCoordinatorPlist('/opt/homebrew/bin');
test('Alice second coordinator is exact-project, read-only, distinct from existing ops LaunchAgent',()=>{
 const a=aliceCoordinatorManifest();
 assert.equal(a.label,'com.ioant.openclaw.alice-coordinator');
 assert.equal(a.agentId,'alice-ai');
 assert.equal(a.repo,'hedydev/ioant-AI-Minecraft-Alice');
 assert.equal(a.mode,'watch');
 assert.equal(a.hostCommands,false);
 assert.equal(a.ssh,false);
 assert.equal(a.keepAlive,false);
 assert.deepEqual(a.programArgs.slice(-1),['--watch']);
 assert.ok(a.programArgs[1].endsWith('/runtime/scripts/alice-coordinator-readonly.sh'));
 assert.ok(!a.programArgs.join(' ').includes('chatgpt-loop.sh'));
 assert.ok(!a.programArgs.join(' ').includes('mac-terminal'));
});
test('launchd uses private internal logs, static profile, background-safe mode and pinned node',()=>{
 assert.match(plist,/<key>RunAtLoad<\/key><true\/>/);
 assert.match(plist,/<key>KeepAlive<\/key><false\/>/);
 assert.match(plist,/<key>IOANT_CHATGPT_BROWSER_PROFILE<\/key><string>chrome<\/string>/);
 assert.match(plist,/<key>IOANT_BACKGROUND_SAFE_REPORTS<\/key><string>1<\/string>/);
 assert.match(plist,/<key>Umask<\/key><integer>63<\/integer>/);
 assert.match(plist,/<key>StandardOutPath<\/key><string>\/Users\/[^<]+\/Library\/Logs\/ioant-openclaw-ops\/alice-coordinator\/stdout.log<\/string>/);
 assert.match(plist,/<key>StandardErrorPath<\/key><string>\/Users\/[^<]+\/Library\/Logs\/ioant-openclaw-ops\/alice-coordinator\/stderr.log<\/string>/);
 assert.equal((plist.match(/<key>ProgramArguments<\/key>/g)||[]).length,1);
 assert.doesNotMatch(plist,/safe-watcher|gateway run|sudo|OPENCLAW_GATEWAY_TOKEN|Volumes\/LunaDrive/);
 assert.doesNotMatch(plist,/enable-self-update|enable-mint|enable-alice-preflight|mac-terminal/);
 assert.ok(recognizeAliceCoordinatorPlist(plist));
 for(const changed of [plist.replace('alice-coordinator-readonly.sh','chatgpt-loop.sh'),
  plist.replace('--watch','--initialize'),
  plist.replace('chrome','openclaw'),
  plist.replace('alice-coordinator</string>','safe-watcher</string>'),
  plist.replace('<key>KeepAlive</key><false/>','<key>KeepAlive</key><true/>'),
  plist.replace('/alice-coordinator/stdout.log','/stdout.log'),
  plist.replace('PATH</key><string>','PATH</key><string>malicious:')]){
  assert.equal(recognizeAliceCoordinatorPlist(changed),null);
 }
 for(const p of ['/private/tmp','../../bad','/opt/../bin','/opt//bin','/tmp:<bad>'])
  assert.throws(()=>renderAliceCoordinatorPlist(p),/unsafe_node_runtime/);
});
test('second service lifecycle has no process kills, broad task arguments, insecure shell or service overwrite',()=>{
 assert.doesNotMatch(source,/shell:true|execSync|eval\(|new Function\(/);
 assert.doesNotMatch(source,/kill\(|killall|pkill|sudo|launchctl.*kickstart|rmSync/);
 assert.match(source,/command\('git',\['-C',ROOT,'status','--porcelain=v1','--untracked-files=all'\]\)/);
 assert.match(source,/if\(ROOT!==RUNTIME\)throw Error\('private_runtime_required'\)/);
 assert.match(source,/alice_watcher_lock_exists/);
 assert.match(source,/if\(argv.length!==1\|\|!\['install','status','uninstall'\]/);
 assert.match(source,/recognizeAliceCoordinatorPlist\(contents\)/);
 assert.match(source,/launchctl'.*'bootstrap'/);
 assert.match(source,/launchctl'.*'bootout'/);
 assert.match(source,/if\(e.code!=='ENOENT'\)throw e/);
});
test('non-mac and missing installation return safe status without creating services',()=>{
 const r=spawnSync(process.execPath,[resolve(root,'stage2/alice-coordinator-service.mjs'),'status'],{
  cwd:root,encoding:'utf8',timeout:5000});
 const data=JSON.parse(r.stdout.trim());
 assert.equal(data.audit,'IOANT_ALICE_COORDINATOR_SERVICE');
 assert.equal(data.changesExistingOps,false);
 assert.ok(['blocked','stopped','unloaded','running'].includes(data.state));
 if(process.platform!=='darwin')assert.equal(data.reason,'macos_only');
});

test('ambiguous launchctl lookup must remain inconclusive, not treated as unloaded',()=>{
 assert.equal(launchdServiceAbsent({stderr:'Could not find service "com.ioant.openclaw.alice-coordinator" in domain for system'}),true);
 assert.equal(launchdServiceAbsent({stderr:'Permission denied accessing launchd'}),false);
 assert.equal(launchdServiceAbsent({message:'connection to launchd timed out'}),false);
 assert.match(source,/if\(!launchdServiceAbsent\(e\)\)throw Error\('launchctl_query_unverified'\)/);
 assert.match(source,/base\('inconclusive','launchctl_query_unverified'/);
});
