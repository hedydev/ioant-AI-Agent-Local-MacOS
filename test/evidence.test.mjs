import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceSnapshot, attachEvidence } from '../src/evidence.mjs';
import { parseAnalysis, reportMarkdown, digest } from '../src/core.mjs';

test('numbered excerpts preserve line origin and redact secret-bearing source', () => {
  const v = buildEvidenceSnapshot('heading Example Domain\nparagraph Hello test@example.com\nparagraph Learn more');
  assert.deepEqual(v.lines.map(x => x.id), ['L0001','L0002','L0003']);
  assert.match(v.numberedText, /L0001 \| heading Example Domain/);
  assert.match(v.numberedText, /\[REDACTED EMAIL\]/);
  assert.doesNotMatch(v.numberedText, /test@example.com/);
  assert.equal(v.truncated, false);
});
test('bounded excerpt clipping is reported, stable and reject empty snapshots', () => {
  const v = buildEvidenceSnapshot('a'.repeat(50) + '\nsecond\nthird', {maxChars:60,maxLineChars:12,maxLines:2});
  assert.equal(v.truncated, true);
  assert.equal(v.lines.length, 2);
  assert.equal(v.lines[0].text.length, 12);
  assert.throws(() => buildEvidenceSnapshot(' \n \t'), /no usable evidence/);
});
test('model cannot invent quotes or missing source identifiers', () => {
  const evidence = buildEvidenceSnapshot('heading Real Domain\nparagraph Real content');
  const parsed = parseAnalysis(JSON.stringify({
    severity:'info',summary:'Inspect the excerpt',
    observations:[
      {claim:'Has a heading',evidence_line_ids:['L0001']},
      {claim:'Five images are visible',evidence_line_ids:['L9999']},
      {claim:'Style is blue',evidence_line_ids:[]},
      {claim:'Mixed references',evidence_line_ids:['L0001','L0099']}
    ],
    uncertainties:['May be incomplete'],recommendation:'Verify by hand'
  }));
  const linked=attachEvidence(parsed,evidence.lines);
  assert.equal(linked.observations.length,1);
  assert.equal(linked.unsupported.length,3);
  assert.equal(linked.observations[0].evidence[0].text,'heading Real Domain');
  const report=reportMarkdown({site:{id:'example',url:'https://example.com/',profile:'openclaw'},time:'now',runId:'run2',hash:digest(evidence.bounded),analysis:linked,truncated:evidence.truncated,evidenceLineCount:evidence.lines.length});
  assert.match(report,/L0001: “heading Real Domain”/);
  assert.match(report,/Model claims without valid line citations/);
  assert.match(report,/Five images are visible/);
  assert.doesNotMatch(report,/L9999: “/);
});
test('legacy string claims stay visibly uncited, model-supplied snippets ignored', () => {
  const parsed = parseAnalysis(JSON.stringify({ observations:['A confident but unsupported statement', {claim:'A claim',evidence_line_ids:['L0001'],quote:'FAKE model quote'}] }));
  const linked = attachEvidence(parsed,buildEvidenceSnapshot('real line').lines);
  assert.equal(linked.unsupported.length,1);
  assert.equal(linked.observations[0].evidence[0].text,'real line');
  assert.doesNotMatch(JSON.stringify(linked),/FAKE model quote/);
});
