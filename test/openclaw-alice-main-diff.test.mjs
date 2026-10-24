import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeMainDifference,readPrivateBeforeAfter,classifyGatewayMain,diagnoseMainDiff}
 from '../stage2/openclaw-alice-main-diff.mjs';
import {actionFromJson} from '../stage2/protocol.mjs';
import {actionPlan} from '../stage2/runner.mjs';

const PRIVATE_MAIN={name:'MY_PRIVATE_NAME',workspace:'/SECRET/WORKSPACE',
 model:'very-private/my-model',identity:{name:'HIDDEN_PERSON',emoji:'A'},
 tools:{profile:'full',exec:{mode:'allowlist',token:'VERY_SECRET'}},
 custom_secret_field:{secret:'UNSAFE_VALUE'}};
const OLD={agents:{entries:{main:PRIVATE_MAIN}},
 models:{providers:{ollama:{apiKey:'DO_NOT_LEAK'}}},
 bindings:[{agentId:'main',match:{channel:'my-private-channel'}}]};
const NEW={...OLD,agents:{ownership:'explicit',defaults:{systemAgent:{agentId:'main'}},
 entries:{main:{...PRIVATE_MAIN,model:'new/model',identity:{...PRIVATE_MAIN.identity,emoji:'B'},
  tools:{...PRIVATE_MAIN.tools,exec:{mode:'deny'}},
  custom_secret_field:{secret:'DIFFERENT_SECRET'}},
 'alice-ai':{model:'ollama/gemma4:26b-a4b'}}}};
const OWNER=typeof process.getuid==='function'?process.getuid():0;
const BACKUP='/Volumes/LunaDrive/DeveloperCache/openclaw-agent-backups';
const CONFIG=(process.env.HOME||'/tmp')+'/.openclaw/openclaw.json';
const st=(mode=0o600,isDir=false)=>({mode,uid:OWNER,size:150,
 isFile:()=>!isDir,isDirectory:()=>isDir,isSymbolicLink:()=>false});
const fixture=(a=OLD,b=NEW,overrides={})=>({
 canonical:async path=>path,
 list:async()=>['openclaw-before-alice-0123456789abcdef.json'],
 stat:async path=>st(path===BACKUP?0o700:0o600,path===BACKUP),
 read:async path=>Buffer.from(JSON.stringify(path.startsWith(BACKUP+'/')?a:b)),
 ...overrides
});

