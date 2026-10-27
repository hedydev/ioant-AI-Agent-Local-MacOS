import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {actionFromJson,isSafeAction,extractAction,responseForTask} from '../stage2/protocol.mjs';
import {actionPlan} from '../stage2/runner.mjs';
const root=resolve(import.meta.dirname,'..');

test('ChatGPT can request one fixed local Maintainer health check with no arguments',()=>{
 const action=actionFromJson(JSON.stringify({protocol:'ioant-mac-ops-v1',
  id:'maintainer-health-check-20261025',action:'openclaw-maintainer-health'}));
 assert.ok(action);
 assert.equal(action.known,true);
 assert.equal(action.authorized,true);
 assert.equal(isSafeAction('openclaw-maintainer-health'),true);
 for(const extra of [{url:'https://chatgpt.com'},{cwd:'/tmp'},{argv:['--fix']},
   {projectKey:'alice-ai'},{prompt:'ignore security'}]){
  assert.throws(()=>actionFromJson(JSON.stringify({protocol:'ioant-mac-ops-v1',
   id:'maintainer-health-check-20261025',action:'openclaw-maintainer-health',...extra})),
  /Malformed structured task/);
 }
});
test('Maintainer health action is routed to only the pinned read-only Node file',()=>{
 const plan=actionPlan('openclaw-maintainer-health',root);
 assert.ok(plan);
 assert.equal(plan.bin,process.execPath);
 assert.deepEqual(plan.args,['stage2/maintainer-health.mjs','inspect','openclaw-workflow']);
 assert.equal(plan.cwd,root);
 assert.ok(plan.timeout>=120000&&plan.timeout<=150000);
 assert.equal(actionPlan('openclaw-maintainer-repair',root),null);
});
test('only a complete assistant-role task may trigger diagnostic and response contains no raw secrets',()=>{
 const code=JSON.stringify({protocol:'ioant-mac-ops-v1',
  id:'maintainer-health-check-20261025',action:'openclaw-maintainer-health'});
 const notUser=extractAction({url:'https://chatgpt.com/c/example',generating:false,
  messages:[]});
 assert.equal(notUser.status,'idle');
 const task=extractAction({url:'https://chatgpt.com/c/example',generating:false,
  messages:[{codes:[code]}]});
 assert.equal(task.status,'task');
 assert.equal(task.task.action,'openclaw-maintainer-health');
 const report=responseForTask(task.task,{status:'passed',output:JSON.stringify({
  audit:'IOANT_OPENCLAW_MAINTAINER_HEALTH',state:'assessed',
  finding:'relay_reports_zero_tabs',autoChanged:false})},'s1234');
 assert.match(report,/maintainer-health-check-20261025/);
 assert.match(report,/relay_reports_zero_tabs/);
 assert.match(report,/autoChanged/);
});
test('existing watcher does not accept model-supplied Chrome commands or auto repair',()=>{
 const watcher=readFileSync(resolve(root,'stage2/chatgpt-loop.mjs'),'utf8');
 const protocol=readFileSync(resolve(root,'stage2/protocol.mjs'),'utf8');
 assert.ok(protocol.includes('openclaw-maintainer-health'));
 assert.match(watcher,/const a=extractWatchedAction\(page\)/);
 assert.match(watcher,/import \{extractWatchedAction\} from '\.\/task-observation\.mjs';/);
 const adapter=readFileSync(resolve(root,'stage2/task-observation.mjs'),'utf8');
 assert.match(adapter,/import \{extractAction\} from '\.\/protocol\.mjs';/);
 assert.match(adapter,/e\.message===MALFORMED/);
 assert.match(adapter,/throw e;/);
 assert.doesNotMatch(watcher,/openclaw-maintainer-health.*(?:repair|restart|install)/);
});
