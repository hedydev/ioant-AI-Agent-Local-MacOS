import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {classifyTransferRecord,transferStatus}
 from '../scripts/openclaw-chatgpt-file-transfer-status.mjs';

const file={filename:'sample.md',size:134,digest:'a'.repeat(64)};
const record={audit:'IOANT_EXACT_CHAT_APPROVED_FILE_TRANSFER',
 schemaVersion:1,phase:'confirmed',filename:file.filename,size:file.size,
 digest:file.digest,tag:'IOANT-FILE-TRANSFER-'+'B'.repeat(32),
 approvalReference:'private-not-to-be-returned'};
test('confirmed journal means only privately persisted sender confirmation',()=>{
 const result=classifyTransferRecord(JSON.stringify(record),file);
 assert.equal(result.state,'confirmed');
 assert.equal(result.reason,'private_journal_confirmed');
 assert.equal(result.readOnly,true);
 assert.equal(result.messageSent,false);
 assert.equal(result.uploadTriggered,false);
 assert.equal(JSON.stringify(result).includes(record.tag),false);
 assert.equal(JSON.stringify(result).includes(record.approvalReference),false);
});
test('press_intent is not confirmation and requires review',()=>{
 const result=classifyTransferRecord({...record,phase:'press_intent'},file);
 assert.equal(result.state,'inconclusive');
 assert.equal(result.journalPhase,'press_intent');
 assert.equal(result.noAutomaticResend,true);
});
test('prepared and upload_returned cannot be interpreted as delivered',()=>{
 for(const phase of ['prepared','upload_returned']){
  const result=classifyTransferRecord({...record,phase},file);
  assert.equal(result.state,'inconclusive');
  assert.equal(result.journalPhase,phase);
 }
});
test('tampered journal or swapped identity fails closed',()=>{
 for(const patch of [
  {filename:'other.md'},{size:135},{digest:'c'.repeat(64)},
  {tag:'user-controlled-marker'},{phase:'unknown'},{audit:'WRONG'},
  {schemaVersion:2}
 ])assert.equal(classifyTransferRecord({...record,...patch},file).state,'blocked');
});
test('malformed or non-JSON journal is blocked',()=>{
 for(const bad of ['{','null','[]','"text"',{},null])
  assert.equal(classifyTransferRecord(bad,file).state,'blocked');
});
test('runtime denial blocks before reading file or journal',async()=>{
 const result=await transferStatus({
  path:'/this/path/does/not/exist.txt',allowedRuntime:async()=>false});
 assert.equal(result.state,'blocked');
 assert.equal(result.reason,'private_runtime_required');
 assert.equal(result.browserAccess,false);
 assert.equal(result.journalMutated,false);
});
test('no browser/send/delete APIs in status script',()=>{
 const source=readFileSync(resolve(import.meta.dirname,
  '../scripts/openclaw-chatgpt-file-transfer-status.mjs'),'utf8');
 assert.doesNotMatch(source,/browser.{0,20}(click|upload|press|type|navigate)/);
 assert.doesNotMatch(source,/writeFile|rename|rm\(|unlink|mkdir|execFile/);
 assert.match(source,/O_NOFOLLOW/);
 assert.match(source,/no_matching_private_record/);
 assert.match(source,/press_intent/);
});