test('fixed readonly audit is available without write authorization, no caller arguments',()=>{
 const task={protocol:'ioant-mac-ops-v1',id:'alice-main-diff-0001',action:'openclaw-alice-main-diff'};
 const result=actionFromJson(JSON.stringify(task));
 assert.equal(result.authorized,true);
 assert.deepEqual(actionPlan(result.action,'/project').args,['stage2/openclaw-alice-main-diff.mjs']);
 assert.throws(()=>actionFromJson(JSON.stringify({...task,path:'/SECRET'})),/Malformed/);
});
test('compare schema-known main fields and nested subfields, never field values',()=>{
 const d=summarizeMainDifference(PRIVATE_MAIN,NEW.agents.entries.main);
 assert.equal(d.status,'changed');
 assert.deepEqual(d.fields.map(f=>f.field),['model','tools','identity']);
 assert.deepEqual(d.fields.find(x=>x.field==='identity').subfields,['emoji']);
 assert.deepEqual(d.fields.find(x=>x.field==='tools').subfields,['exec']);
 assert.equal(d.otherFieldChanges,1);
 for(const secret of ['MY_PRIVATE_NAME','VERY_SECRET','HIDDEN_PERSON','SECRET','DIFFERENT_SECRET','/SECRET'])
  assert.ok(!JSON.stringify(d).includes(secret));
});
test('same exact data is equal; changed unknown property names remain hidden',()=>{
 assert.equal(summarizeMainDifference(PRIVATE_MAIN,structuredClone(PRIVATE_MAIN)).status,'equal');
 const d=summarizeMainDifference({privateToken:'VALUE_SECRET'},{privateToken:'CHANGED_SECRET'});
 assert.equal(d.status,'changed');
 assert.deepEqual(d.fields,[]);
 assert.equal(d.otherFieldChanges,1);
 assert.doesNotMatch(JSON.stringify(d),/privateToken|SECRET/);
});
test('additions, removals and missing main are distinguished',()=>{
 const d=summarizeMainDifference({name:'old',model:'a'},{model:'a',workspace:'NEW_SECRET'});
 assert.deepEqual(d.fields,[{field:'name',change:'removed'},{field:'workspace',change:'added'}]);
 assert.equal(summarizeMainDifference(null,{}).status,'missing_main');
});
test('private before image and active disk must be safely parsed and counted',async()=>{
 const d=await readPrivateBeforeAfter(fixture());
 assert.equal(d.status,'compared');
 assert.equal(d.main.status,'changed');
 assert.equal(d.otherAgentsBefore,0);
 assert.equal(d.otherAgentsAfter,1);
 assert.equal(d.mainOwnerConfirmed,true);
 assert.equal(d.bindingsUnchanged,true);
 assert.equal(d.providersUnchanged,true);
 assert.doesNotMatch(JSON.stringify(d),/DO_NOT_LEAK|MY_PRIVATE_NAME|VERY_SECRET|DIFFERENT_SECRET/);
});
test('ambiguous or unsafe backups fail closed before any raw value is returned',async()=>{
 for(const [override,expected] of [
  [{list:async()=>[]},'backup_missing'],
  [{list:async()=>['openclaw-before-alice-0123456789abcdef.json','openclaw-before-alice-fedcba9876543210.json']},'backup_ambiguous'],
  [{canonical:async()=>'/PRIVATE/SYMLINK'},'unsafe_backup_directory'],
  [{stat:async()=>st(0o777,true)},'unsafe_backup_directory'],
  [{read:async()=>Buffer.from('{main: INVALID_JSON}')},'non_json_config']
 ]){
  const d=await readPrivateBeforeAfter(fixture(OLD,NEW,override));
  assert.equal(d.status,expected);
 }
});
test('schema and runtime Gateway roots recognized independently without credential leakage',()=>{
 const g=classifyGatewayMain({payload:{
  valid:true,exists:true,sourceConfig:NEW,config:NEW,parsed:{},resolved:NEW,
  hash:'PRIVATE_REVISION'}});
 assert.deepEqual(g.roots,{sourceConfig:'main_and_alice',config:'main_and_alice',
  parsed:'unavailable',resolved:'main_and_alice'});
 assert.doesNotMatch(JSON.stringify(g),/PRIVATE|SECRET|REVISION/);
});
test('one read-only RPC plus disk comparison; never hides detected main changes',async()=>{
 const calls=[];
 const r=await diagnoseMainDiff({disk:async()=>await readPrivateBeforeAfter(fixture()),
  call:async(method,args)=>{calls.push([method,args]);return {valid:true,exists:true,
  sourceConfig:NEW,config:NEW,parsed:{},resolved:NEW};}});
 assert.deepEqual(calls,[['config.get',{}]]);
 assert.equal(r.readOnly,true);
 assert.equal(r.status,'observed');
 assert.equal(r.disk.main.status,'changed');
 assert.doesNotMatch(JSON.stringify(r),/DO_NOT_LEAK|MY_PRIVATE_NAME|DIFFERENT_SECRET/);
});
test('failures stay bounded and do not output rejected credentials',async()=>{
 const noDisk=await diagnoseMainDiff({disk:async()=>({status:'backup_ambiguous'}),
  call:async()=>({valid:true,exists:true,sourceConfig:NEW})});
 assert.equal(noDisk.status,'review_required');
 const failed=await diagnoseMainDiff({disk:async()=>{throw Error('PRIVATE_PASSWORD');}});
 assert.equal(failed.status,'unavailable');
 assert.doesNotMatch(JSON.stringify(failed),/PRIVATE_PASSWORD/);
});
