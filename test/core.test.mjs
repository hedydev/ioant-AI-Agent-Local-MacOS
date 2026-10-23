import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalUrl, validateSites, findExactTab, redact, digest, parseAnalysis, reportMarkdown } from '../src/core.mjs';

test('URL allowlist: HTTPS and loopback HTTP only, no credentials or query', () => {
  assert.equal(canonicalUrl('https://example.com'), 'https://example.com/');
  assert.equal(canonicalUrl('http://127.0.0.1:8787/a'), 'http://127.0.0.1:8787/a');
  for (const value of ['http://example.com/', 'file:///etc/passwd', 'https://foo/?token=foo', 'https://user:pass@foo/', 'https://example.com/#secret']) {
    assert.throws(() => canonicalUrl(value));
  }
});

test('watchlist validation and duplicate detection', () => {
  const v = validateSites({ sites: [{ id: 'a', url: 'https://example.com', profile: 'openclaw', enabled: true }] });
  assert.equal(v[0].url, 'https://example.com/');
  assert.equal(v[0].enabled, true);
  assert.throws(() => validateSites({ sites: [v[0], v[0]] }), /Duplicate/);
});

test('exact tab match fails closed on zero or duplicates or unexpected URL', () => {
  const site = { url: 'https://example.com/' };
  const tabs = { tabs: [{ url: 'https://example.com/', suggestedTargetId: 't1' }] };
  assert.equal(findExactTab(tabs, site), 't1');
  assert.throws(() => findExactTab({ tabs: [] }, site), /exactly one/);
  assert.throws(() => findExactTab({ tabs: [tabs.tabs[0], tabs.tabs[0]] }, site), /exactly one/);
  assert.throws(() => findExactTab({ tabs: [{ url: 'https://evil.example.com/', tabId: 't2' }] }, site), /exactly one/);
});

test('redaction of private key, emails and common token forms', () => {
  const txt = 'alice@example.com Bearer abcdefghijklmnopqrstuvwxyz password=supersecure ghp_abcdefghijklmnopqrstuvwxyz012345';
  const v = redact(txt);
  assert.doesNotMatch(v, /alice@example|supersecure|ghp_abcdef|Bearer abcdef/);
  assert.match(v, /REDACTED/);
});

test('parse model strict JSON and conservatively report failures', () => {
  const parsed = parseAnalysis(JSON.stringify({ severity: 'critical', summary: 'broken', observations: ['error'], uncertainties: [], recommendation: 'check manually' }));
  assert.equal(parsed.severity, 'critical');
  assert.throws(() => parseAnalysis('All good!'), /JSON/);
  assert.equal(parseAnalysis('{}').severity, 'unknown');
});

test('digest determinism and Markdown report provenance', () => {
  assert.equal(digest('hello'), digest('hello'));
  assert.notEqual(digest('hello'), digest('world'));
  const report = reportMarkdown({ site: { id: 'demo', url: 'https://example.com/', profile: 'openclaw' }, time: 'now', runId: 'run-1', hash: digest('hello'), analysis: { severity: 'info', summary: 'ok', observations: [], uncertainties: [], recommendation: 'inspect' }, truncated: false });
  assert.match(report, /run-1/);
  assert.match(report, /not a verified functional test/);
});
