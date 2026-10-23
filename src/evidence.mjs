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
// The model sometimes describes separately cited paragraph nodes as one multilingual
// paragraph. Reject that narrow structural mismatch instead of silently presenting it
// as a sourced observation. This is not a general semantic entailment checker.
function structuralContradiction(claim, evidence) {
  const lines = evidence.map(entry => entry.text);
  const paragraphNodes = lines.filter(line => /^(?:[-*]\s*)?paragraph\b/i.test(line));
  const singleParagraph = /\b(?:a|an|one|single)\s+(?:(?:\S+\s+){0,2})?paragraph\b/i.test(claim);
  const claimsMultilingual = /\b(?:multilingual|multi-language|multiple languages|different languages)\b/i.test(claim);
  if (singleParagraph && claimsMultilingual && paragraphNodes.length > 1) {
    return 'Claim describes one multilingual paragraph but citations are separate paragraph nodes';
  }
  // When a claim enumerates separate language-specific paragraphs, require at
  // least one distinct paragraph source line for every named language.
  // This counts cited nodes, not actual language correctness; cited text can
  // still be semantically wrong and needs human review.
  const languages = ['English','Arabic','Chinese','French','Russian','Spanish','German','Japanese','Korean','Hindi','Portuguese','Italian'];
  const namedLanguages = languages.filter(name => new RegExp('\\b' + name + '\\b', 'i').test(claim));
  if (/\bparagraphs\b/i.test(claim) && namedLanguages.length >= 3 && paragraphNodes.length < namedLanguages.length) {
    return 'Claim names ' + namedLanguages.length + ' paragraph languages but cites only ' + paragraphNodes.length + ' distinct paragraph source lines';
  }
  return null;
}

// Validate reference existence and a few deterministic structural contradictions;
// a valid source line supports provenance, not a factual
// or causal judgment; every issue remains a model suggestion until verified.
function linkClaims(items, lookup) {
  const linked = [], unsupported = [];
  for (const item of items ?? []) {
    const ids = Array.isArray(item.evidence_line_ids) ? item.evidence_line_ids : [];
    const unique = [...new Set(ids)].slice(0, 8);
    if (!unique.length || unique.some(id => !lookup.has(id))) {
      unsupported.push({
        claim: item.claim,
        reason: unique.length ? 'Invalid source line reference' : 'No source line reference'
      });
      continue;
    }
    const referenced = unique.map(id => ({ id, text: lookup.get(id) }));
    const mismatch = structuralContradiction(item.claim, referenced);
    if (mismatch) {
      unsupported.push({ claim: item.claim, reason: mismatch });
      continue;
    }
    linked.push({
      claim: item.claim,
      ...(item.severity ? { severity: item.severity } : {}),
      evidence: referenced
    });
  }
  return { linked, unsupported };
}

export function attachEvidence(analysis, lines) {
  const lookup = new Map(lines.map(line => [line.id, line.text]));
  const observations = linkClaims(analysis.observations, lookup);
  const issues = linkClaims(analysis.issues, lookup);
  return {
    ...analysis,
    observations: observations.linked,
    unsupported: observations.unsupported,
    issues: issues.linked,
    unsupportedIssues: issues.unsupported
  };
}
