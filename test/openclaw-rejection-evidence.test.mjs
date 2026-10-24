import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectRejectionMarkers,classifyLiveSchema,inspectRejectionEvidence,classifyProviderRoots,validateLocalConfig} from '../stage2/openclaw-rejection-evidence.mjs';
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
  rpc:async(method,params)=>{calls.push([method,params]);return method==='config.get'?
    {valid:true,exists:true,config:{models:{providers:{}}}}:
    {path:params.path,schema:{type:'object',secret:'NO_EXPORT'}};},
  validate:async()=>({status:'valid'})
 });
 assert.equal(r.status,'observed');
 assert.deepEqual(r.lookups.map(x=>x.key),['provider','timeout','models','model_context','model_id']);
 assert.equal(calls.filter(([method])=>method==='config.schema.lookup').length,5);
 assert.equal(calls.filter(([method])=>method==='config.get').length,1);
 assert.equal(calls.length,6);
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
  rpc:async()=>{throw Error('Bearer CREDENTIAL_NOT_FOR_CHAT')},
  validate:async()=>({status:'unavailable'})});
 assert.equal(failed.lookups.length,5);
 assert.ok(failed.lookups.every(x=>x.state==='rpc_unavailable'));
 assert.doesNotMatch(JSON.stringify(failed),/CREDENTIAL_NOT_FOR_CHAT/);
});

test('Gateway provider roots show only bounded other-provider shape flags without names or credentials',()=>{
 const sensitive={
  valid:true,exists:true,
  sourceConfig:{models:{providers:{}}},
  config:{models:{providers:{}}},
  parsed:{models:{providers:{}}},
  resolved:{models:{providers:{
   anthropic:{baseUrl:'',apiKey:'VERY_PRIVATE',models:[]},
   openai:{api:'openai-completions',apiKey:'DONT_SHARE',models:[]}
  }}}
 };
 const result=classifyProviderRoots({payload:sensitive});
 assert.equal(result.status,'observed');
 assert.equal(result.targetPresent,false);
 assert.deepEqual(result.roots.sourceConfig,{state:'observed',countBand:'none',targetPresent:false,
  otherProviderMissingBaseUrl:false,otherProviderEmptyBaseUrl:false,otherProviderInvalidShape:false});
 assert.equal(result.roots.resolved.otherProviderEmptyBaseUrl,true);
 assert.equal(result.roots.resolved.otherProviderMissingBaseUrl,true);
 assert.equal(result.roots.resolved.countBand,'multiple');
 assert.doesNotMatch(JSON.stringify(result),/VERY_PRIVATE|DONT_SHARE|anthropic|openai|baseUrl.*http/);
});

test('malformed runtime provider roots fail structurally without outputting values',()=>{
 const result=classifyProviderRoots({valid:true,exists:true,config:{models:{providers:'Bearer SECRET_TOKEN'}}});
 assert.equal(result.roots.config.state,'invalid_provider_container');
 assert.equal(result.roots.parsed.state,'unresolved');
 assert.doesNotMatch(JSON.stringify(result),/SECRET_TOKEN/);
 assert.equal(classifyProviderRoots({valid:false,config:{}}).status,'invalid_snapshot');
});

test('read-only local config validator uses exact binary and emits only validation state',async()=>{
 const calls=[];
 const good=await validateLocalConfig({home:'/fixed/home',run:async(bin,args,opts)=>{
  calls.push({bin,args,opts});
  return {stdout:JSON.stringify({valid:true,issues:[{message:'PRIVATE_SECRET'}]})};
 }});
 assert.deepEqual(good,{status:'valid'});
 assert.equal(calls[0].bin,'/fixed/home/.openclaw/bin/openclaw');
 assert.deepEqual(calls[0].args,['config','validate','--json']);
 assert.equal(calls[0].opts.env.OPENCLAW_GATEWAY_TOKEN,undefined);
 assert.equal(calls[0].opts.timeout,30000);
 const bad=await validateLocalConfig({home:'/fixed/home',run:async()=>{
  throw {stdout:JSON.stringify({valid:false,issues:[{message:'PRIVATE_SECRET'}]})};
 }});
 assert.deepEqual(bad,{status:'invalid'});
 assert.doesNotMatch(JSON.stringify({good,bad}),/PRIVATE_SECRET/);
});

test('rejection evidence composes read-only snapshot and validate probes; no extra RPC writes',async()=>{
 const commands=[];
 const r=await inspectRejectionEvidence({
  preflight:async()=>READY,
  files:async()=>({state:'observed',rejected:0,clobbered:0,latestAge:'none',countsCapped:false}),
  rpc:async(method,params)=>{
   commands.push([method,params]);
   if(method==='config.get')return {valid:true,exists:true,config:{models:{providers:{}}}};
   return {path:params.path,schema:{type:'object',notes:'PRIVATE_DATA'}};
  },
  validate:async()=>({status:'valid',secret:'PRIVATE_DATA'})
 });
 assert.equal(r.status,'observed');
 assert.equal(r.providerRoots.status,'observed');
 assert.equal(r.configValidation.status,'valid');
 assert.equal(commands.filter(([method])=>method==='config.get').length,1);
 assert.equal(commands.filter(([method])=>method==='config.schema.lookup').length,5);
 assert.ok(commands.every(([method])=>['config.get','config.schema.lookup'].includes(method)));
 assert.doesNotMatch(JSON.stringify(r),/PRIVATE_DATA/);
});
