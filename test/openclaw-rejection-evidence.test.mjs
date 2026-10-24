import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectRejectionMarkers,classifyLiveSchema,inspectRejectionEvidence} from '../stage2/openclaw-rejection-evidence.mjs';
import {actionFromJson} from '../stage2/protocol.mjs';
import {actionPlan} from '../stage2/runner.mjs';
const READY={config:'regular_private',provider:'absent',agents:'absent'};
const uid=typeof process.getuid==='function'?process.getuid():0;
const file=(mode=0o600,mtimeMs=3600000)=>({isDirectory:()=>false,isFile:()=>true,isSymbolicLink:()=>false,mode,uid,size:512,mtimeMs});
const dir=(mode=0o700)=>({isDirectory:()=>true,isFile:()=>false,isSymbolicLink:()=>false,mode,uid});
test('fixed evidence action cannot accept shell, path, raw config or user arguments',()=>{
 const input={protocol:'ioant-mac-ops-v1',id:'evidence-check-001',action:'openclaw-rejection-evidence'};
 const parsed=actionFromJson(JSON.stringify(input));
 assert.equal(parsed.authorized,true);
 assert.deepEqual(actionPlan(parsed.action,'/repo').args,['stage2/openclaw-rejection-evidence.mjs']);
 assert.throws(()=>actionFromJson(JSON.stringify({...input,path:'~/.openclaw'})),/Malformed/);
});
test('private rejected marker metadata is bounded and filenames never leave Mac',async()=>{
 const visited=[];
 const report=await inspectRejectionMarkers({home:'/fake',now:3605000,fs:{
  readdir:async p=>{visited.push(['list',p]);return ['openclaw.json.rejected.20261024-01','openclaw.json.clobbered.20261024-02','private-other']},
  lstat:async p=>{visited.push(['stat',p]);return p==='/fake/.openclaw'?dir():file()}
 }});
 assert.deepEqual(report,{state:'observed',rejected:1,clobbered:1,countsCapped:false,latestAge:'last_hour'});
 assert.equal(visited.filter(x=>x[0]==='stat').length,3);
 assert.doesNotMatch(JSON.stringify(report),/fake|20261024|private-other/);
});
test('unsafe config folder and public rejected file fail closed before content reads',async()=>{
 const unsafeDir=await inspectRejectionMarkers({home:'/fake',fs:{
  lstat:async()=>dir(0o777),readdir:async()=>{throw Error('unexpected list')}
 }});
 assert.equal(unsafeDir.state,'unsafe_config_directory');
 for(const mode of [0o644,0o777]){
  const r=await inspectRejectionMarkers({home:'/fake',fs:{
   readdir:async()=>['openclaw.json.rejected.1'],
   lstat:async p=>p==='/fake/.openclaw'?dir():file(mode)
  }});
  assert.equal(r.state,'unsafe_marker_file');
 }
});
test('Gateway schema is classified without exposing descriptions, hashes or unknown fields',()=>{
 const snapshot={path:'models.providers.ollama',schema:{type:'object',description:'PRIVATE_SECRET'},authToken:'DO_NOT_LEAK'};
 assert.deepEqual(classifyLiveSchema('provider',snapshot),
  {key:'provider',state:'recognized',type:'object',required:'unspecified'});
 assert.equal(classifyLiveSchema('provider',{path:'other',schema:{type:'object'}}).state,'unresolved');
 assert.equal(classifyLiveSchema('arbitrary',snapshot),null);
});
test('five fixed read-only Gateway schema calls provide only enums and typed results',async()=>{
 const calls=[];
 const r=await inspectRejectionEvidence({preflight:async()=>READY,
  files:async()=>({state:'observed',rejected:1,clobbered:0,latestAge:'last_day',countsCapped:false}),
  rpc:async(method,params)=>{calls.push([method,params]);return {path:params.path,schema:{type:'object',secret:'NO_EXPORT'}}}
 });
 assert.equal(r.status,'observed');
 assert.deepEqual(r.lookups.map(x=>x.key),['provider','timeout','models','model_context','model_id']);
 assert.ok(calls.every(([method])=>method==='config.schema.lookup'));
 assert.equal(calls.length,5);
 assert.doesNotMatch(JSON.stringify(r),/NO_EXPORT|openclaw\.json|\.openclaw/);
});
test('provider conflict blocks lookups and gateway errors never expose freeform text',async()=>{
 let called=0;
 const blocked=await inspectRejectionEvidence({preflight:async()=>({...READY,provider:'target'}),
  rpc:async()=>{called++;throw Error('unexpected')}}); 
 assert.equal(blocked.status,'preflight_blocked');
 assert.equal(called,0);
 const failed=await inspectRejectionEvidence({preflight:async()=>READY,
  files:async()=>({state:'metadata_unavailable'}),
  rpc:async()=>{throw Error('Bearer CREDENTIAL_NOT_FOR_CHAT')}});
 assert.equal(failed.lookups.length,5);
 assert.ok(failed.lookups.every(x=>x.state==='rpc_unavailable'));
 assert.doesNotMatch(JSON.stringify(failed),/CREDENTIAL_NOT_FOR_CHAT/);
});
