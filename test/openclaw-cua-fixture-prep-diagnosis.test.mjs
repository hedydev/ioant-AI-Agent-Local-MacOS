import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyFixtureFailure,prepareFixture}
 from '../scripts/openclaw-cua-fixture-prep.mjs';

test('swiftc diagnostic classification includes fixture line only, not private stderr',()=>{
 const output='/Users/private/Fixture.swift:24:15: error: cannot find foo in scope\n' +
 'private token from compiler environment';
 const result=classifyFixtureFailure('swift_compile',{code:1,stderr:output});
 assert.deepEqual(result,{phase:'swift_compile',
  category:'swift_source_or_api_error',fixtureSourceLine:24});
 assert.equal(JSON.stringify(result).includes('/Users/private/'),false);
 assert.equal(JSON.stringify(result).includes('private token'),false);
});
test('missing Xcode command line tools get categorized without CLI text',()=>{
 const r=classifyFixtureFailure('toolchain',{code:1,
  stderr:'xcrun: error: active developer path missing; secret'});
 assert.deepEqual(r,{phase:'toolchain',category:'swift_toolchain_unavailable'});
 assert.equal(JSON.stringify(r).includes('secret'),false);
});
test('AppKit SDK absence is distinguished from ordinary syntax errors',()=>{
 const r=classifyFixtureFailure('swift_compile',{
  code:1,stderr:"Fixture.swift:3:8: error: no such module 'AppKit'"});
 assert.deepEqual(r,{phase:'swift_compile',
  category:'appkit_sdk_unavailable',fixtureSourceLine:3});
});
test('filesystem denied, missing tool and timeout are all safe classes',()=>{
 assert.equal(classifyFixtureFailure('fixture_dir',{code:'EACCES'}).category,
  'filesystem_permission_denied');
 assert.equal(classifyFixtureFailure('source_read',{code:'ENOENT'}).category,
  'file_or_tool_missing');
 assert.equal(classifyFixtureFailure('swift_compile',{killed:true}).category,
  'timeout');
});
test('unknown phases cannot be injected into returned output',()=>{
 const r=classifyFixtureFailure('sensitive/private/context',{code:13,
  stderr:'password://private'});
 assert.deepEqual(r,{phase:'unknown',category:'local_preparation_failed'});
});
test('read-only preparation still blocks unsupported hosts before invoking Swift',async()=>{
 let called=0;
 const result=await prepareFixture({platform:'linux',
   run:async()=>{called++;return {stdout:'private content'}}});
 assert.equal(result.state,'blocked');
 assert.equal(result.desktopInput,false);
 assert.equal(result.invokedComputerAct,false);
 assert.equal(called,0);
});
