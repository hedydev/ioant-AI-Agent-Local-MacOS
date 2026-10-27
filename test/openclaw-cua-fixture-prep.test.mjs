import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {prepareFixture} from '../scripts/openclaw-cua-fixture-prep.mjs';
const root=resolve(import.meta.dirname,'..');
const swift=readFileSync(resolve(root,'fixtures/cua-noninterference/Fixture.swift'),'utf8');
const prep=readFileSync(resolve(root,'scripts/openclaw-cua-fixture-prep.mjs'),'utf8');
test('dedicated fixture has one exact accessible text field and unique title',()=>{
 assert.match(swift,/window\.title = "IOANT CUA Noninterference Fixture"/);
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
 assert.doesNotMatch(swift,/\bimport\s+(?:ScriptingBridge|JavaScriptCore)\b|AXUIElementCreate|CGWindowListCopy/);
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
