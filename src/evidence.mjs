import { redact } from './core.mjs';

// One short source excerpt per original snapshot line. No raw private snapshot is persisted.
export function buildEvidenceSnapshot(raw, { maxChars = 20000, maxLines = 240, maxLineChars = 420 } = {}) {
  const full = redact(String(raw)).replace(/\r\n?/g, '\n');
  const bounded = full.slice(0, maxChars);
  const allLines = bounded.split('\n');
  const lines = [];
  let clipped = full.length > maxChars;
  for (let i = 0; i < allLines.length; i++) {
    const sourceLine = allLines[i].trim().replace(/[\t\x00-\x08\x0b-\x1f]/g, ' ');
    if (!sourceLine) continue;
    if (lines.length === maxLines) { clipped = true; break; }
    const excerpt = sourceLine.slice(0, maxLineChars);
    if (sourceLine.length > maxLineChars) clipped = true;
    lines.push({ id: 'L' + String(i + 1).padStart(4, '0'), text: excerpt });
  }
  if (!lines.length) throw new Error('Browser snapshot had no usable evidence lines');
  return {
    lines,
    numberedText: lines.map(line => line.id + ' | ' + line.text).join('\n'),
    bounded,
    truncated: clipped
  };
}

// The evidence text is ALWAYS obtained from browser material, never supplied by a model.
export function attachEvidence(analysis, lines) {
  const lookup = new Map(lines.map(line => [line.id, line.text]));
  const observations = [];
  const unsupported = [];
  for (const item of analysis.observations) {
    const ids = Array.isArray(item.evidence_line_ids) ? item.evidence_line_ids : [];
    const unique = [...new Set(ids)].slice(0, 4);
    if (!unique.length || unique.some(id => !lookup.has(id))) {
      unsupported.push({
        claim: item.claim,
        reason: unique.length ? 'Invalid source line reference' : 'No source line reference'
      });
      continue;
    }
    observations.push({
      claim: item.claim,
      evidence: unique.map(id => ({ id, text: lookup.get(id) }))
    });
  }
  return { ...analysis, observations, unsupported };
}
