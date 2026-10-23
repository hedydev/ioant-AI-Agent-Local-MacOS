import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceSnapshot, attachEvidence } from '../src/evidence.mjs';
import { parseAnalysis, reportMarkdown, digest } from '../src/core.mjs';

const site={id:'example',url:'https://example.com/',profile:'openclaw'};
const snapshot=buildEvidenceSnapshot([
  '- heading "Example Domain"',
  '- paragraph [ref=e7]: This domain is for documentation examples.',
  '- paragraph [ref=e8]: هذا النطاق مُخصص للأمثلة.',
  '- paragraph [ref=e9]: 该域名用于文档示例。',
  '- link "Learn more" [ref=e13] [cursor=pointer]:',
  '- /url: https://iana.org/help/example-domains'
].join('\n'));
function report(model) {
  const analysis=attachEvidence(parseAnalysis(JSON.stringify(model)),snapshot.lines);
  return {
    analysis, markdown:reportMarkdown({site,time:'now',runId:'test',hash:digest(snapshot.bounded),
      analysis,truncated:false,evidenceLineCount:snapshot.lines.length})
  };
}

test('singular multilingual paragraph claim with multiple paragraph nodes is not promoted as sourced fact',()=>{
  const {analysis,markdown}=report({severity:'info',summary:'Information page',observations:[
    {claim:'The page contains a paragraph with multilingual content.',evidence_line_ids:['L0002','L0003','L0004']}
  ],issues:[],uncertainties:[]});
  assert.equal(analysis.observations.length,0);
  assert.equal(analysis.unsupported.length,1);
  assert.match(analysis.unsupported[0].reason,/separate paragraph nodes/);
  assert.match(markdown,/Model claims with insufficient evidence/);
  assert.doesNotMatch(markdown,/^- The page contains a paragraph with multilingual content\.\n  - L0002/m);
});

test('accurate multiple-paragraph observation remains evidence linked',()=>{
  const {analysis,markdown}=report({severity:'info',observations:[
    {claim:'The page shows separate English, Arabic and Chinese paragraphs.',evidence_line_ids:['L0002','L0003','L0004']}
  ],issues:[]});
  assert.equal(analysis.observations.length,1);
  assert.equal(analysis.unsupported.length,0);
  assert.match(markdown,/L0002:/);
  assert.match(markdown,/L0004:/);
});

test('actual single multilingual paragraph stays eligible for citation',()=>{
  const lines=buildEvidenceSnapshot('- paragraph: English and 中文 mixed in one element').lines;
  const model=parseAnalysis(JSON.stringify({observations:[
    {claim:'A paragraph with multilingual content appears.',evidence_line_ids:['L0001']}
  ]}));
  const analysis=attachEvidence(model,lines);
  assert.equal(analysis.observations.length,1);
  assert.equal(analysis.unsupported.length,0);
});

test('uncertainty never becomes unconditional page modification advice in rendered report',()=>{
  const {markdown}=report({severity:'info',observations:[],issues:[],
    uncertainties:['Whether heading hierarchy exists','Whether keyboard operation works'],
    recommendation:'Add a clear heading and replace link text.'});
  assert.match(markdown,/Manual verification \(do not change page without evidence\)/);
  assert.match(markdown,/No corrective action is established/);
  assert.doesNotMatch(markdown,/Add a clear heading/);
  assert.match(markdown,/Whether keyboard operation works/);
});

test('cited issue candidates retain conditional recommendation label',()=>{
  const {markdown}=report({severity:'warning',issues:[
    {claim:'Page shows an explicit error',severity:'warning',evidence_line_ids:['L0001']}
  ],recommendation:'Review the error display'});
  assert.match(markdown,/Manually confirm source-linked issue candidates/);
  assert.match(markdown,/Unverified model suggestion: Review the error display/);
});
