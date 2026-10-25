import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {renderPlist,supervisorManifest,installedPlistKind} from '../stage2/ops-supervisor.mjs';

const project=resolve(import.meta.dirname,'..');
const supervisor=readFileSync(resolve(project,'stage2/ops-supervisor.mjs'),'utf8');
const watcher=readFileSync(resolve(project,'stage2/chatgpt-loop.mjs'),'utf8');
const home=homedir();
const nodeDir=home+'/.nvm/versions/node/v24.9.0/bin';

test('background launcher executes only from private Application Support, never Documents',()=>{
 const manifest=supervisorManifest();
 const plist=renderPlist(nodeDir);
 const runtime=home+'/Library/Application Support/ioant-openclaw-ops/runtime';
 assert.equal(manifest.args[1],runtime+'/scripts/chatgpt-loop.sh');
 assert.ok(plist.includes('<string>'+runtime+'/scripts/chatgpt-loop.sh</string>'));
 assert.ok(!plist.includes(home+'/Documents/workspace/'));
 assert.match(plist,/<key>IOANT_BACKGROUND_SAFE_REPORTS<\/key><string>1<\/string>/);
 assert.equal(installedPlistKind(plist),'local');
});

test('old Documents launchd configurations remain recognized only as exact templates',()=>{
 const legacy=renderPlist(nodeDir,{legacyDocumentRoot:true});
 const older=renderPlist(nodeDir,{legacyExternalLogs:true});
 const oldScript=home+'/Documents/workspace/ioant-AI-Agent-Local-MacOS/scripts/chatgpt-loop.sh';
 assert.ok(legacy.includes(oldScript));
 assert.ok(older.includes(oldScript));
 // The updater runs all tests inside a temporary candidate archive, not
 // inside Documents. The legacy plist must still target the ORIGINAL checkout.
 assert.match(supervisor,/const LEGACY_REPO=join\(HOME,'Documents','workspace','ioant-AI-Agent-Local-MacOS'\)/);
 assert.match(supervisor,/const LEGACY_ARGS=\['\/bin\/bash',join\(LEGACY_REPO,'scripts','chatgpt-loop.sh'\),\.\.\.LAUNCH_FLAGS\]/);
 assert.doesNotMatch(supervisor,/const LEGACY_ARGS=\['\/bin\/bash',join\(ROOT,'scripts'/);
 assert.equal(installedPlistKind(legacy),'legacy_document_local');
 assert.equal(installedPlistKind(older),'legacy_external');
 assert.equal(installedPlistKind(legacy.replace('openclaw-dev','main')),null);
 assert.equal(installedPlistKind(older.replace('<key>RunAtLoad</key><true/>','<key>RunAtLoad</key><false/>')),null);
});

test('runtime clone isolates Git objects and re-points origin to verified GitHub',()=>{
 assert.match(supervisor,/git'.*'ls-files','--stage'/);
 assert.match(supervisor,/--no-local','--single-branch','--branch','main',ROOT,RUNTIME/);
 assert.match(supervisor,/remote','set-url','origin',origin/);
 assert.match(supervisor,/const expected=await command\('git',\['rev-parse','--verify','HEAD'\]\)/);
 assert.match(supervisor,/if\(head!==expected\)throw Error\('runtime_revision_mismatch'\)/);
 assert.match(supervisor,/await verifyRuntime\(expected\)/);
 assert.match(supervisor,/if\(dirty\)throw Error\('dirty_runtime'\)/);
 assert.match(supervisor,/await trustedParent\(SUPPORT_PARENT\)/);
 assert.match(supervisor,/await safeUserDir\(DEPLOY_DIR\)/);
 assert.match(supervisor,/await safeUserDir\(RUNTIME\)/);
 assert.doesNotMatch(supervisor,/git .* (reset|clean|stash|switch|merge) /);
});

test('background reports are local and private, with no change to foreground Desktop behavior',()=>{
 assert.match(watcher,/process\.env\.IOANT_BACKGROUND_SAFE_REPORTS==='1'/);
 assert.match(watcher,/join\(homedir\(\),'Library','Application Support','ioant-openclaw-ops','reports','chatgpt-loop'\)/);
 assert.match(watcher,/join\(homedir\(\),'Desktop','Ioant-AI-Agent-Reports','chatgpt-loop'\)/);
 assert.match(watcher,/await privateReportDir\(reports\)/);
 assert.match(supervisor,/await safeUserDir\(REPORT_DIR\)/);
});
