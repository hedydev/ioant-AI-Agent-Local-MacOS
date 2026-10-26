import test from 'node:test';
import assert from 'node:assert/strict';
import {
 boundChat,renderPlist,installedPlistBinding,installedPlistKind
} from '../stage2/ops-supervisor.mjs';
import {candidatePlist} from '../stage2/ops-rebind.mjs';

const CURRENT='https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/6adf6584-1a40-83ec-a4ab-c59ac7e28cf7';
const OLD='https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/6add3565-d868-83ec-804e-1e7a00eb0a59';
const NODE='/Users/ted/.nvm/versions/node/v24.9.0/bin';

test('operator-approved same-project rebind only changes the exact chat argument',()=>{
 const initial=renderPlist(NODE);
 const plan=candidatePlist(initial,CURRENT);
 assert.equal(plan.old.conversationId,'6add3565-d868-83ec-804e-1e7a00eb0a59');
 assert.equal(plan.target.conversationId,'6adf6584-1a40-83ec-a4ab-c59ac7e28cf7');
 assert.equal(plan.next,initial.replace(OLD,CURRENT));
 assert.equal(installedPlistBinding(plan.next).kind,'local');
 assert.equal(installedPlistBinding(plan.next).conversationId,plan.target.conversationId);
 assert.equal(installedPlistKind(plan.next),'local');
 assert.equal(installedPlistKind(initial),'local');
});

test('same Project can use renamed URL suffix without changing stable project identity',()=>{
 const renamed=CURRENT.replace('ai-openclawgong-zuo-liu','new-project-display-name');
 assert.equal(boundChat(renamed).conversationId,'6adf6584-1a40-83ec-a4ab-c59ac7e28cf7');
 const rebound=renderPlist(NODE,{chatUrl:renamed});
 assert.equal(installedPlistBinding(rebound).conversationId,'6adf6584-1a40-83ec-a4ab-c59ac7e28cf7');
});

test('malicious paths, cross-project and ambiguous URLs are rejected',()=>{
 const variants=[
  CURRENT.replace('6adbdb6e70348191bc5acb11efb0db5d','ffffffffffffffffffffffffffffffff'),
  CURRENT+'?utm_source=chatgpt.com',
  CURRENT+'#injected',
  CURRENT.replace('chatgpt.com','example.org'),
  CURRENT.replace('/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu',''),
  CURRENT+'?cmd=sudo',
 ];
 for(const url of variants)assert.throws(()=>boundChat(url),undefined,url);
 assert.throws(()=>candidatePlist(renderPlist(NODE),OLD),/same_conversation/);
});

test('rebound plist must remain a complete exact trusted template',()=>{
 const bound=renderPlist(NODE,{chatUrl:CURRENT});
 for(const tampered of [
  bound.replace('--enable-gui-readonly','--enable-openclaw-provision'),
  bound.replace('<key>RunAtLoad</key><true/>','<key>RunAtLoad</key><false/>'),
  bound.replace('<key>KeepAlive</key><false/>','<key>KeepAlive</key><true/>'),
  bound.replace('com.ioant.openclaw.safe-watcher','com.ioant.other'),
  bound.replace(CURRENT,CURRENT+'?cmd=1'),
  bound.replace(CURRENT,CURRENT+'\n--enable-alice-preflight'),
 ])assert.equal(installedPlistBinding(tampered),null);
});

test('recognized original legacy supervisor templates remain manageable',()=>{
 const old=renderPlist(NODE,{legacyExternalLogs:true});
 const old2=renderPlist(NODE,{legacyDocumentRoot:true});
 assert.equal(installedPlistBinding(old).kind,'legacy_external');
 assert.equal(installedPlistBinding(old2).kind,'legacy_document_local');
 const rebound=renderPlist(NODE,{chatUrl:CURRENT});
 assert.equal(installedPlistBinding(rebound).kind,'local');
 assert.throws(()=>candidatePlist(old,CURRENT),/unrecognized_plist/);
});
