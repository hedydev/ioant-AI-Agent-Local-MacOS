import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';

const root=resolve(import.meta.dirname,'..');
const worker=readFileSync(resolve(root,'stage2/chatgpt-loop.mjs'),'utf8');
const shell=readFileSync(resolve(root,'scripts/chatgpt-loop.sh'),'utf8');
const tick=String.fromCharCode(96);
const start=worker.indexOf('const readPageFunction='+tick);
const end=worker.indexOf(tick+';\n\nfunction argsOf',start);
assert.ok(start>=0 && end>start,'Could not locate exact browser page reader');
const reader=Function('MARKER',worker.slice(start,end+2)+'; return readPageFunction;')('IOANT_MAC_LOOP_RESULT::');

function pageWith(selector,kind='div',contents=''){
 const editor={matches:(q)=>q==='textarea'&&kind==='textarea',value:contents,innerText:contents,textContent:contents};
 const main={};
 const document={
   readyState:'complete',
   querySelectorAll:(q)=>q.includes('data-message-author-role')?[]:q==='[contenteditable="true"]'?(selector?[editor]:[]):[],
   querySelector:(q)=>q===selector?editor:q==='main'?main:null
 };
 const value=vm.runInNewContext('('+reader+')()', {document,location:{href:'https://chatgpt.com/c/6adb7dca-1214-83ec-b210-42efe8f2042e'}});
 assert.ok(value.startsWith('IOANT_MAC_LOOP_RESULT::'));
 return JSON.parse(value.slice('IOANT_MAC_LOOP_RESULT::'.length));
}

test('ChatGPT legacy prompt id remains supported',()=>{
 const p=pageWith('#prompt-textarea');
 assert.equal(p.composerPresent,true);
 assert.equal(p.composerEmpty,true);
 assert.equal(p.readyState,'complete');
});

test('ChatGPT data-testid contenteditable variant supported',()=>{
 const p=pageWith('[data-testid="composer-input"][contenteditable="true"]');
 assert.equal(p.composerPresent,true);
 assert.equal(p.composerEmpty,true);
});

test('ChatGPT textarea composer checks value, not empty DOM text',()=>{
 const p=pageWith('form textarea[aria-label*="Message"]','textarea','already writing');
 assert.equal(p.composerPresent,true);
 assert.equal(p.composerEmpty,false);
});

test('no ambiguous search inputs accepted as ChatGPT composer',()=>{
 const p=pageWith(null);
 assert.equal(p.composerPresent,false);
 assert.equal(p.editableCount,0);
 assert.equal(p.hasMain,true);
});

test('no authenticated Chrome tab does not produce a false sign-in assertion',()=>{
 assert.match(worker,/This may be a loading\/login\/error page or a changed composer selector/);
 assert.match(worker,/profile='\+profile/);
 assert.doesNotMatch(worker,/Sign in within isolated OpenClaw profile first/);
});

test('extension missing-tab diagnostics report counts only without leaking other URLs',()=>{
 const syntax=spawnSync('bash',['-n',resolve(root,'scripts/chatgpt-loop.sh')],{encoding:'utf8'});
 assert.equal(syntax.status,0,syntax.stderr);
 assert.match(shell,/TAB_COUNTS=/);
 assert.match(shell,/Selected tabs mode, move the intended ChatGPT tab into the OpenClaw tab group/);
 assert.match(shell,/a DIFFERENT project URL/);
 assert.doesNotMatch(shell,/echo[^\n]*x\.url/);
});
