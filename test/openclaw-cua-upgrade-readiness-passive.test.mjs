import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {sanitizeUpgradeStatus,sanitizeGatewayStatus,sanitizeSystemStatus,
 passiveUpgradeReadiness}
 from '../scripts/openclaw-cua-upgrade-readiness-passive.mjs';
const code=readFileSync(resolve(import.meta.dirname,
 '../scripts/openclaw-cua-upgrade-readiness-passive.mjs'),'utf8');

test('official-style update status reports only curated fields',()=>{
 const data={currentVersion:'2026.10.7',channel:'stable',
  availability:{latestVersion:'2026.10.8',token:'SECRET'},
  activeRun:null,lastRun:{phase:'completed',token:'SECRET'},
  inspectionErrors:[]};
 const r=sanitizeUpgradeStatus(data);
 assert.equal(r.available,true);
 assert.equal(r.installedVersionReported,'2026.10.7');
 assert.equal(r.candidateVersionReported,'2026.10.8');
 assert.equal(r.updateChannel,'stable');
 assert.equal(r.activeUpdateRun,'no');
 assert.equal(r.updateHistoryInspected,true);
 assert.equal(r.hasInspectionErrors,false);
 assert.equal(JSON.stringify(r).includes('SECRET'),false);
});
test('active update run is observed only as yes, without IDs and paths',()=>{
 const r=sanitizeUpgradeStatus({result:{activeRun:{
  runId:'private-execution',phase:'staging',
  path:'/Users/private'}}});
 assert.equal(r.activeUpdateRun,'yes');
 assert.equal(JSON.stringify(r).includes('private'),false);
});
test('missing activeRun field is unknown, not presumed idle',()=>{
 const r=sanitizeUpgradeStatus({result:{version:'2026.10.7'}});
 assert.equal(r.activeUpdateRun,'unknown');
 assert.equal(r.candidateVersionReported,null);
});
test('invalid arbitrary versions/channels suppressed',()=>{
 const r=sanitizeUpgradeStatus({version:'OpenClaw 2026.10.7 /private',
  channel:'super-secret-provider',installMethod:'secretInstaller',
  availability:{latestVersion:'private-tag'}});
 assert.equal(r.installedVersionReported,null);
 assert.equal(r.candidateVersionReported,null);
 assert.equal(r.updateChannel,null);
 assert.equal(r.installMethod,null);
});
test('Gateway status reports only known runtime version and public state',()=>{
 const r=sanitizeGatewayStatus({result:{
  rpc:{connected:true,token:'private-secret'},
  gateway:{version:'2026.10.7',secret:'opaque'},
  service:{state:'running',pid:73828,command:'/Users/private'}
 }});
 assert.equal(r.rpcConnectivity,'yes');
 assert.equal(r.gatewayRuntimeVersionReported,'2026.10.7');
 assert.equal(r.serviceStatus,'running');
 assert.equal(r.computerOwnerReported,false);
 assert.equal(JSON.stringify(r).includes('73828'),false);
 assert.equal(JSON.stringify(r).includes('/Users/private'),false);
});
test('gateway status without RPC facts cannot certify a healthy owner',()=>{
 const r=sanitizeGatewayStatus({result:{rpc:{error:{secret:'token'}}}});
 assert.equal(r.rpcConnectivity,'unknown');
 assert.equal(r.activeComputerExecutionVerified,false);
});
test('status task summary does not prove work is idle',()=>{
 const r=sanitizeSystemStatus({result:{
  gateway:{version:'2026.10.7'},
  tasks:{running:0,pending:0,privateDescription:'Top Secret'}
 }});
 assert.equal(r.taskSummaryPresent,true);
 assert.equal(r.canCertifyNoActiveWork,false);
 assert.equal(r.taskOwnerOrExecutionIdRead,false);
 assert.equal(JSON.stringify(r).includes('Top Secret'),false);
});
test('passive live audit makes exactly four official read-only CLI calls',async()=>{
 const calls=[];
 const run=async args=>{
  calls.push(args);
  if(args[0]==='--version')return 'OpenClaw 2026.10.7';
  if(args[0]==='update')return {currentVersion:'2026.10.7',
   activeRun:null,availability:{latestVersion:'2026.10.8'}};
  if(args[0]==='gateway')return {gateway:{version:'2026.10.7'},
   rpc:{connected:true}};
  if(args[0]==='status')return {tasks:{running:1},
   gateway:{runtimeVersion:'2026.10.7'}};
  throw Error('unexpected');
 };
 const r=await passiveUpgradeReadiness({allowedRuntime:async()=>true,run});
 assert.deepEqual(calls,[
  ['--version'],['update','status','--json'],
  ['gateway','status','--json'],
  ['status','--json','--timeout','15000']]);
 assert.equal(r.state,'observed');
 assert.equal(r.localCliVersion,'2026.10.7');
 assert.equal(r.gatewayRuntimeVersion,'2026.10.7');
 assert.equal(r.localAndGatewayVersionMatch,true);
 assert.equal(r.update.activeUpdateRun,'no');
 assert.equal(r.safeToUpdateWithoutMaintenance,false);
 assert.equal(r.upgradeRequiresSeparateApproval,true);
 assert.equal(r.serviceRestartAttempted,false);
 assert.equal(r.computerExecutionReleaseAttempted,false);
 assert.equal(r.invokedComputerAct,false);
});
test('CLI read failure does not become a false idle or upgrade readiness',async()=>{
 const r=await passiveUpgradeReadiness({
  allowedRuntime:async()=>true,
  run:async args=>args[0]==='--version'?'OpenClaw 2026.10.7':
   Promise.reject(Error('Secret-App service ID 5512'))});
 assert.equal(r.state,'observed');
 assert.equal(r.update.available,false);
 assert.equal(r.gateway.available,false);
 assert.equal(r.system.available,false);
 assert.equal(r.safeToUpdateWithoutMaintenance,false);
 assert.equal(JSON.stringify(r).includes('Secret-App'),false);
});
test('invalid non-private runtime denies all CLI actions',async()=>{
 let called=0;
 const r=await passiveUpgradeReadiness({
  allowedRuntime:async()=>false,
  run:async()=>{called++;throw Error('wrong runtime')}
 });
 assert.equal(r.state,'blocked');
 assert.equal(called,0);
});
test('source cannot stage updates, restart services, clear owner or access GUI',()=>{
 assert.match(code,/updateAttempted:false/);
 assert.match(code,/serviceRestartAttempted:false/);
 assert.match(code,/computerExecutionReleaseAttempted:false/);
 assert.doesNotMatch(code,/__close_execution|nodes','invoke|computer\.act'','--params'|--browser-profile|osascript|CGEventPost|--yes|--dry-run/);
 assert.match(code,/localAndGatewayVersionMatch/);
});
