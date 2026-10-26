import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseProjectChatUrl} from '../stage2/project-chat-routing.mjs';
import {summarizeVisibleTabs,summarizeRelayVerification,assessMaintainerHealth,collectMaintainerHealth,
 formatMaintainerChatReport} from '../stage2/maintainer-health.mjs';
const root=resolve(import.meta.dirname,'..');
const manifest=JSON.parse(readFileSync(resolve(root,'config/chat-projects.json'),'utf8'));
const target=manifest.projects[0].chatUrl;
const parsed=parseProjectChatUrl(target);
const project={key:'openclaw-workflow',...parsed};

test('only strictly validated Project and Chat IDs count as matches',()=>{
 const a=summarizeVisibleTabs(JSON.stringify({tabs:[
  {url:target+'?utm_source=chatgpt.com'},
  {url:'https://chatgpt.com/g/g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-a/c/'+parsed.conversationId},
  {url:'https://evil.example/secret'},
  {url:'https://chatgpt.com/c/'+parsed.conversationId}
 ]}),project);
 assert.deepEqual(a,{state:'ok',visibleTabs:4,matchingTabs:1,
  sameConversationOtherProjectTabs:1,sameConversationUnscopedTabs:1,
  sameProjectOtherChatTabs:0,otherChatgptTabs:0,otherVisibleTabs:1});
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
 assert.deepEqual(calls,['extension_status','extension_verify','browser_doctor','watcher_status','chrome_tabs','chrome_tabs']);
 assert.equal(result.finding,'target_visible');
 assert.equal(result.checks.tabSamples.length,2);
 assert.doesNotMatch(JSON.stringify(result),/opaque|private diagnostic|original.*URL/);
 const denied=await collectMaintainerHealth({manifest,projectKey:'unknown',invoke:async()=>{
  throw Error('must never call runner');
 }});
 assert.equal(denied.state,'blocked');
});


test('official extension setup verify distinguishes authenticated relay from eligible tabs',()=>{
 const reply=JSON.stringify({action:'verify',target:{
  kind:'local-host',profile:'chrome',hostname:'secret.local',relayPort:18792
 },phase:'ready',connection:{secret:'DO_NOT_EXPOSE'},nextAction:'some operator instruction'});
 assert.equal(summarizeRelayVerification(reply),'authenticated');
 assert.equal(summarizeRelayVerification(reply.replace('"ready"','"pending"')),'not_ready');
 assert.equal(summarizeRelayVerification(reply.replace('"ready"','"blocked"')),'not_ready');
 assert.equal(summarizeRelayVerification(reply.replace('"ready"','"unknown"')),'unknown');
 assert.equal(summarizeRelayVerification(reply.replace('"chrome"','"user"')),'unknown');
 assert.equal(summarizeRelayVerification(reply.replace('"local-host"','"remote"')),'unknown');
 assert.equal(summarizeRelayVerification('not JSON'),'unknown');
 const r=assessMaintainerHealth({project,checks:{
  extension:'ok',doctor:'ok',relayVerification:'authenticated',
  supervisor:{state:'running'},tabSamples:[
   {state:'ok',visibleTabs:0,matchingTabs:0},
   {state:'ok',visibleTabs:0,matchingTabs:0}]}});
 assert.equal(r.finding,'relay_authenticated_no_eligible_tabs');
 assert.equal(r.checks.relayVerification,'authenticated');
 assert.ok(r.recommendedActions.includes('operator_review_per_tab_access'));
 assert.doesNotMatch(JSON.stringify(r),/secret|relayPort|hostname|nextAction|18792/);
});
test('unready and unknown relay connection remain separate from tab visibility',()=>{
 const run=relayVerification=>assessMaintainerHealth({project,checks:{
  extension:'ok',doctor:'ok',relayVerification,
  supervisor:{state:'running'},tabSamples:[
   {state:'ok',visibleTabs:0,matchingTabs:0},
   {state:'ok',visibleTabs:0,matchingTabs:0}]}});
 const pending=run('not_ready');
 assert.equal(pending.finding,'relay_verification_not_ready');
 assert.ok(pending.recommendedActions.includes('operator_review_relay_setup'));
 assert.equal(run('unknown').finding,'relay_reports_zero_tabs');
});
test('verified authenticated connection with no eligible tabs still forbids auto attach or permission override',()=>{
 const report=assessMaintainerHealth({project,checks:{
  extension:'ok',doctor:'ok',relayVerification:'authenticated',
  supervisor:{state:'running'},tabSamples:[
   {state:'ok',visibleTabs:0,matchingTabs:0},
   {state:'ok',visibleTabs:0,matchingTabs:0}]}});
 assert.equal(report.permissionsChanged,false);
 assert.equal(report.autoChanged,false);
 assert.equal(report.reportDelivery,'not_attempted');
});


