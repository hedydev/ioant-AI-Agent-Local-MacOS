import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {aliceLabStartupProbe,sanitizeLabStartup,readLabStartupReport} from '../stage2/alice-lab-startup.mjs';
import {actionFromJson,responseForTask} from '../stage2/protocol.mjs';
import {runAction} from '../stage2/runner.mjs';

const action='alice-lab-startup-probe';
const ssh='fixture@127.0.0.1';
const fixed=[
 'remote get-url origin','branch --show-current','status --porcelain --untracked-files=no',
 'fetch origin main','pull --ff-only origin main','status --porcelain --untracked-files=no',
 'games/minecraft-ai/scripts/alice-mac.sh sync',
 'games/minecraft-ai/scripts/alice-mac.sh witness-lab-startup-check',
 'games/minecraft-ai/scripts/alice-mac.sh witness-lab-startup-probe'];
const evidence=(mode,state)=>({
 audit:'ALICE_BDS_LAB_STARTUP_PROBE',schemaVersion:1,
 observedAtUnix:Math.floor(Date.now()/1000),mode,state,reason:'none',
 isolationConfigReady:mode==='probe',
 serverReadyObserved:state==='lab_module_imports_observed',
 scriptModuleMessagesObserved:state==='lab_module_imports_observed',
 scriptLoadErrorObserved:false,
 verifiedScriptModuleLoaded:state==='lab_module_imports_observed',
 isolatedBdsExited:mode==='probe',
 productionWorldModified:false,productionBdsRestarted:false,productionWitnessUsed:false,
 confidentialMetadata:'DO_NOT_SEND'
});
async function fixture(fn){
 const home=await mkdtemp(join(tmpdir(),'ioant-lab-only-'));
 const desktop=join(home,'Desktop');
 const repo=join(home,'Documents/workspace/ioant-AI-Minecraft-Alice');
 await mkdir(desktop,{recursive:true});await mkdir(repo,{recursive:true});
 try{return await fn({home,desktop,repo});}
 finally{await rm(home,{recursive:true,force:true});}
}
async function pretend({home,desktop,repo},{
 checkState='ready_for_isolated_lab_probe',
 probeState='lab_module_imports_observed',
 originOk=true,
 failStep='',
 checkProductionModified=false,
 probeShutdownUnknown=false
}={}){
 const calls=[];
 const exec=async({bin,args,cwd,env,timeout})=>{
   calls.push({bin,args,cwd,env,timeout});
   assert.equal(cwd,repo);
   assert.equal(env.ALICE_SSH_TARGET,ssh);
   const command=args.join(' ');
   if(failStep&&command.includes(failStep))return {status:'failed',exitCode:1,output:'secret=not-for-chat'};
   if(args[0]==='remote')return {status:'passed',exitCode:0,output:originOk?'https://github.com/hedydev/ioant-AI-Minecraft-Alice.git\n':'https://github.com/other/unexpected.git\n'};
   if(args[0]==='branch')return {status:'passed',exitCode:0,output:'main\n'};
   if(args[0]==='status')return {status:'passed',exitCode:0,output:''};
   if(command.includes('witness-lab-startup-')){
     const mode=command.endsWith('check')?'check':'probe';
     const record=evidence(mode,mode==='check'?checkState:probeState);
     if(mode==='check'&&checkProductionModified)record.productionWorldModified=true;
     if(mode==='probe'&&probeShutdownUnknown){
       record.isolatedBdsExited=false;record.state='lab_shutdown_unverified';
     }
     const filename=join(desktop,'AliceAI-BDS-Lab-Startup-'+mode+'-20261024-060101.json');
     await writeFile(filename,JSON.stringify(record),{mode:0o600,flag:'wx'});
     return {status:'passed',exitCode:0,output:'Saved sanitized 17880 startup result: '+filename+'\n'};
   }
   return {status:'passed',exitCode:0,output:'secret=not-for-chat'};
 };
 const result=await aliceLabStartupProbe({execute:exec,home,sshTarget:ssh});
 return {calls,result};
}

test('separate 17880 task is recognized but not automatically authorized',async()=>{
 const task=actionFromJson(JSON.stringify({protocol:'ioant-mac-ops-v1',id:'lab-20261024-a001',action}));
 assert.equal(task.known,true);
 assert.equal(task.authorized,false);
 const refused=await runAction(action,'/tmp',{enableAlicePreflight:true});
 assert.equal(refused.status,'approval_required');
 assert.match(refused.reason,/separate|not authorized/i);
 assert.throws(()=>actionFromJson(JSON.stringify({protocol:'ioant-mac-ops-v1',id:'lab-20261024-a002',action,argv:['shutdown']})),/Malformed structured task/);
});

