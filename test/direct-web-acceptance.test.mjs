import test from 'node:test';
import assert from 'node:assert/strict';
import {exactTestTab,testMarker,allowedTestClick} from '../scripts/direct-openclaw-web-acceptance.mjs';
const url='https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/6ae25a0b-9b38-83ec-b2df-9db1f40f9488';
test('web acceptance pins the authorized infrastructure chat and refuses duplicate/other chats',()=>{
 const tabs=[{targetId:'A'.repeat(32),url}];assert.equal(exactTestTab(tabs,'chat'),'A'.repeat(32));
 assert.throws(()=>exactTestTab([...tabs,...tabs],'chat'));
 assert.throws(()=>exactTestTab([{...tabs[0],url:'https://chatgpt.com/c/another'}],'chat'));
});
test('test messages need unique public markers and cannot transmit credentials',()=>{
 const marker='MCP_GENERIC_WEB_ACCEPTANCE_A1B2C3D4E5F60708';assert.equal(testMarker(marker+'\nTest only'),marker);
 assert.throws(()=>testMarker('ordinary unrelated message'));
 assert.throws(()=>testMarker(marker+'\nsk-proj-fixture-key-must-not-be-sent'));
});
test('UI allowlist excludes uninstall, permission changes, unrelated chat actions and arbitrary inputs',()=>{
 assert.equal(allowedTestClick({role:'button',name:'Refresh tools'},'plugins'),true);
 assert.equal(allowedTestClick({role:'button',name:'OpenClaw Mac No description'},'plugins'),true);
 assert.equal(allowedTestClick({role:'button',name:'Allow once'},'chat'),true);
 for(const name of ['Uninstall','Always allow','Delete chat','Allow all','Send'])assert.equal(allowedTestClick({role:'button',name},'plugins'),false);
});
