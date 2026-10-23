import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aliceWitnessPreflight, sanitizePreflight, validSshTarget, allowedAliceOrigin } from '../stage2/alice-preflight.mjs';
import { runAction } from '../stage2/runner.mjs';
import { actionFromJson, responseForTask } from '../stage2/protocol.mjs';

const report=()=>({audit:'ALICE_BDS_SILENT_WITNESS_READ_ONLY',schemaVersion:2,observedAtUnix:Math.floor(Date.now()/1000),readOnly:true,
  safeToApplyWorldChanges:false,betaApisExperiment:'enabled_in_level_dat',verifiedOfflineWorldBackup:'not_verified_requires_backup_and_restore_test',
  // Secret or surprise keys never cross into the conversation.
  gamertag:'never-send',token:'private-token'});
const config={sshTarget:'tedz@192.168.0.104'};
async function fixture(fn){
 const home=await mkdtemp(join(tmpdir(),'ioant-alice-closure-'));
 await mkdir(join(home,'Documents/workspace/ioant-AI-Minecraft-Alice'),{recursive:true});
 await mkdir(join(home,'Desktop'),{recursive:true});
 try{return await fn(home)}finally{await rm(home,{recursive:true,force:true})}
}
const fixedSteps=['remote get-url origin','branch --show-current','status --porcelain --untracked-files=no','fetch origin main','pull --ff-only origin main','status --porcelain --untracked-files=no','games/minecraft-ai/scripts/alice-mac.sh sync','games/minecraft-ai/scripts/alice-mac.sh witness-preflight'];

async function executeFake(home,{failAt='',badReport='',badOrigin=false}={}){
 const calls=[];
 const worker=async ({bin,args,cwd,env})=>{
  calls.push({bin,args,cwd,env});
  const signature=[...args].join(' ');
  if(failAt && signature.includes(failAt))return {status:'failed',exitCode:1,output:'Traceback: ModuleNotFoundError: No module named alice_bds_level_metadata'};
  if(args[0]==='remote')return {status:'passed',exitCode:0,output:badOrigin?'https://github.com/other/danger.git\n':'https://github.com/hedydev/ioant-AI-Minecraft-Alice.git\n'};
  if(args[0]==='branch')return {status:'passed',exitCode:0,output:'main\n'};
  if(args[0]==='status')return {status:'passed',exitCode:0,output:''};
  if(args[1]==='witness-preflight'){
   const filename=badReport?'AliceAI-BDS-Witness-Preflight-20261024-020304(1).json':'AliceAI-BDS-Witness-Preflight-20261024-020305.json';
   const file=join(home,'Desktop',filename);
   await writeFile(file,JSON.stringify(report()));
   return {status:'passed',exitCode:0,output:'Saved to Mac Desktop: '+file+'\n'};
  }
  return {status:'passed',exitCode:0,output:''};
 };
 const result=await aliceWitnessPreflight({...config,execute:worker,home});
 return {result,calls};
}

test('auto Alice action requires a separate local opt-in, never authorizes arbitrary task-provided commands',async()=>{
 const task=actionFromJson(JSON.stringify({protocol:'ioant-mac-ops-v1',id:'alice-witness-1001',action:'alice-witness-preflight'}));
 assert.equal(task.known,true);
 assert.equal(task.authorized,false);
 assert.equal((await runAction('alice-witness-preflight','/tmp')).status,'approval_required');
 assert.equal(validSshTarget(config.sshTarget),true);
 assert.equal(validSshTarget('tedz@host;curl evil'),false);
 assert.equal(allowedAliceOrigin('https://github.com/hedydev/ioant-AI-Minecraft-Alice.git\n'),true);
});

test('runs only fixed Mac Alice commands in order; receives fresh schema-2 JSON and strips unknown fields',async()=>fixture(async home=>{
 const {result,calls}=await executeFake(home);
 assert.equal(result.status,'passed',result.reason);
 assert.equal(calls.length,8);
 assert.equal(calls.map(c=>c.args.join(' ')).join('|'),fixedSteps.join('|'));
 assert.ok(calls.every(c=>c.env.ALICE_SSH_TARGET===config.sshTarget));
 assert.equal(result.reportFilename,'AliceAI-BDS-Witness-Preflight-20261024-020305.json');
 const parsed=JSON.parse(result.reportJson);
 assert.equal(parsed.schemaVersion,2);
 assert.equal(parsed.betaApisExperiment,'enabled_in_level_dat');
 assert.equal('gamertag' in parsed,false);
 assert.equal('token' in parsed,false);
 const reply=responseForTask({id:'alice-witness-1001',action:'alice-witness-preflight'},result,'sess-001');
 assert.match(reply,/betaApisExperiment/);
 assert.doesNotMatch(reply,/never-send|private-token/);
 assert.match(reply,/\[IOANT-MAC-OPS RESULT alice-witness-1001\]/);
}));

test('Python import error in sync stops before witness/report, with error ready for chat feedback',async()=>fixture(async home=>{
 const {result,calls}=await executeFake(home,{failAt:'sync'});
 assert.equal(result.status,'failed');
 assert.match(result.output,/ModuleNotFoundError/);
 assert.equal(calls.some(c=>c.args[1]==='witness-preflight'),false);
 assert.equal(result.reportJson,undefined);
}));

test('unexpected repo origin aborts before git pull or Mint sync',async()=>fixture(async home=>{
 const {result,calls}=await executeFake(home,{badOrigin:true});
 assert.equal(result.status,'failed');
 assert.equal(calls.length,1);
 assert.match(result.reason,/origin is not/);
}));

test('old duplicate (1) report is rejected instead of recycled',async()=>fixture(async home=>{
 const {result}=await executeFake(home,{badReport:true});
 assert.equal(result.status,'failed');
 assert.match(result.reason,/Unexpected witness-preflight report destination/);
}));

test('schema and timestamps are checked before sensitive JSON is sent to ChatGPT',()=>{
 assert.throws(()=>sanitizePreflight({...report(),schemaVersion:1}),/fresh schemaVersion 2/);
 assert.throws(()=>sanitizePreflight({...report(),observedAtUnix:1234}),/fresh schemaVersion 2/);
 assert.throws(()=>sanitizePreflight({...report(),safeToApplyWorldChanges:true}),/fresh schemaVersion 2/);
});
