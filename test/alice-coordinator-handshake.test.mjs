import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {
 HANDSHAKE_MESSAGE,HANDSHAKE_RECEIPT,validateHandshakeRecord
} from '../stage2/alice-coordinator-handshake.mjs';
import {actionFromJson} from '../stage2/protocol.mjs';
import {isolatedProjectAllowsAction,validateIsolatedProjectScope} from '../stage2/project-worker-scope.mjs';

const ROOT=resolve(import.meta.dirname,'..');
const source=readFileSync(resolve(ROOT,'stage2/chatgpt-loop.mjs'),'utf8');
const mailbox=readFileSync(resolve(ROOT,'stage2/alice-coordinator-handshake.mjs'),'utf8');
const routes=JSON.parse(readFileSync(resolve(ROOT,'config/chat-projects.json'),'utf8'));
const alice=routes.projects.find(p=>p.key==='alice-ai');
const record={schemaVersion:1,projectKey:'alice-ai',
 conversationId:'6ade11a5-f0c0-83ec-add1-8a0cff00c938',
 taskId:'alice-coordinator-verify-20261027-103',phase:'requested'};

test('Alice handshake is one fixed user message, pinned to the real AliceAI Project and read-only task',()=>{
 assert.ok(HANDSHAKE_MESSAGE.startsWith(HANDSHAKE_RECEIPT));
 assert.match(HANDSHAKE_MESSAGE,/openclaw-gui-readonly-probe/);
 assert.match(HANDSHAKE_MESSAGE,/ioant-mac-ops-v1/);
 assert.match(HANDSHAKE_MESSAGE,/alice-coordinator-verify-20261027-103/);
 assert.doesNotMatch(HANDSHAKE_MESSAGE,/mac-terminal|mac-window-text|project-update-verify|sudo/);
 const opts={projectKey:'alice-ai',url:alice.chatUrl,mode:'watch',initialize:false,
  devAgent:null,enableGuiReadonly:true,enableAlicePreflight:false,
  enableAliceLabStartupProbe:false,enableMintDiagnostics:false,enableSelfUpdate:false,
  enableOpenClawProvision:false,enableOpenClawAgentCreate:false,enableOpenClawDevCreate:false};
 const scope=validateIsolatedProjectScope(opts,routes,'chrome');
 const task=actionFromJson(JSON.stringify({protocol:'ioant-mac-ops-v1',
  id:record.taskId,action:'openclaw-gui-readonly-probe'}));
 assert.equal(isolatedProjectAllowsAction(scope,task,opts),true);
});
test('strict mailbox schema and irreversible phases reject foreign or malformed requests',()=>{
 for(const phase of ['requested','press_intent','confirmed']){
  assert.equal(validateHandshakeRecord({...record,phase}).phase,phase);
 }
 for(const bad of [
  {...record,phase:'retry'},{...record,projectKey:'openclaw-workflow'},
  {...record,conversationId:'aaaa-bbbb'},{...record,taskId:'shell-001'},
  {...record,arbitraryCommand:'rm'}, {...record,schemaVersion:2},[],
  null,'untrusted'
 ])assert.throws(()=>validateHandshakeRecord(bad),/handshake_mailbox_invalid/);
 assert.match(mailbox,/flag:'wx'/);
 assert.match(mailbox,/from==='requested'&&to==='press_intent'/);
 assert.match(mailbox,/from==='press_intent'&&to==='confirmed'/);
 assert.doesNotMatch(mailbox,/execFile|spawn\(|shell:true|browser.*press|mkdir\(/);
});
test('single existing Alice watcher alone handles fixed request while other pending work has priority',()=>{
 const at=source.indexOf('const a=extractWatchedAction(page)');
 const kind=source.indexOf("if(isolatedProjectScope&&a.status==='idle')",at);
 const action=source.indexOf("if(a.status==='task'&&a.task.id!==state.lastTaskId)",kind);
 assert.ok(at>0&&kind>at&&action>kind);
 assert.match(source,/if\(handshake.phase==='press_intent'\)/);
 assert.match(source,/await confirmUserReceipt\(opts.url,receipt\)/);
 assert.match(source,/beforePress:async\(\)=>\{await transitionHandshake\('requested','press_intent'\)\}/);
 assert.match(source,/await transitionHandshake\('press_intent','confirmed'\)/);
 assert.match(source,/Alice coordinator handshake send uncertain; no blind resend/);
 assert.doesNotMatch(mailbox,/IOANT_BACKGROUND_SAFE_REPORTS.*0/);
});
test('unrecognized CLI arguments do not create or send a handshake',()=>{
 const r=spawnSync(process.execPath,[resolve(ROOT,'stage2/alice-coordinator-handshake.mjs'),
  'send','https://evil.example/'],{encoding:'utf8',timeout:5000,
  env:{...process.env,PROJECT_DEV_CACHE:'/nonexistent',IOANT_DEV_VOLUME:'/notvolume'}});
 assert.equal(r.status,1);
 const reply=JSON.parse(r.stdout.trim());
 assert.equal(reply.state,'blocked');
 assert.equal(reply.reason,'invalid_command');
});
