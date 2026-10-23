import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('stage-1 project does not demand a separate OpenClaw Node version via fnm resolve-engines', () => {
  const manifest = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
  assert.equal(manifest.engines?.node, undefined, 'Do not force OpenClaw runtime requirement onto stage-1 scripts');
});
test('preflight checks stage-1 Node independently from OpenClaw runtime', () => {
  const script = readFileSync(resolve('scripts/preflight.sh'), 'utf8');
  assert.match(script, /Node 20 or newer/);
  assert.match(script, /OpenClaw might use its own compatible Node/);
  assert.doesNotMatch(script, /Node requires >=24\.22\.1/);
});
