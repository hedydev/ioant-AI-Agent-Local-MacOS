import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const root=resolve(import.meta.dirname,'..');
const launcher=readFileSync(resolve(root,'scripts/chatgpt-loop.sh'),'utf8');
const worker=readFileSync(resolve(root,'stage2/chatgpt-loop.mjs'),'utf8');

test('persistent watcher waits for temporarily absent conversation without opening or changing tabs',()=>{
 const syntax=spawnSync('bash',['-n',resolve(root,'scripts/chatgpt-loop.sh')],{encoding:'utf8'});
 assert.equal(syntax.status,0,syntax.stderr);
 assert.match(launcher,/WATCH_WAIT=0/);
 assert.match(launcher,/--watch\) WATCH_WAIT=1/);
 assert.match(launcher,/--once\) WATCH_WAIT=0/);
 assert.match(launcher,/if \(\( WATCH_WAIT == 1 \)\); then/);
 assert.match(launcher,/Watch mode waiting for one validated ChatGPT conversation ID/);
 assert.match(launcher,/else\n\s+exit 1\n\s+fi\n\s+fi\n\s+;;/);
 assert.match(worker,/while\(!target\)\{/);
 assert.match(worker,/target=await exactTab\(opts\.url\)/);
 assert.match(worker,/await readPage\(target,opts\.url\)/);
 assert.match(worker,/await new Promise\(r=>setTimeout\(r,opts\.interval\*1000\)\)/);
 assert.match(worker,/lastStartupMissingLog/);
});

test('passive wait never bypasses duplicate conversation detection or exact page validation',()=>{
 assert.match(launcher,/case "\$TAB_COUNT" in/);
 assert.match(launcher,/\*\) log_event tab_missing \|\| true; echo .*Found \$TAB_COUNT copies of the target ChatGPT conversation ID.*exit 1/);
 assert.match(launcher,/if \[\[ "\$BROWSER_PROFILE" == openclaw \]\]; then/);
 assert.match(launcher,/\$OPENCLAW_BIN" browser --browser-profile "\$BROWSER_PROFILE" open "\$validated"/);
 assert.match(worker,/const matches=tabs\.filter\(t=>sameChatConversationUrl\(t\?\.url,url\)\)/);
 assert.match(worker,/if\(matches\.length!==1\)/);
 assert.match(worker,/!sameChatConversationUrl\(parsed\.url,url\)/);
 assert.doesNotMatch(launcher,/--disable-web-security|dangerouslyAllowPrivateNetwork|allowPrivateNetwork|chrome\.debugger/);
});

test('same missing-target event is throttled while worker stays alive',()=>{
 assert.match(worker,/const now=Date\.now\(\)/);
 assert.match(worker,/if\(now-lastStartupMissingLog>=60000\)/);
 assert.match(worker,/recordDiagnosticEvent\('page_not_ready',\{code:diagnosticCode\(e\)\}\)/);
 assert.doesNotMatch(worker,/process\.exit\(1\).*no.*tab/i);
});