test('visible tab identity classifies renamed registered Project and same chat elsewhere without exposing URLs',()=>{
 const other='https://chatgpt.com/g/g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-other/c/'+parsed.conversationId;
 const another='https://chatgpt.com/g/'+parsed.projectPath+'/c/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
 const input=JSON.stringify({tabs:[
  {url:other+'?utm_source=chatgpt.com'},
  {url:'https://chatgpt.com/c/'+parsed.conversationId},
  {url:another},
  {url:'https://chatgpt.com/g/g-p-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/c/cccccccc-cccc-cccc-cccc-cccccccccccc'},
  {url:'https://github.com/private/account'},
  {url:target.replace(parsed.projectPath,parsed.projectId+'-renamed')}
 ]});
 const x=summarizeVisibleTabs(input,project);
 assert.deepEqual(x,{state:'ok',visibleTabs:6,matchingTabs:1,
  sameConversationOtherProjectTabs:1,sameConversationUnscopedTabs:1,
  sameProjectOtherChatTabs:1,otherChatgptTabs:1,otherVisibleTabs:1});
 assert.doesNotMatch(JSON.stringify(x),/https:|github|private|aaaaaaaa-aaaa/);
});
test('one same conversation on another Project URL is diagnosed but not authorized as current project',()=>{
 const moved='https://chatgpt.com/g/g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-other/c/'+parsed.conversationId;
 const tab=summarizeVisibleTabs(JSON.stringify({tabs:[{url:moved}]}),project);
 const report=assessMaintainerHealth({project,checks:{
  extension:'ok',doctor:'ok',relayVerification:'authenticated',supervisor:{state:'running'},
  tabSamples:[tab,tab]}});
 assert.equal(report.finding,'same_conversation_different_project_path');
 assert.equal(report.priority,'investigate');
 assert.ok(report.recommendedActions.includes('operator_review_conversation_project_membership'));
 assert.equal(report.checks.tabSamples[0].sameConversationOtherProjectTabs,1);
 assert.doesNotMatch(JSON.stringify(report),/https:|other\/c\//);
 assert.equal(report.autoChanged,false);
});
test('an unscoped same conversation URL does not silently assert Project membership',()=>{
 const tab=summarizeVisibleTabs(JSON.stringify({tabs:[
  {url:'https://chatgpt.com/c/'+parsed.conversationId}]}),project);
 const report=assessMaintainerHealth({project,checks:{
  extension:'ok',doctor:'ok',relayVerification:'authenticated',supervisor:{state:'running'},
  tabSamples:[tab,tab]}});
 assert.equal(report.finding,'same_conversation_unscoped_chat_path');
 assert.ok(report.recommendedActions.includes('operator_review_unscoped_conversation'));
});
test('other ChatGPT in same Project is distinguished from unrelated site and other Project',()=>{
 const run=tab=>assessMaintainerHealth({project,checks:{
  extension:'ok',doctor:'ok',relayVerification:'authenticated',supervisor:{state:'running'},
  tabSamples:[tab,tab]}});
 const inProject=summarizeVisibleTabs(JSON.stringify({tabs:[{
  url:parsed.projectUrl+'/c/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}]}),project);
 assert.equal(run(inProject).finding,'other_chat_in_registered_project');
 const otherProject=summarizeVisibleTabs(JSON.stringify({tabs:[{
  url:'https://chatgpt.com/g/g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/c/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}]}),project);
 assert.equal(run(otherProject).finding,'other_chatgpt_chat_only');
 const notChat=summarizeVisibleTabs(JSON.stringify({tabs:[{
  url:'https://example.org/any'}]}),project);
 assert.equal(run(notChat).finding,'only_other_browser_tab_visible');
});
test('duplicate same conversation across project paths blocks even when exact match occurs once',()=>{
 const moved='https://chatgpt.com/g/g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-other/c/'+parsed.conversationId;
 const tab=summarizeVisibleTabs(JSON.stringify({tabs:[{url:target},{url:moved}]}),project);
 const report=assessMaintainerHealth({project,checks:{
  extension:'ok',doctor:'ok',relayVerification:'authenticated',supervisor:{state:'running'},
  tabSamples:[tab,tab]}});
 assert.equal(report.finding,'duplicate_target_tabs');
 assert.equal(report.priority,'blocked');
});
test('malformed and tracking-injected URLs do not become authorized target identities',()=>{
 const bad=[target+'?utm_source=evil',target+'?utm_source=chatgpt.com&x=1',
  target+'#fragment',target.replace('chatgpt.com','chatgpt.com.attacker.example'),
  target.replace('https:','http:')];
 const summary=summarizeVisibleTabs(JSON.stringify({tabs:bad.map(url=>({url}))}),project);
 assert.equal(summary.matchingTabs,0);
 assert.equal(summary.sameConversationOtherProjectTabs,0);
 assert.equal(summary.otherVisibleTabs,3);
 assert.equal(summary.otherChatgptTabs,2);
});