test('single 17880 workflow checks clean exact origin/main then sync/check/probe and sanitized report',async()=>fixture(async f=>{
 const {calls,result}=await pretend(f);
 assert.equal(result.status,'passed',result.reason);
 assert.deepEqual(calls.map(c=>c.args.join(' ')),fixed);
 assert.equal(calls.filter(c=>c.args.includes('witness-lab-startup-probe')).length,1);
 assert.equal(calls.at(-1).timeout,120000);
 const report=JSON.parse(result.reportJson);
 assert.equal(report.mode,'probe');
 assert.equal(report.verifiedScriptModuleLoaded,true);
 assert.equal(report.isolatedBdsExited,true);
 assert.equal('confidentialMetadata' in report,false);
 assert.doesNotMatch(result.output,/DO_NOT_SEND|secret=not-for-chat/);
 const feedback=responseForTask({id:'lab-20261024-a001',action},result,'sess-001');
 assert.match(feedback,/17880 LAB startup JSON/);
 assert.doesNotMatch(feedback,/witness-preflight JSON|DO_NOT_SEND/);
}));

test('untrusted Alice Git origin aborts without sync or lab access',async()=>fixture(async f=>{
 const {calls,result}=await pretend(f,{originOk:false});
 assert.equal(result.status,'failed');
 assert.equal(calls.length,1);
 assert.match(result.reason,/origin is not/);
}));

test('failed Mint sync stops before lab check or any lab startup',async()=>fixture(async f=>{
 const {calls,result}=await pretend(f,{failStep:'sync'});
 assert.equal(result.status,'failed');
 assert.equal(calls.some(c=>c.args.some(x=>x.includes('witness-lab-startup'))),false);
 assert.equal(result.reportJson,undefined);
}));

test('readiness blocked result fails closed and never invokes experimental probe',async()=>fixture(async f=>{
 const {calls,result}=await pretend(f,{checkState:'blocked'});
 assert.equal(result.status,'failed');
 assert.match(result.reason,/readiness guard refused/);
 assert.equal(calls.filter(c=>c.args.includes('witness-lab-startup-probe')).length,0);
 assert.equal(JSON.parse(result.reportJson).mode,'check');
}));

test('unverified experimental BDS shutdown is not an accepted success and requires investigation',async()=>fixture(async f=>{
 const {calls,result}=await pretend(f,{probeShutdownUnknown:true});
 assert.equal(result.status,'failed');
 assert.match(result.reason,/Do not repeat automatically/);
 assert.equal(JSON.parse(result.reportJson).isolatedBdsExited,false);
 assert.equal(calls.filter(c=>c.args.includes('witness-lab-startup-probe')).length,1);
}));

test('sanitize rejects production changes, stale evidence, unsupported schema and raw secrets',()=>{
 const safe=evidence('probe','lab_module_imports_observed');
 assert.equal('confidentialMetadata' in sanitizeLabStartup(safe,'probe'),false);
 assert.throws(()=>sanitizeLabStartup({...safe,productionWorldModified:true},'probe'),/Unsafe/);
 assert.throws(()=>sanitizeLabStartup({...safe,observedAtUnix:12},'probe'),/Unsafe/);
 assert.throws(()=>sanitizeLabStartup({...safe,schemaVersion:2},'probe'),/Unsafe/);
 assert.throws(()=>sanitizeLabStartup({...safe,mode:'check'},'probe'),/Unsafe/);
 assert.throws(()=>sanitizeLabStartup({...safe,state:'unknown_success'},'probe'),/Unsafe/);
 assert.throws(()=>sanitizeLabStartup({...safe,isolatedBdsExited:'yes'},'probe'),/Unsafe/);
});

test('report reader refuses duplicate filename and stale/read-only-unverified path',async()=>fixture(async f=>{
 const report=evidence('probe','lab_module_imports_observed');
 const wrong=join(f.desktop,'AliceAI-BDS-Lab-Startup-probe-20261024-060101(1).json');
 await writeFile(wrong,JSON.stringify(report),{mode:0o600});
 await assert.rejects(
  readLabStartupReport('Saved sanitized 17880 startup result: '+wrong,{home:f.home,mode:'probe'}),
  /Unexpected 17880 startup report path/);
 const okay=join(f.desktop,'AliceAI-BDS-Lab-Startup-probe-20261024-060102.json');
 await writeFile(okay,JSON.stringify(report),{mode:0o600});
 await assert.rejects(
  readLabStartupReport('Saved sanitized 17880 startup result: '+okay+'\nSaved sanitized 17880 startup result: '+okay,
   {home:f.home,mode:'probe'}),
  /No unique sanitized/);
}));

test('watch stores permanent one-shot 17880 claim before any execution, no double-run',async()=>{
 const src=await readFile(resolve(import.meta.dirname,'../stage2/chatgpt-loop.mjs'),'utf8');
 assert.match(src,/if\(state\.labProbeAttempted\)/);
 assert.match(src,/state\.labProbeAttempted=\{id:task\.id,at:new Date\(\)\.toISOString\(\)\}/);
 assert.match(src,/await atomicState\(stateFile,state\);\s*recordDiagnosticEvent\('lab_probe_claimed'/);
 assert.match(src,/const authorized=task\.authorized/);
 assert.match(src,/task\.action==='alice-lab-startup-probe' && opts\.enableAliceLabStartupProbe/);
 assert.doesNotMatch(src,/alice-lab-startup-probe.*&& opts\.enableAlicePreflight/);
});
