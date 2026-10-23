import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const root=resolve(import.meta.dirname,'..');
const launcher=readFileSync(resolve(root,'scripts/chatgpt-loop.sh'),'utf8');
const worker=readFileSync(resolve(root,'stage2/chatgpt-loop.mjs'),'utf8');

test('launcher supports exact managed/user/extension profiles but does not loosen SSRF',()=>{
  const syntax=spawnSync('bash',['-n',resolve(root,'scripts/chatgpt-loop.sh')],{encoding:'utf8'});
  assert.equal(syntax.status,0,syntax.stderr);
  assert.match(launcher,/BROWSER_PROFILE="\$\{IOANT_CHATGPT_BROWSER_PROFILE:-openclaw\}"/);
  assert.match(launcher,/openclaw\|user\|chrome\)/);
  assert.match(launcher,/export IOANT_CHATGPT_BROWSER_PROFILE="\$BROWSER_PROFILE"/);
  assert.match(launcher,/openclaw\|user\) "\$OPENCLAW_BIN" browser --browser-profile "\$BROWSER_PROFILE" start/);
  assert.match(launcher,/chrome\) echo '\[loop\] Using already-paired Chrome extension profile/);
  assert.doesNotMatch(launcher,/dangerouslyAllowPrivateNetwork|allowPrivateNetwork|--disable-web-security|--no-sandbox/);
});

test('existing Chrome must contain exactly one previously opened authorized chat; no new Chrome tabs',()=>{
  assert.match(launcher,/TAB_COUNTS=/);
  assert.match(launcher,/read -r TAB_COUNT TAB_VISIBLE TAB_CHATGPT TAB_SAME_ID/);
  assert.match(launcher,/t\.filter|t\.filter\(/);
  assert.match(launcher,/1\) echo "\[loop\] Reusing exactly one matching ChatGPT tab/);
  assert.match(launcher,/if \[\[ "\$BROWSER_PROFILE" == openclaw \]\]; then/);
  assert.match(launcher,/No exact target tab among \$TAB_VISIBLE authorized tabs/);
  assert.match(launcher,/a DIFFERENT project URL/);
  assert.match(launcher,/Found \$TAB_COUNT copies of the target ChatGPT tab/);
  assert.match(worker,/if\(!\['openclaw','user','chrome'\]\.includes\(profile\)\)/);
  assert.match(worker,/parsed\.url!==url/);
  assert.match(worker,/matches\.length!==1/);
});
