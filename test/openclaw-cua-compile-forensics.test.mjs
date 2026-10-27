import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {summarizeSwiftCompilerFailure as summarize,diagnoseCUAFixture}
 from '../scripts/openclaw-cua-compile-forensics.mjs';
const code=readFileSync(resolve(import.meta.dirname,'../scripts/openclaw-cua-compile-forensics.mjs'),'utf8');

test('AppKit missing remains a stable class without raw paths or source contents',()=>{
 const stderr="/Users/private/Fixture.swift:3:8: error: no such module 'AppKit'\n" +
 'secret /Users/private/token/abc';
 const r=summarize({code:1,stderr});
 assert.equal(r.category,'appkit_module_missing');
 assert.deepEqual(r.fixtureErrorLines,[3]);
 assert.equal(r.exitCode,1);
 assert.equal(JSON.stringify(r).includes('/Users/private'),false);
 assert.equal(JSON.stringify(r).includes('secret'),false);
 assert.match(r.compilerOutputDigest,/^[a-f0-9]{16}$/);
});
test('normal Swift error reports source line but not its message or dynamic path',()=>{
 const r=summarize({code:1,stderr:
  '/Volumes/secret/Fixture.swift:31:7: error: cannot find very_secret in scope\n'});
 assert.equal(r.category,'swift_type_error');
 assert.deepEqual(r.fixtureErrorLines,[31]);
 assert.equal(JSON.stringify(r).includes('very_secret'),false);
});
test('toolchain SDK, compiler/linker and filesystem have distinguishable labels',()=>{
 assert.equal(summarize({code:1,stderr:'xcrun: error: invalid active developer path'}).category,'sdk_or_xcode_path');
 assert.equal(summarize({code:1,stderr:'ld: library not found for -lobjc'}).category,'linker_failed');
 assert.equal(summarize({code:1,stderr:'Swift driver error: unexpected compilation failure'}).category,'swift_other_diagnostic');
 assert.equal(summarize({code:'EACCES',stderr:'private path'}).category,'access_denied');
 assert.equal(summarize({killed:true,stderr:'private data'}).category,'timeout');
 assert.equal(summarize({code:'ENOENT'}).category,'tool_missing');
});
test('empty output and unknown messages never leak private strings',()=>{
 const empty=summarize({code:1,stderr:''});
 assert.equal(empty.category,'no_compiler_output');
 const unknown=summarize({code:1,stderr:'my secret environment value'});
 assert.equal(unknown.category,'unrecognized_compiler_failure');
 assert.equal(JSON.stringify(unknown).includes('secret'),false);
});
test('read-only compiler flow avoids GUI/app launch and only reports bounded errors',()=>{
 assert.doesNotMatch(code,/browser\s*\(|CGEventPost|activate\(|screen\.snapshot|computer\.act\s*['"]/);
 assert.match(code,/launchedFixture:false/);
 assert.match(code,/readOnlyDesktop:true/);
 assert.match(code,/args:\['swiftc','-frontend','-parse',SOURCE\]/);
 assert.match(code,/args:\['swiftc','-typecheck',SOURCE\]/);
 assert.match(code,/mkdtemp\(/);
 assert.match(code,/await rm\(temp,\{recursive:true,force:true\}\)/);
});
test('unsupported platform terminates before subprocess or modifying private dirs',async()=>{
 let calls=0;
 const r=await diagnoseCUAFixture({
  platform:'linux',runtimeCheck:async()=>true,
  run:async()=>{calls++;return {stdout:''};}
 });
 assert.equal(r.state,'blocked');
 assert.equal(r.launchedFixture,false);
 assert.equal(r.calledComputerAct,false);
 assert.equal(calls,0);
});
test('private runtime denial does not probe compiler',async()=>{
 let calls=0;
 const r=await diagnoseCUAFixture({
  platform:'darwin',runtimeCheck:async()=>false,
  run:async()=>{calls++;return {stdout:''};}
 });
 assert.equal(r.state,'blocked');
 assert.equal(calls,0);
});
