import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {sameChatConversationUrl,validateChatUrl} from '../stage2/protocol.mjs';

const root=resolve(import.meta.dirname,'..');
const launcher=readFileSync(resolve(root,'scripts/chatgpt-loop.sh'),'utf8');
const worker=readFileSync(resolve(root,'stage2/chatgpt-loop.mjs'),'utf8');
const id='6add3565-d868-83ec-804e-1e7a00eb0a59';
const original='https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/'+id;
const moved='https://chatgpt.com/g/g-p-renamed-project/c/'+id;
const direct='https://chatgpt.com/c/'+id;

function probeTabCounts(tabs){
 const match=launcher.match(/EXPECTED_CHAT_URL="\$validated" node -e '([^'\n]+)'/);
 assert.ok(match,'Missing fixed bounded tab count parser');
 const result=spawnSync(process.execPath,['-e',match[1]],{
  input:JSON.stringify({tabs}),encoding:'utf8',
  env:{...process.env,EXPECTED_CHAT_URL:original},timeout:5000});
 assert.equal(result.status,0,'Tab parser must succeed: '+result.stderr);
 return result.stdout.trim().split(' ').map(Number);
}

test('strict conversation ID survives ChatGPT project rename or /c relocation',()=>{
 assert.equal(validateChatUrl(original),original);
 assert.equal(sameChatConversationUrl(original,original),true);
 assert.equal(sameChatConversationUrl(moved,original),true);
 assert.equal(sameChatConversationUrl(direct,original),true);
 assert.equal(sameChatConversationUrl(original.replace(id,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),original),false);
 for(const unsafe of [
  'https://evil.example/c/'+id,
  'http://chatgpt.com/c/'+id,
  'https://chatgpt.com/not-a-conversation/'+id,
  moved+'?foo=1',
  moved+'#fragment',
  'https://chatgpt.com.evil.example/c/'+id,
  'https://chatgpt.com/g/../not-a-conversation/'+id
 ])assert.equal(sameChatConversationUrl(unsafe,original),false,unsafe);
});

test('launcher accepts only one eligible matching ID, never unrelated or duplicate tabs',()=>{
 const unrelated='https://chatgpt.com/c/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
 assert.deepEqual(probeTabCounts([{url:moved},{url:unrelated},{url:'https://example.com/'}]),[1,3,2,1]);
 assert.deepEqual(probeTabCounts([{url:direct},{url:moved}]),[2,2,2,2]);
 assert.deepEqual(probeTabCounts([{url:unrelated},{url:'https://example.com/'}]),[0,2,1,0]);
 assert.deepEqual(probeTabCounts([{url:'https://chatgpt.com/not-a-conversation/'+id}]),[0,1,1,0]);
 assert.deepEqual(probeTabCounts([{url:moved+'?x=1'}]),[0,1,1,0]);
});

test('worker rechecks strict same-conversation identity for selection and DOM reads',()=>{
 assert.match(worker,/const matches=tabs\.filter\(t=>sameChatConversationUrl\(t\?\.url,url\)\)/);
 assert.match(worker,/if\(matches\.length!==1\)/);
 assert.match(worker,/!sameChatConversationUrl\(parsed\.url,url\)/);
 assert.doesNotMatch(worker,/matches=tabs\.filter\(t=>t\.url===url\)/);
 assert.doesNotMatch(worker,/parsed\.url!==url/);
 assert.ok(launcher.includes('new RegExp("^/(?:g/[a-zA-Z0-9_-]+/)?c/'));
});
