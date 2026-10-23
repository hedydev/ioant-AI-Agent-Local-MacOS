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

  // Match executable command lines, not incidental prose such as "fnm installation".
  const forbiddenCommands = [
    /^\s*(?:npm\s+install\s+(?:-g|--global)(?:\s|$)|fnm\s+install(?:\s|$)|rm\s+-rf(?:\s|$))/m,
    /^\s*(?:"\$OPENCLAW_BIN"|openclaw)\s+gateway\s+(?:install|stop)(?:\s|$)/m,
  ];
  for (const pattern of forbiddenCommands) assert.doesNotMatch(source, pattern);
});
test('bootstrap uses authenticated loopback Gateway, no persistent changes', () => {
  assert.match(source, /gateway run --allow-unconfigured --bind loopback --auth token --tailscale off/);
  assert.match(source, /openssl rand -hex 32/);
  assert.match(source, /kill "\$GATEWAY_PID"/);
  assert.match(source, /https:\/\/example\.com\//);
  assert.match(source, /node src\/audit\.mjs --once --id example/);
});

test('ordinary guidance mentioning fnm installation is not a shell install command', () => {
  const guidance = "first inspect your existing fnm installation.";
  assert.match(guidance, /fnm install/); // This caused the previous false positive.
  assert.doesNotMatch(guidance, /^\s*fnm\s+install(?:\s|$)/m);
});
