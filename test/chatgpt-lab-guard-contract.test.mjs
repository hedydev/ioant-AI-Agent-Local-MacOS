import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const root=resolve(import.meta.dirname,'..');
const launcher=readFileSync(resolve(root,'scripts/chatgpt-loop.sh'),'utf8');
const worker=readFileSync(resolve(root,'stage2/chatgpt-loop.mjs'),'utf8');
const runner=readFileSync(resolve(root,'stage2/runner.mjs'),'utf8');
const lab=readFileSync(resolve(root,'stage2/alice-lab-startup.mjs'),'utf8');
const protocol=readFileSync(resolve(root,'stage2/protocol.mjs'),'utf8');

test('new lab start requires its own operator opt-in; old Alice preflight flag cannot authorize',()=>{
 const syntax=spawnSync('bash',['-n',resolve(root,'scripts/chatgpt-loop.sh')],{encoding:'utf8'});
 assert.equal(syntax.status,0,syntax.stderr);
 assert.match(launcher,/--enable-alice-lab-startup-probe/);
 assert.match(launcher,/No production 17879 BDS restart/);
 assert.match(worker,/out\.enableAliceLabStartupProbe=true/);
 assert.match(worker,/opts\.enableAliceLabStartupProbe && !process\.env\.ALICE_SSH_TARGET/);
 assert.match(runner,/if\(options\.enableAliceLabStartupProbe!==true\)/);
 assert.match(protocol,/'alice-lab-startup-probe'/);
});

test('no chat-provided shell or remote target; exact fixed scripts and one-shot gate only',()=>{
 assert.match(lab,/allowedAliceOrigin\(origin\.output\)/);
 assert.match(lab,/validSshTarget\(sshTarget\)/);
 assert.match(lab,/witness-lab-startup-check/);
 assert.match(lab,/witness-lab-startup-probe/);
 assert.match(lab,/if\(clean\.output\.trim\(\)\)/);
 assert.match(lab,/shell/); // Only a comment about unsafe shell, not a shell option.
 assert.doesNotMatch(lab,/shell:true|spawn\(.*"ssh"|--force/);
 assert.match(worker,/state\.labProbeAttempted=\{id:task\.id,at:new Date\(\)\.toISOString\(\)\};/);
 assert.match(worker,/await atomicState\(stateFile,state\);\s*recordDiagnosticEvent\('lab_probe_claimed'/);
});

test('protocol initialization for the 17880 probe remains exact chat task and feedback',()=>{
 assert.match(worker,/const INIT_LAB=/);
 assert.match(worker,/alice-lab-唯一新任务编号/);
 assert.match(worker,/action.*alice-lab-startup-probe/);
 assert.match(worker,/ensureInitialization\(opts\.enableAliceLabStartupProbe\?'lab':/);
 assert.match(worker,/Alice isolated 17880 startup probe ioant-mac-ops-v1/);
 assert.match(protocol,/Fresh validated 17880 LAB startup JSON/);
 assert.doesNotMatch(protocol,/AUTO_ACTIONS.*alice-lab-startup-probe/);
});
