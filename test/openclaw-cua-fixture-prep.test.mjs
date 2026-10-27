import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {prepareFixture,makeFixtureCompileInvocation} from '../scripts/openclaw-cua-fixture-prep.mjs';
const root=resolve(import.meta.dirname,'..');
const swift=readFileSync(resolve(root,'fixtures/cua-noninterference/Fixture.swift'),'utf8');
const prep=readFileSync(resolve(root,'scripts/openclaw-cua-fixture-prep.mjs'),'utf8');
test('dedicated fixture has one exact accessible text field and per-run nonce title',()=>{
 assert.match(swift,/window\.title = self\.title/);
 assert.match(swift,/private let prefix = "IOANT CUA Noninterference Fixture"/);
 assert.match(swift,/fixtureTitle\(args\[1\]\)/);
 assert.match(swift,/token\.utf8\.count == 24/);
 assert.match(swift,/setAccessibilityLabel\("IOANT CUA Fixture Editable"\)/);
 assert.match(swift,/field\.stringValue = "IOANT-FIXTURE-INITIAL"/);
 assert.match(swift,/window\.contentView\?\.addSubview\(field\)/);
});
test('fixture never activates the user desktop and always auto-exits',()=>{
 assert.match(swift,/setActivationPolicy\(\.accessory\)/);
 assert.match(swift,/window\.orderBack\(nil\)/);
 assert.match(swift,/\.seconds\(120\)/);
 assert.match(swift,/NSApplication\.shared\.terminate\(nil\)/);
 assert.doesNotMatch(swift,/\bactivate\(|orderFrontRegardless|makeKeyAndOrderFront|CGEventPost/);
});
test('state reader accesses only frontmost app bundle identity and pointer',()=>{
 assert.match(swift,/NSWorkspace\.shared\.frontmostApplication/);
 assert.match(swift,/NSEvent\.mouseLocation/);
 assert.doesNotMatch(swift,/\bimport\s+(?:ScriptingBridge|JavaScriptCore)\b|AXUIElementCreate|CGEventPost/);
 // The new owner-proof is WindowServer metadata only, exact synthetic title
 // + just-spawned PID, and emits only one boolean; no desktop screenshot.
 assert.match(swift,/CGWindowListCopyWindowInfo/);
 assert.match(swift,/kCGWindowOwnerPID/);
 assert.match(swift,/kCGWindowName/);
 assert.match(swift,/hits\.count == 1/);
 assert.match(swift,/evidence\.exactTitleCount == 1/);
 assert.match(swift,/evidence\.exactTitleOwnedByTarget/);
 assert.match(swift,/evidence\.exactTitleOwnedAtNormalLayer/);
 assert.match(swift,/owner == pid/);
 assert.match(swift,/layer == 0/);
 assert.match(swift,/--prove-window/);
 assert.doesNotMatch(swift,/CGWindowListCreateImage|CGDisplayCreateImage|screencapture/);
});
test('preparation does not launch GUI, browser or Computer Use actions',()=>{
 assert.doesNotMatch(prep,/\bspawn\(|open -g|--command.*computer\.act|nodes.*invoke|browser --|osascript/);
 assert.match(prep,/launchedFixture:false/);
 assert.match(prep,/desktopInput:false/);
 assert.match(prep,/mkdtemp\(/);
 assert.match(prep,/private_fixture_directory_required/);
});
test('unsupported platform cannot invoke a compiler or touch the GUI',async()=>{
 let calls=0;
 const result=await prepareFixture({platform:'linux',run:async()=>{calls++;return {stdout:''}}});
 assert.equal(result.state,'blocked');
 assert.equal(result.invokedComputerAct,false);
 assert.equal(result.desktopInput,false);
 assert.equal(result.launchedFixture,false);
 assert.equal(calls,0);
});

test('fixture compile uses exact xcrun driver that passed live 156B',()=>{
 const source='/private/runtime/fixtures/cua-noninterference/Fixture.swift';
 const binary='/private/tmp/safe/IOANT-CUA-Noninterference-Fixture.app/Contents/MacOS/ioant-cua-fixture';
 const cmd=makeFixtureCompileInvocation(source,binary);
 assert.equal(cmd.bin,'/usr/bin/xcrun');
 assert.deepEqual([...cmd.args],['swiftc',source,'-o',binary]);
 assert.ok(Object.isFrozen(cmd));
 assert.ok(Object.isFrozen(cmd.args));
 assert.match(prep,/await run\(invocation\.bin,\[\.\.\.invocation\.args\]/);
 assert.doesNotMatch(prep,/await run\(compiler,\[source,'-o',binary\]/);
});
test('fixed compile command never accepts arbitrary source or target paths',()=>{
 assert.throws(()=>makeFixtureCompileInvocation('/other/Private.swift',
  '/tmp/IOANT-CUA-Noninterference-Fixture.app/Contents/MacOS/ioant-cua-fixture'),
  /invalid_fixture_build_target/);
 assert.throws(()=>makeFixtureCompileInvocation(
  '/private/runtime/fixtures/cua-noninterference/Fixture.swift',
  '/tmp/unsafe-or-user-visible-file'),/invalid_fixture_build_target/);
});

test('diagnostic reads only WindowServer metadata of synthetic PID and nonce',()=>{
 assert.match(swift,/--diagnose-window/);
 assert.match(swift,/CGPreflightScreenCaptureAccess\(\)/);
 assert.match(swift,/targetPidWindowNameVisible/);
 assert.match(swift,/targetPidWindowCount/);
 assert.match(swift,/exactTitleWindowCount/);
 assert.match(swift,/func safeJSON\(\)/);
 assert.doesNotMatch(swift,/CGRequestScreenCaptureAccess|print\(rows\)|print\(row\)|CGDisplayCreateImage|CGWindowListCreateImage/);
});
