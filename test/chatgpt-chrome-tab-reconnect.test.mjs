import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..');
const launcher=readFileSync(resolve(root,'scripts/chatgpt-loop.sh'),'utf8');
const log=readFileSync(resolve(root,'stage2/diagnostic-log.mjs'),'utf8');

test('selected-tab reconnect is bounded to eight two-second checks only on zero authorized tabs',()=>{
 const sh=spawnSync('bash',['-n',resolve(root,'scripts/chatgpt-loop.sh')],{encoding:'utf8'});
 assert.equal(sh.status,0,sh.stderr);
 assert.match(launcher,/if \[\[ "\$BROWSER_PROFILE" == chrome \]\] && \(\( TAB_VISIBLE == 0 \)\); then/);
 assert.match(launcher,/for \(\( retry=1; retry<=8; retry\+\+ \)\); do/);
 assert.match(launcher,/sleep 2/);
 assert.match(launcher,/if \(\( TAB_VISIBLE > 0 \)\); then/);
 assert.match(launcher,/tab_retry_recovered/);
 assert.match(launcher,/tab_retry_timeout/);
 assert.match(launcher,/RETRY_QUERIES_OK == 0/);
 assert.match(launcher,/Chrome browser relay tab queries failed on every retry/);
 assert.match(launcher,/If Access=All tabs, no tab group is needed/);
 assert.match(launcher,/Relay unavailable WHILE this launcher is running/);
 assert.doesNotMatch(launcher,/Chrome extension is connected but exposes 0 tabs/);
});

test('a new authorized tab is counted but never auto-opened or granted permission in Chrome extension mode',()=>{
 assert.match(launcher,/read_authorized_tab_counts\(\)/);
 assert.match(launcher,/read -r TAB_COUNT TAB_VISIBLE TAB_CHATGPT TAB_SAME_ID/);
 assert.match(launcher,/process\.stdout\.write\(\[same\.length,t\.length,chat\.length,same\.length\]/);
 assert.match(launcher,/Chrome relay returned malformed tab metadata during retry; stopping/);
 assert.match(launcher,/if ! tabs="\$\("\$OPENCLAW_BIN" browser --browser-profile "\$BROWSER_PROFILE" --json tabs 2>\/dev\/null\)"; then/);
 assert.doesNotMatch(launcher,/--disable-web-security|dangerouslyAllowPrivateNetwork|allowPrivateNetwork|--remote-debugging-port/);
 assert.doesNotMatch(launcher,/openclaw config set browser\.defaultProfile chrome/);
});

test('retry attempts produce only allowlisted diagnostic events, not any tab data',()=>{
 for(const event of ['tab_retry_started','tab_retry_recovered','tab_retry_timeout','tab_retry_error']){
  assert.match(log,new RegExp("'"+event+"'"));
  assert.match(launcher,new RegExp('log_event '+event));
 }
 assert.doesNotMatch(launcher,/echo "\$tabs"|echo "\$TAB_COUNTS"/);
});
