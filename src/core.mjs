import { createHash } from 'node:crypto';

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const PROFILE = /^[a-zA-Z0-9_-]{1,40}$/;

export function canonicalUrl(input) {
  if (typeof input !== 'string') throw new Error('URL must be a string');
  const url = new URL(input);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('URLs containing credentials, queries or fragments are not allowed');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!(url.protocol === 'https:' || (url.protocol === 'http:' && local))) {
    throw new Error('Only HTTPS URLs or HTTP loopback URLs are allowed');
  }
  return url.href;
}

export function validateSites(value) {
  if (!value || !Array.isArray(value.sites) || value.sites.length < 1 || value.sites.length > 20) {
    throw new Error('sites must contain between 1 and 20 entries');
  }
  const ids = new Set();
  return value.sites.map(site => {
    if (!site || !ID.test(site.id) || !PROFILE.test(site.profile)) {
      throw new Error('Invalid site id or browser profile');
    }
    if (ids.has(site.id)) throw new Error('Duplicate site id: ' + site.id);
    ids.add(site.id);
    return { id: site.id, url: canonicalUrl(site.url), profile: site.profile, enabled: site.enabled === true };
  });
}

export function findExactTab(result, site) {
  const tabs = Array.isArray(result) ? result : (result?.tabs ?? result?.result?.tabs);
  if (!Array.isArray(tabs)) throw new Error('Unexpected OpenClaw tabs response; inspect CLI version');
  const matched = tabs.filter(tab => {
    try { return canonicalUrl(tab.url) === site.url; } catch { return false; }
  });
  if (matched.length !== 1) throw new Error('Expected exactly one matching open tab; found ' + matched.length);
  const tab = matched[0];
  const id = tab.suggestedTargetId ?? tab.tabId ?? tab.targetId;
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_:-]{1,128}$/.test(id)) {
    throw new Error('OpenClaw tab lacks a valid target id');
  }
  return id;
}

export function redact(text) {
  return String(text)
    .replace(/-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]')
    .replace(/\b(?:Bearer\s+)[a-z0-9._~+\/-]{12,}/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:api[_ -]?key|secret|password|passwd|token|authorization|cookie)\s*[:=]\s*["']?[^\s,"']{6,}/gi, '[REDACTED CREDENTIAL]')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})\b/g, '[REDACTED TOKEN]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED EMAIL]');
}

export function digest(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function parseAnalysis(content) {
  if (typeof content !== 'string') throw new Error('Ollama response was not text');
  const trimmed = content.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, '').replace(/\s*\x60\x60\x60$/, '');
  let obj;
  try { obj = JSON.parse(trimmed); } catch { throw new Error('Model did not produce JSON; no report claimed'); }
  if (!obj || Array.isArray(obj) || typeof obj !== 'object') throw new Error('Invalid model response');
  const severity = ['info', 'warning', 'critical'].includes(obj.severity) ? obj.severity : 'unknown';
  const short = value => redact(typeof value === 'string' ? value.slice(0, 1200) : '');
  return {
    severity,
    summary: short(obj.summary),
    observations: Array.isArray(obj.observations) ? obj.observations.slice(0, 6).map(short) : [],
    uncertainties: Array.isArray(obj.uncertainties) ? obj.uncertainties.slice(0, 6).map(short) : [],
    recommendation: short(obj.recommendation)
  };
}

export function reportMarkdown({ site, time, runId, hash, analysis, truncated }) {
  const clean = s => redact(String(s)).replace(/\r/g, '').replace(/</g, '&lt;');
  const bullets = xs => xs.length ? xs.map(x => '- ' + clean(x).replace(/\n/g, ' ')).join('\n') : '- 无';
  return [
    '# Website Audit — ' + clean(site.id),
    '', '- Time (UTC): ' + clean(time),
    '- Correlation: ' + clean(runId),
    '- URL: ' + clean(site.url),
    '- Browser profile: ' + clean(site.profile),
    '- Snapshot SHA-256: ' + hash,
    '- Snapshot truncated: ' + (truncated ? 'yes' : 'no'),
    '- Severity (model assessment): ' + clean(analysis.severity),
    '', '## Summary', clean(analysis.summary),
    '', '## Observations (verify against page)',
    bullets(analysis.observations),
    '', '## Uncertainties', bullets(analysis.uncertainties),
    '', '## Suggested manual checks', clean(analysis.recommendation),
    '', '> An AI-generated review of a read-only accessibility snapshot, not a verified functional test. No browser actions or terminal commands were executed from the page.',
    ''
  ].join('\n');
}
