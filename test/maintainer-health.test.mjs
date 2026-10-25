import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseProjectChatUrl} from '../stage2/project-chat-routing.mjs';
import {summarizeVisibleTabs,assessMaintainerHealth,collectMaintainerHealth,
 formatMaintainerChatReport} from '../stage2/maintainer-health.mjs';
const root=resolve(import.meta.dirname,'..');
const manifest=JSON.parse(readFileSync(resolve(root,'config/chat-projects.json'),'utf8'));
const target=manifest.projects[0].chatUrl;
const parsed=parseProjectChatUrl(target);
const project={key:'openclaw-workflow',...parsed};

test('only strictly validated Project and Chat IDs count as matches',()=>{
 const a=summarizeVisibleTabs(JSON.stringify({tabs:[
  {url:target+'?utm_source=chatgpt.com'},
  {url:'https://chatgpt.com/g/g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-a/c/6add3565-d868-83ec-804e-1e7a00eb0a59'},
  {url:'https://evil.example/secret'},
  {url:'https://chatgpt.com/c/6add3565-d868-83ec-804e-1e7a00eb0a59'}
 ]}),project);
 assert.deepEqual(a,{state:'ok',visibleTabs:4,matchingTabs:1});
 assert.equal(summarizeVisibleTabs('{invalid',project).state,'unknown');
 assert.equal(summarizeVisibleTabs(JSON.stringify({tabs:'anything'}),project).state,'unknown');
});
test('two zero-tab samples produce a bounded report for ChatGPT, never conclude credentials revoked',()=>{
 const report=assessMaintainerHealth({project,checks:{
  extension:'ok',doctor:'ok',supervisor:{state:'running'},
  tabSamples:[{state:'ok',visibleTabs:0,matchingTabs:0},{state:'ok',visibleTabs:0,matchingTabs:0}]}});
 assert.equal(report.finding,'relay_reports_zero_tabs');
 assert.equal(report.priority,'investigate');
 assert.equal(report.autoChanged,false);
 assert.equal(report.reportDelivery,'not_attempted');
 assert.ok(report.recommendedActions.includes('operator_review_extension_access'));
 assert.doesNotMatch(JSON.stringify(report),/password|token|https:\/\//);
 const message=formatMaintainerChatReport(report);
 assert.match(message,/IOANT-OPENCLAW MAINTAINER REPORT/);
 assert.match(message,/relay_reports_zero_tabs/);
 assert.doesNotMatch(message,/https:\/\//);
});
test('one visible exact chat with good doctor does not imply task delivery',()=>{
 const r=assessMaintainerHealth({project,checks:{extension:'ok',doctor:'ok',
  supervisor:{state:'running'},tabSamples:[
   {state:'ok',visibleTabs:1,matchingTabs:1},
   {state:'ok',visibleTabs:1,matchingTabs:1}]}});
 assert.equal(r.finding,'target_visible');
 assert.equal(r.priority,'normal');
 assert.equal(r.reportDelivery,'not_attempted');
 assert.ok(!JSON.stringify(r).includes('page_ready'));
});
test('duplicate same-conversation tabs forbid selecting one silently',()=>{
 const r=assessMaintainerHealth({project,checks:{extension:'ok',doctor:'ok',
  supervisor:{state:'running'},tabSamples:[
   {state:'ok',visibleTabs:2,matchingTabs:2},{state:'ok',visibleTabs:2,matchingTabs:2}]}});
 assert.equal(r.finding,'duplicate_target_tabs');
 assert.equal(r.priority,'blocked');
 assert.ok(r.recommendedActions.includes('operator_review_duplicate_tabs'));
});
test('missing one sample or doctor failure does not cause a silent reconnect',()=>{
 assert.equal(assessMaintainerHealth({project,checks:{extension:'ok',doctor:'ok',
  supervisor:{state:'running'},tabSamples:[]}}).state,'blocked');
 const r=assessMaintainerHealth({project,checks:{extension:'failed',doctor:'failed',
  supervisor:{state:'stopped'},tabSamples:[
   {state:'unknown'},{state:'ok',visibleTabs:0,matchingTabs:0}]}});
 assert.equal(r.finding,'browser_or_gateway_diagnostic_failed');
 assert.equal(r.autoChanged,false);
 assert.ok(r.recommendedActions.includes('operator_review_watcher_state'));
});
test('collector runs fixed probes only, no data from another Project or arbitrary arguments',async()=>{
 const calls=[];
 const invoke=async kind=>{
  calls.push(kind);
  if(kind==='chrome_tabs')return {state:'ok',stdout:JSON.stringify({tabs:[{url:target}]})};
  if(kind==='watcher_status')return {state:'ok',stdout:JSON.stringify({
    audit:'IOANT_MAC_OPS_SUPERVISOR',state:'running',running:true})};
  return {state:'ok',stdout:'opaque private diagnostic details'};
 };
 const result=await collectMaintainerHealth({manifest,projectKey:'openclaw-workflow',invoke});
 assert.deepEqual(calls,['extension_status','browser_doctor','watcher_status','chrome_tabs','chrome_tabs']);
 assert.equal(result.finding,'target_visible');
 assert.equal(result.checks.tabSamples.length,2);
 assert.doesNotMatch(JSON.stringify(result),/opaque|private diagnostic|original.*URL/);
 const denied=await collectMaintainerHealth({manifest,projectKey:'unknown',invoke:async()=>{
  throw Error('must never call runner');
 }});
 assert.equal(denied.state,'blocked');
});
