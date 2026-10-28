import test from 'node:test';
import assert from 'node:assert/strict';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {checkPathIdentity,transferIdentity,parseProof,composerProbe,transfer}
 from '../scripts/openclaw-chatgpt-approved-file-transfer.mjs';
import {buildScopedReceiptProbe,classifyScopedReceipt}
 from '../stage2/chatgpt-upload-scoped-receipt.mjs';

const home=homedir();
const named=name=>join(home,'Desktop',name);
const digest='f'.repeat(64);
test('specified Desktop text and PDF paths are eligible for inspection',()=>{
 assert.equal(checkPathIdentity(named('report.txt')).name,'report.txt');
 assert.equal(checkPathIdentity(join(home,'Downloads','report.pdf')).ext,'.pdf');
 assert.equal(checkPathIdentity(join(home,'Documents','workspace','project','测试文件.zip')).ext,'.zip');
});
test('paths outside selected Mac roots are always rejected',()=>{
 for(const file of ['/etc/passwd',join(home,'.ssh','id_ed25519'),
  join(home,'Documents','Private','notes.pdf'),
  join(home,'DesktopOther','file.txt'),
  '/Volumes/LunaDrive/private.pdf'])
  assert.throws(()=>checkPathIdentity(file),/path_outside_approved_roots|unsupported_file_type/);
});
test('absolute canonical paths required, no traversal',()=>{
 for(const file of ['./file.txt','file.txt','../secret.txt',
  join(home,'Desktop','..','Downloads','file.txt').replace('Downloads','../Downloads'),
  join(home,'Desktop','a.txt')+'/../b.txt'])
  assert.throws(()=>checkPathIdentity(file));
});
test('dotfiles, control characters and unsupported types are rejected',()=>{
 for(const file of [named('.env'),named('private.key'),named('file.sh'),
  named('test.txt\nnext'),named('file'),named('a\\b.pdf')])
  assert.throws(()=>checkPathIdentity(file));
});
test('multilingual basenames and common report formats are accepted',()=>{
 for(const file of ['证明.docx','分析.xlsx','视频说明.pptx','截图.png',
  '实验.jsonl','数据.tsv','AliceAI-运行日志.log'])
  assert.equal(typeof checkPathIdentity(named(file)).name,'string');
});
test('transfer identity is content and exact-path scoped',()=>{
 const a=transferIdentity(named('a.txt'),digest);
 const b=transferIdentity(named('b.txt'),digest);
 const c=transferIdentity(named('a.txt'),'e'.repeat(64));
 assert.notEqual(a.key,b.key);
 assert.notEqual(a.key,c.key);
 assert.match(a.tag,/^IOANT-FILE-TRANSFER-[A-F0-9]{24}$/);
 assert.equal(transferIdentity(named('a.txt'),digest).key,a.key);
 assert.throws(()=>transferIdentity(named('a.txt'),'f'));
});
test('composer probe is parseable and only emits bounded state',()=>{
 const code=composerProbe('中文报告.pdf');
 assert.equal(typeof new Function('return ('+code+')')(),'function');
 assert.ok(code.includes('IOANT_TRANSFER_COMPOSER:'));
 assert.ok(!code.includes('document.body.innerHTML'));
});
test('composer proof parser unwraps CLI JSON and refuses unrelated content',()=>{
 const report={exact:true,editor:true,empty:false,attached:true,generating:false};
 const source='IOANT_TRANSFER_COMPOSER:'+JSON.stringify(report);
 assert.deepEqual(parseProof({result:{content:[{text:source}]}}),report);
 assert.deepEqual(parseProof(JSON.stringify({result:source})),report);
 assert.equal(parseProof('someone else private message'),null);
});
test('dynamic scoped receipt cannot silently choose another chat URL',()=>{
 const CHAT='https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/6ae18e93-e2a0-83ec-aac9-88105079f208';
 const cfg={chatUrl:CHAT,marker:'IOANT-FILE-TRANSFER-1234567890ABCDEF12345678',
  filename:'中文报告.pdf'};
 const code=buildScopedReceiptProbe(cfg);
 assert.equal(typeof new Function('return ('+code+')')(),'function');
 assert.ok(code.includes(cfg.marker));
 assert.ok(code.includes(cfg.filename));
 assert.throws(()=>buildScopedReceiptProbe({...cfg,chatUrl:'https://chatgpt.com/c/else'}));
 assert.throws(()=>buildScopedReceiptProbe({...cfg,filename:'../secrets.pdf'}));
 assert.throws(()=>buildScopedReceiptProbe({...cfg,marker:'injection " text'}));
});
test('scoped classifier never accepts global-only or cross-turn matches',()=>{
 const marker={exact:true,main:true,markerCount:1,roleFamily:0,
  attached:false,inAttribute:false,depth:-1,roleCount:2};
 const value=classifyScopedReceipt('IOANT_SCOPED_RECEIPT:'+JSON.stringify(marker));
 assert.equal(value.state,'inconclusive');
});
test('worker cannot read files when runtime check fails',async()=>{
 const r=await transfer({mode:'inspect',path:named('does-not-exist.pdf'),
  callReady:async()=>false});
 assert.equal(r.state,'blocked');
 assert.equal(r.reason,'private_runtime_required');
 assert.equal(r.uploadTriggered,undefined);
});
test('unsupported modes are blocked without file access',async()=>{
 const r=await transfer({mode:'read-all',path:named('whatever.txt'),callReady:async()=>true});
 assert.equal(r.state,'blocked');
 assert.equal(r.reason,'unsupported_mode');
});
test('sender includes durable pre-send lock and no automatic retry',()=>{
 const src=readFileSync(resolve(import.meta.dirname,
  '../scripts/openclaw-chatgpt-approved-file-transfer.mjs'),'utf8');
 assert.match(src,/duplicate_or_pending_file_transfer/);
 assert.match(src,/press_intent/);
 assert.match(src,/noAutomaticResend:true/);
 assert.match(src,/--approval-reference/);
 assert.match(src,/constants\.O_NOFOLLOW/);
 assert.doesNotMatch(src,/CGEventPost|osascript|launchctl|clipboard/);
});
