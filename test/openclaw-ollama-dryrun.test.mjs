import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {EventEmitter} from 'node:events';
import {candidate,errorCategory,diagnoseDryRun,spawnDryRun} from '../stage2/openclaw-ollama-dryrun.mjs';
import {actionFromJson} from '../stage2/protocol.mjs';
import {actionPlan} from '../stage2/runner.mjs';

const READY={config:'regular_private',ollama:'reachable',provider:'absent',agents:'absent',
 installed:['gemma4:26b-a4b','gpt-oss:20b']};

test('structured read-only Ollama dry-run cannot accept patch text, shell flags or user paths',()=>{
 const task=actionFromJson(JSON.stringify({protocol:'ioant-mac-ops-v1',id:'ollama-dryrun-001',action:'openclaw-ollama-dryrun'}));
 assert.equal(task.authorized,true);
 assert.deepEqual(actionPlan(task.action,'/fixed/repo').args,['stage2/openclaw-ollama-dryrun.mjs']);
 assert.throws(()=>actionFromJson(JSON.stringify({protocol:task.protocol,id:task.id,action:task.action,params:{raw:'secret'}})),/Malformed/);
});

test('candidate configurations use exact local native endpoint with fixed known model IDs',()=>{
 const a=candidate('as_authored').models.providers.ollama;
 const b=candidate('official_explicit').models.providers.ollama;
 const c=candidate('minimal_discovery').models.providers.ollama;
 for(const p of [a,b,c]){
  assert.equal(p.baseUrl,'http://127.0.0.1:11435');
  assert.equal(p.api,'ollama');
  assert.equal(p.apiKey,'ollama-local');
 }
 assert.deepEqual(a.models.map(x=>x.id),['gemma4:26b-a4b','gpt-oss:20b']);
 assert.equal(a.models[0].contextTokens,32768);
 assert.equal(b.models[0].contextWindow,32768);
 assert.equal(b.models[0].maxTokens,8192);
 assert.deepEqual(Object.keys(c).sort(),['api','apiKey','baseUrl']);
 assert.throws(()=>candidate('any-user-text'),/unsupported/);
});

test('dry-run tries all approved shapes and emits only bounded status categories',async()=>{
 const seen=[];
 const report=await diagnoseDryRun({
  preflight:async()=>READY,
  run:async p=>{
   seen.push(p);
   if(p.models.providers.ollama.models?.[0]?.contextTokens===32768)return {status:'failed',category:'schema_validation',raw:'VERY_PRIVATE'};
   return {status:'passed',raw:'KEY_SECRET'};
  }
 });
 assert.equal(report.audit,'IOANT_OPENCLAW_OLLAMA_DRYRUN');
 assert.equal(report.readOnly,true);
 assert.deepEqual(report.checks.map(c=>c.status),['failed','passed','passed']);
 assert.equal(report.checks[0].category,'schema_validation');
 assert.equal(seen.length,3);
 assert.doesNotMatch(JSON.stringify(report),/VERY_PRIVATE|KEY_SECRET|raw/);
});

test('unsafe provider or missing model preflight must reject before invoking CLI',async()=>{
 for(const changed of [{provider:'target'},{provider:'different'},{agents:'present'},
   {config:'unsafe'},{installed:['gpt-oss:20b']}]) {
  let attempted=0;
  const r=await diagnoseDryRun({preflight:async()=>({...READY,...changed}),
   run:async()=>{attempted++;throw Error('must not call')}});
  assert.equal(r.status,'preflight_blocked');
  assert.equal(attempted,0);
 }
});

test('CLI dry-run uses only exact fixed args, JSON passed via stdin, bounded output',async()=>{
 const command=[];
 const fakeSpawn=(bin,args,options)=>{
  command.push({bin,args,options});
  const child=new EventEmitter();
  child.stdin=new EventEmitter();
  child.stdin.end=(data)=>{child.passedPatch=JSON.parse(data);
   queueMicrotask(()=>child.emit('close',0))};
  child.stdout=new EventEmitter();
  child.stderr=new EventEmitter();
  child.kill=()=>{};
  return child;
 };
 const r=await spawnDryRun(candidate('minimal_discovery'),{exec:fakeSpawn,bin:'/fixed/openclaw'});
 assert.equal(r.status,'passed');
 assert.equal(command.length,1);
 assert.deepEqual(command[0].args,['config','patch','--stdin','--dry-run']);
 assert.equal(command[0].options.shell,false);
 assert.equal(command[0].options.stdio[0],'pipe');
 assert.equal(command[0].options.env.OPENCLAW_GATEWAY_TOKEN,undefined);
});

test('error categories are bounded and cannot reflect secret-bearing CLI text',()=>{
 assert.equal(errorCategory('Gateway must be stopped: state owner locked'), 'offline_owner');
 assert.equal(errorCategory('config patch unknown option --dry-run'), 'unsupported_dryrun_cli');
 assert.equal(errorCategory('validation failed: invalid config apiKey SECRET'), 'schema_validation');
 assert.equal(errorCategory('TOKEN=some-private-value'), 'unclassified_failure');
 const file=readFileSync(resolve(import.meta.dirname,'..','stage2/openclaw-ollama-dryrun.mjs'),'utf8');
 assert.doesNotMatch(file,/config\.apply|gateway','call','config\.patch|shell:true/);
});
