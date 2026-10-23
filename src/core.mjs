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
  const readClaims = (items, max) => Array.isArray(items) ? items.slice(0, max).map(item => ({
    claim: short(typeof item === 'string' ? item : item?.claim),
    evidence_line_ids: Array.isArray(item?.evidence_line_ids) ? item.evidence_line_ids.slice(0, 4) : [],
    severity: item?.severity === 'critical' ? 'critical' : item?.severity === 'warning' ? 'warning' : 'unknown'
  })).filter(item => item.claim.length) : [];
  return {
    severity,
    summary: short(obj.summary),
    observations: readClaims(obj.observations, 8),
    issues: readClaims(obj.issues, 6),
    uncertainties: Array.isArray(obj.uncertainties) ? obj.uncertainties.slice(0, 8).map(short) : [],
    recommendation: short(obj.recommendation)
  };
}

// Model-suggested issues with a valid snapshot line are *review candidates*, never
// independently verified defects. Missing tests, absent properties, and uncertainty
// alone must not elevate the actionable priority.
export function assessTriage(analysis) {
  const issues = Array.isArray(analysis?.issues) ? analysis.issues : [];
  const candidates = issues.filter(issue => Array.isArray(issue.evidence) && issue.evidence.length > 0);
  const priority = candidates.some(i => i.severity === 'critical') ? 'critical'
    : candidates.some(i => i.severity === 'warning') ? 'warning' : 'info';
  const rationale = priority === 'info'
    ? 'No separate, source-linked issue requiring investigation was submitted; missing test evidence is not a confirmed defect.'
    : 'Source-linked model issue candidate(s) exist; prioritization is provisional until manual verification.';
  return { priority, rationale, candidateCount: candidates.length };
}

export function reportMarkdown({ site, time, runId, hash, analysis, truncated, evidenceLineCount = 0 }) {
  const clean = s => redact(String(s)).replace(/\r/g, '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = s => clean(s).replace(/\n/g, ' ');
  const quote = s => inline(s).replace(/([\\\x60*_{}\[\]])/g, '\\$1');
  const bullets = xs => xs.length ? xs.map(x => '- ' + inline(x)).join('\n') : '- None';
  const supported = (analysis.observations ?? []).map(item =>
    '- ' + inline(item.claim) + '\n' + item.evidence.map(e => '  - ' + e.id + ': “' + quote(e.text) + '”').join('\n')
  );
  const unsupported = (analysis.unsupported ?? []).map(item => '- ' + inline(item.claim) + ' — ' + inline(item.reason));
  const triage = assessTriage(analysis);
  const manualFollowUp = triage.candidateCount === 0
    ? 'Verify the uncertainties on the live page before considering any change. No corrective action is established by this snapshot.'
    : 'Manually confirm source-linked issue candidates before changing the page. Unverified model suggestion: ' + inline(analysis.recommendation || 'Review each candidate against the live page.');
  const issueRows = (analysis.issues ?? []).map(item => '- ' + inline(item.claim) + ' (model-assessed ' + inline(item.severity) + ')'
    + '\n' + item.evidence.map(e => '  - ' + e.id + ': “' + quote(e.text) + '”').join('\n'));
  const issueMissing = (analysis.unsupportedIssues ?? []).map(item => '- ' + inline(item.claim) + ' — ' + inline(item.reason));
  return [
    '# Website Audit — ' + clean(site.id),
    '', '- Time (UTC): ' + clean(time),
    '- Correlation: ' + clean(runId),
    '- URL: ' + clean(site.url),
    '- Browser profile: ' + clean(site.profile),
    '- Snapshot SHA-256: ' + hash,
    '- Snapshot truncated: ' + (truncated ? 'yes' : 'no'),
    '- Evidence protocol: evidence-v2 (numbered snapshot lines; model claims are not independently verified)',
    '- Evidence lines shown to model: ' + evidenceLineCount,
    '- Review priority (source-linked model candidates; not verified): ' + triage.priority,
    '- Model-suggested severity (not independently verified): ' + clean(analysis.severity),
    '- Review-priority rationale: ' + inline(triage.rationale),
    '', '## Summary (model interpretation)', inline(analysis.summary),
    '', '## Evidence-linked observations (source excerpts; verify interpretation)',
    supported.length ? supported.join('\n') : '- None',
    '', '## Model claims with insufficient evidence (unverified)',
    unsupported.length ? unsupported.join('\n') : '- None',
    '', '## Source-linked issue candidates (manual verification required)',
    issueRows.length ? issueRows.join('\n') : '- None',
    '', '## Uncited issue proposals (not used to set priority)',
    issueMissing.length ? issueMissing.join('\n') : '- None',
    '', '## Uncertainties', bullets(analysis.uncertainties ?? []),
    '', '## Manual verification (do not change page without evidence)', manualFollowUp,
    '', '> Source excerpts are taken from the redacted accessibility snapshot, not written by the model. A matching source line does not prove the claim is correct. This is not a verified functional test.',
    ''
  ].join('\n');
}
