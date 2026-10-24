import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const source=readFileSync(resolve(root,'stage2/chatgpt-loop.mjs'),'utf8');

test('watch visibly distinguishes idle prose, generating reply and previously handled task',()=>{
 const anchor="const watchStatus=a.status==='idle'?'idle'";
 const ix=source.indexOf(anchor);
 assert.ok(ix>0);
 const next=source.slice(ix,source.indexOf('await new Promise(resolve=>setTimeout(resolve,opts.interval*1000));',ix));
 assert.match(next,/a\.status==='generating'\?'generating'/);
 assert.match(next,/a\.task\.id===state\.lastTaskId\?'handled':'candidate'/);
 assert.match(next,/if\(watchStatus!==lastVisibleStatus\)/);
 assert.match(next,/Waiting for a structured ChatGPT task; latest reply contains no executable JSON/);
 assert.match(next,/Watch heartbeat:/);
 assert.match(next,/recordDiagnosticEvent\('watch_heartbeat',\{status:watchStatus\}\)/);
 assert.doesNotMatch(next,/await sendToChat|await runAction|await browser\('type'|await browser\('press'/);
});

test('existing allowlisted execution remains gated by a structured task and two stable reads',()=>{
 assert.match(source,/const a=extractAction\(page\)/);
 assert.match(source,/if\(a\.status==='task'&&a\.task\.id!==state\.lastTaskId\)/);
 assert.match(source,/if\(stable>=2\)/);
 // AI advice is gated by the operator-selected Agent, not arbitrary ChatGPT text.
 assert.match(source,/const isDevDiscussion=\['openclaw-alice-dev-discuss','openclaw-agent-dev-discuss'\]\.includes\(task\.action\)/);
 assert.match(source,/const devBindingOk=isBoundDevDiscussion\(task\.action,opts\.devAgent\)/);
 assert.match(source,/const authorized=\(task\.authorized&&\(!isDevDiscussion\|\|devBindingOk\)\) \|\|/);
 assert.match(source,/task\.action==='alice-witness-preflight' && opts\.enableAlicePreflight/);
 assert.match(source,/task\.action==='alice-lab-startup-probe' && opts\.enableAliceLabStartupProbe/);
 assert.match(source,/task\.action==='project-update-verify' && opts\.enableSelfUpdate/);
});
