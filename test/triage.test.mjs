import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceSnapshot, attachEvidence } from '../src/evidence.mjs';
import { assessTriage, parseAnalysis, reportMarkdown, digest } from '../src/core.mjs';

const site = {id:'example',url:'https://example.com/',profile:'openclaw'};
const src = 'heading Example Domain\nparagraph This domain is used for documentation examples.\nlink Learn more https://iana.org/help/example-domains';
const evidence = buildEvidenceSnapshot(src);
const render = analysis => reportMarkdown({
  site,time:'now',runId:'run-1',hash:digest(evidence.bounded),
  analysis,truncated:false,evidenceLineCount:evidence.lines.length
});

test('same-page warning based only on unknown contrast or keyboard behavior stays info priority', () => {
  const model = parseAnalysis(JSON.stringify({
    severity:'warning',
    summary:'Potential missing accessibility checks',
    observations:[{claim:'Has an informational paragraph',evidence_line_ids:['L0002']}],
    issues:[],
    uncertainties:['No evidence of color contrast','Keyboard navigation has not been tested'],
    recommendation:'Run keyboard tests'
  }));
  const linked = attachEvidence(model,evidence.lines);
  const triage = assessTriage(linked);
  assert.equal(triage.priority,'info');
  assert.equal(triage.candidateCount,0);
  assert.equal(linked.severity,'warning');
  const report = render(linked);
  assert.match(report,/Review priority .*: info/);
  assert.match(report,/Model-suggested severity .*: warning/);
  assert.match(report,/No separate, source-linked issue/);
  assert.match(report,/No evidence of color contrast/);
});

test('valid line-linked observed issue creates provisional warning or critical review priority', () => {
  const errorEvidence = buildEvidenceSnapshot('alert: HTTP 500 Internal Server Error');
  const forSeverity = severity => attachEvidence(parseAnalysis(JSON.stringify({
    severity,
    summary:'Text includes an explicit error',
    issues:[{claim:'Page visibly states HTTP 500 Internal Server Error',severity,evidence_line_ids:['L0001']}]
  })),errorEvidence.lines);
  for (const level of ['warning','critical']) {
    const linked = forSeverity(level);
    assert.equal(assessTriage(linked).priority,level);
    assert.match(render(linked),/manual verification required/);
    assert.match(render(linked),/L0001: “alert: HTTP 500 Internal Server Error”/);
  }
});

test('missing or invalid issue citations cannot elevate a model warning', () => {
  const linked = attachEvidence(parseAnalysis(JSON.stringify({
    severity:'critical',
    issues:[
      {claim:'Invented missing feature',severity:'critical',evidence_line_ids:[]},
      {claim:'Invented citation',severity:'critical',evidence_line_ids:['L9999']}
    ]
  })),evidence.lines);
  assert.equal(linked.issues.length,0);
  assert.equal(linked.unsupportedIssues.length,2);
  assert.equal(assessTriage(linked).priority,'info');
  assert.match(render(linked),/Uncited issue proposals/);
  assert.doesNotMatch(render(linked),/L9999: “/);
});

test('legacy observations and model-only risk proposal are not silently treated as issues', () => {
  const linked = attachEvidence(parseAnalysis(JSON.stringify({
    severity:'warning',
    observations:['This is speculative but plausible'],
    recommendation:'Check manually'
  })),evidence.lines);
  assert.equal(assessTriage(linked).priority,'info');
  assert.equal(linked.unsupported.length,1);
  assert.equal(linked.issues.length,0);
});
