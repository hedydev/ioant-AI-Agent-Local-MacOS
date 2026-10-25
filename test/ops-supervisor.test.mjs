import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {supervisorManifest,renderPlist,inspectNodeRuntime,installedPlistKind,parseLaunchdRuntime} from '../stage2/ops-supervisor.mjs';

const filename=resolve(import.meta.dirname,'../stage2/ops-supervisor.mjs');
const source=readFileSync(filename,'utf8');
const manifest=supervisorManifest();
const plist=renderPlist();
test('ops supervisor is a user-only LaunchAgent, not an OpenClaw shell-enabled Agent',()=>{
 assert.equal(manifest.label,'com.ioant.openclaw.safe-watcher');
 assert.equal(manifest.repo,'hedydev/ioant-AI-Agent-Local-MacOS');
 assert.equal(manifest.profile,'chrome');
 assert.equal(manifest.devAgent,'openclaw-dev');
 assert.equal(manifest.readOnlyGui,true);
 assert.equal(manifest.portChanges,false);
 assert.equal(manifest.configWrites,false);
 assert.equal(manifest.remoteOps,false);
 assert.equal(manifest.args[0],'/bin/bash');
 assert.equal(manifest.args[1].endsWith('/scripts/chatgpt-loop.sh'),true);
 assert.equal(manifest.args.includes('--enable-self-update'),true);
 assert.equal(manifest.args.includes('--enable-gui-readonly'),true);
 assert.equal(manifest.args.includes('--enable-openclaw-dev-create'),false);
 assert.equal(manifest.args.includes('--enable-openclaw-agent-create'),false);
 assert.equal(manifest.args.includes('--enable-openclaw-provision'),false);
 assert.equal(manifest.args.includes('--enable-alice-lab-startup-probe'),false);
 assert.equal(manifest.args.includes('--enable-mint-diagnostics'),false);
 assert.equal(manifest.args.includes('--enable-alice-preflight'),false);
 assert.equal(manifest.args.includes('--watch'),true);
 assert.equal(manifest.args.includes('--chat-url'),true);
 assert.equal(manifest.chatUrl,manifest.args[manifest.args.indexOf('--chat-url')+1]);
 assert.equal(manifest.args.includes('--dev-agent'),true);
 assert.equal(manifest.args[manifest.args.indexOf('--dev-agent')+1],'openclaw-dev');
});
test('generated launchd configuration is narrow and contains no secrets or elevation',()=>{
 assert.match(plist,/<!DOCTYPE plist PUBLIC/);
 assert.match(plist,/<key>Label<\/key><string>com\.ioant\.openclaw\.safe-watcher<\/string>/);
 assert.match(plist,/<key>Umask<\/key><integer>63<\/integer>/);
 assert.match(plist,/<key>RunAtLoad<\/key><true\/>/);
 assert.match(plist,/<key>KeepAlive<\/key><false\/>/);
 assert.match(plist,/<key>IOANT_CHATGPT_BROWSER_PROFILE<\/key><string>chrome<\/string>/);
 assert.match(plist,/<key>PATH<\/key><string>\/opt\/homebrew\/bin:.*\/usr\/bin/);
 assert.doesNotMatch(plist,/sk-[A-Za-z0-9]+|ghp_|OPENCLAW_GATEWAY_TOKEN|OPENCLAW_GATEWAY_PASSWORD|sudo|bash -c|sh -c/);
 assert.equal((plist.match(/<key>ProgramArguments<\/key>/g)||[]).length,1);
 assert.equal((plist.match(/--enable-gui-readonly/g)||[]).length,1);
});
test('installer never installs on behalf of a chat task or invokes general shell',()=>{
 assert.doesNotMatch(source,/mcp__|process\.env\.TASK_ACTION|actionFromJson/);
 assert.doesNotMatch(source,/shell:true|execSync|eval\(|new Function\(/);
 const executable=source.split('\n').filter(line=>!line.trimStart().startsWith('//')).join('\n');
 assert.doesNotMatch(executable,/\/bin\/sudo|gateway.*config\.patch|agent --agent|agents add/);
 assert.match(source,/if\(args\.length!==1\|\|!\['install','status','uninstall'\]\.includes\(args\[0\]\)\)/);
 assert.match(source,/watcher_already_active_or_uncertain/);
 assert.match(source,/if\(await command\('git',\['status','--porcelain=v1','--untracked-files=all'\]\)\)/);
 assert.match(source,/privateDir\(st\)/);
 assert.match(source,/privateFile\(stat\)/);
 assert.match(source,/No sudo/);
 assert.match(source,/const nodeDir=await inspectNodeRuntime\(\)/);
 assert.match(source,/unsafe_node_runtime/);
 assert.doesNotMatch(source,/command\('\/usr\/bin\/which',\['node'\]\)/);
 assert.match(source,/\(stat.mode&0o022\)!==0/);
});

test('canonical private Node under nvm/Volta or LunaDrive is pinned into LaunchAgent PATH',async()=>{
 const home='/Users/ted';
 const node='/Users/ted/.nvm/versions/node/v24.9.0/bin/node';
 const options={binary:'/Users/ted/.nvm/current/bin/node',home,uid:501,
  canonical:async()=>node,
  stat:async path=>path===node
   ?{mode:0o100755,uid:501,isFile:()=>true,isSymbolicLink:()=>false}
   :{mode:0o40755,uid:path.startsWith('/Users/ted/')?501:0,
     isDirectory:()=>true,isSymbolicLink:()=>false}};
 const nodeDir=await inspectNodeRuntime(options);
 assert.equal(nodeDir,'/Users/ted/.nvm/versions/node/v24.9.0/bin');
 const plist=renderPlist(nodeDir);
 assert.match(plist,/<key>PATH<\/key><string>\/Users\/ted\/\.nvm\/versions\/node\/v24\.9\.0\/bin:\/opt\/homebrew\/bin/);
 assert.doesNotMatch(plist,/current\/bin\/node/);
 const diskNode='/Volumes/LunaDrive/DeveloperCache/node/v24/bin/node';
 // The replacement binary needs its own regular executable-file stat.
 // Reusing the nvm fixture makes the LunaDrive Node falsely look like a directory.
 const diskStat=async path=>path===diskNode
  ?{mode:0o100755,uid:501,isFile:()=>true,isSymbolicLink:()=>false}
  :{mode:0o40755,uid:path.startsWith('/Volumes/LunaDrive/')?501:0,
    isDirectory:()=>true,isSymbolicLink:()=>false};
 assert.equal(await inspectNodeRuntime({...options,binary:diskNode,
  canonical:async()=>diskNode,stat:diskStat}),
   '/Volumes/LunaDrive/DeveloperCache/node/v24/bin');
 // Fail closed if the purported binary is actually a directory.
 await assert.rejects(inspectNodeRuntime({...options,binary:diskNode,
  canonical:async()=>diskNode,stat:async()=>({
   mode:0o40755,uid:501,isDirectory:()=>true,isFile:()=>false,isSymbolicLink:()=>false
  })}),/unsafe_node_runtime/);
});
test('untrusted executable or writable parent can never become LaunchAgent PATH',async()=>{
 const home='/Users/ted',node=home+'/.nvm/versions/node/v24/bin/node';
 const good=async path=>path===node
  ?{mode:0o100755,uid:501,isFile:()=>true,isSymbolicLink:()=>false}
  :{mode:0o40755,uid:path.startsWith(home+'/')?501:0,
    isDirectory:()=>true,isSymbolicLink:()=>false};
 const opts={binary:node,home,uid:501,canonical:async()=>node,stat:good};
 for(const change of [
  {...opts,canonical:async()=>'/private/tmp/node'},
  {...opts,stat:async p=>p===home+'/.nvm'?{...await good(p),mode:0o40777}:good(p)},
  {...opts,stat:async p=>p===node?{...await good(p),mode:0o100777}:good(p)},
  {...opts,stat:async p=>p===node?{...await good(p),uid:999}:good(p)},
  {...opts,stat:async p=>p===home+'/.nvm'?{...await good(p),isSymbolicLink:()=>true}:good(p)}
 ])await assert.rejects(inspectNodeRuntime(change),/unsafe_node_runtime/);
 assert.throws(()=>renderPlist('/Users/ted/../../tmp'),/unsafe_node_runtime/);
 assert.throws(()=>renderPlist('/private/path:malicious'),/unsafe_node_runtime/);
});

test('launchd stdout/stderr must stay on local Library/Logs, not on external LunaDrive',()=>{
 const now=renderPlist('/Users/ted/.nvm/versions/node/v24.9.0/bin');
 assert.match(now,/<key>StandardOutPath<\/key><string>\/Users\/[^<]+\/Library\/Logs\/ioant-openclaw-ops\/stdout\.log<\/string>/);
 assert.match(now,/<key>StandardErrorPath<\/key><string>\/Users\/[^<]+\/Library\/Logs\/ioant-openclaw-ops\/stderr\.log<\/string>/);
 assert.doesNotMatch(now,/StandardOutPath<\/key><string>\/Volumes\//);
 assert.doesNotMatch(now,/StandardErrorPath<\/key><string>\/Volumes\//);
 assert.equal(installedPlistKind(now),'local');
 const old=renderPlist('/Users/ted/.nvm/versions/node/v24.9.0/bin',{legacyExternalLogs:true});
 assert.match(old,/StandardOutPath<\/key><string>\/Volumes\/LunaDrive\//);
 assert.equal(installedPlistKind(old),'legacy_external');
 assert.equal(installedPlistKind(old.replace('com.ioant.openclaw.safe-watcher','evil.unknown.service')),null);
 assert.equal(installedPlistKind(now.replace('stdout.log','other.log')),null);
 assert.equal(installedPlistKind(now.replace('--enable-gui-readonly','--enable-openclaw-dev-create')),null);
});

test('status parser distinguishes failed registered job from real running process',()=>{
 const dead='gui/501/com.ioant.openclaw.safe-watcher = {\n'+
  '    state = not running\n    runs = 1\n    last exit code = 78: EX_CONFIG\n'+
  '    inner = {\n        state = active\n    }\n}';
 assert.deepEqual(parseLaunchdRuntime(dead),{state:'stopped',lastExitCode:78});
 const live='service = {\n    state = running\n    pid = 51730\n    runs = 2\n}';
 assert.deepEqual(parseLaunchdRuntime(live),{state:'running',pid:51730});
 const unknown='service = {\n    state = not running\n    pid = 51730\n}';
 assert.equal(parseLaunchdRuntime(unknown).state,'stopped');
 assert.equal(parseLaunchdRuntime('garbled').state,'stopped');
});

test('install verifies safe local macOS log parent and migration is fixed-template-only',()=>{
 assert.match(source,/const LOCAL_LOG_PARENT=join\(HOME,'Library','Logs'\)/);
 assert.match(source,/await realpath\(LOCAL_LOG_PARENT\)!==LOCAL_LOG_PARENT/);
 assert.match(source,/unsafe_local_log_parent/);
 assert.match(source,/installedPlistKind\(content\)/);
 assert.match(source,/\['running','stopped','unloaded'\]\.includes\(st\.state\)/);
 assert.match(source,/launchctl'.*'bootout'/);
});
