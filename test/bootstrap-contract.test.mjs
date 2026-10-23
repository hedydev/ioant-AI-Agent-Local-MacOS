import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const path = resolve('scripts/bootstrap-phase1.sh');
const source = readFileSync(path, 'utf8');

test('bootstrap shell syntax', () => {
  const run = spawnSync('bash', ['-n', path], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
});
test('bootstrap preserves existing local installations and uses isolated runtime', () => {
  assert.match(source, /command -v openclaw/);
  assert.match(source, /--runtime-only --no-onboard/);
  assert.match(source, /--prefix "\$OPENCLAW_PREFIX"/);
  assert.doesNotMatch(source, /npm install -g|fnm install|gateway install|gateway stop|rm -rf/);
});
test('bootstrap uses authenticated loopback Gateway, no persistent changes', () => {
  assert.match(source, /gateway run --allow-unconfigured --bind loopback --auth token --tailscale off/);
  assert.match(source, /openssl rand -hex 32/);
  assert.match(source, /kill "\$GATEWAY_PID"/);
  assert.match(source, /https:\/\/example\.com\//);
  assert.match(source, /node src\/audit\.mjs --once --id example/);
});
