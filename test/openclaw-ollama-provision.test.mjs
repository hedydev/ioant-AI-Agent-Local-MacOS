import test from 'node:test';
import assert from 'node:assert/strict';
import {safeAudit,validSnapshot,provisionOllama} from '../stage2/openclaw-ollama-provision.mjs';
import {actionFromJson} from '../stage2/protocol.mjs';
import {runAction} from '../stage2/runner.mjs';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const READY={config:'regular_private',ollama:'reachable',agents:'absent',provider:'absent',
 installed:['gemma4:26b-a4b','gpt-oss:20b']};
const RPC_HASH='a'.repeat(64);
function harness({states=[READY, {...READY,provider:'target'}],badSchema=false,patchFails=false,gatewaySnapshot}={}){
 let index=0;
 const calls=[],files=[];
 const opt={
  preflight:async()=>states[Math.min(index++,states.length-1)],
  callRpc:async(name,params)=>{
   calls.push({name,params});
   if(name==='config.schema.lookup')return badSchema?{path:'somewhere_else'}:
    {path:'models.providers.ollama',schema:{type:'object'}};
   if(name==='config.get')return gatewaySnapshot??{hash:RPC_HASH,config:{agents:{defaults:{workspace:'private'}},models:{providers:{}}}};
   if(name==='config.patch'){
    if(patchFails)throw Error('Gateway auth failure containing Bearer secret');
    return {changedPaths:['models.providers.ollama']};
   }
   throw Error('Unexpected method '+name);
  },
  fileCheck:async()=>({isFile:()=>true}),
  readConfig:async()=>Buffer.from('private-token-do-not-log'),
  save:async(path,data,flags)=>files.push({path,data,flags}),
  staging:async()=>'/private-backups',
  cache:'/Volumes/LunaDrive/DeveloperCache/projects/agent',
  volume:'/Volumes/LunaDrive'
 };
 return {opt,calls,files};
}
test('a regular task cannot approve local Gateway writes; explicit launcher opt-in required',async()=>{
 const task={protocol:'ioant-mac-ops-v1',id:'provider-write-0001',action:'openclaw-ollama-provision'};
 const parsed=actionFromJson(JSON.stringify(task));
 assert.equal(parsed.known,true);
 assert.equal(parsed.authorized,false);
 assert.throws(()=>actionFromJson(JSON.stringify({...task,command:'openclaw config set'})),/Malformed/);
 const response=await runAction(parsed.action,'/not-relevant',{enableOpenClawProvision:false});
 assert.equal(response.status,'approval_required');
 const source=readFileSync(resolve(import.meta.dirname,'..','stage2/chatgpt-loop.mjs'),'utf8');
 assert.match(source,/task\.action==='openclaw-ollama-provision' && opts\.enableOpenClawProvision/);
 assert.match(source,/else if\(argv\[i\]==='--enable-openclaw-provision'\)/);
});

test('only strict first-write revisioned snapshots can be updated',()=>{
 assert.deepEqual(validSnapshot({hash:RPC_HASH,config:{models:{providers:{}}}}),{hash:RPC_HASH});
 assert.equal(validSnapshot({hash:RPC_HASH,config:{models:{providers:{ollama:{api:'ollama'}}}}}),null);
 assert.equal(validSnapshot({hash:'unsafe key',config:{}}),null);
 assert.equal(validSnapshot({hash:RPC_HASH,config:'not-an-object'}),null);
 assert.equal(validSnapshot({hash:RPC_HASH}),null);
});

test('actual Mac opaque non-hex revision is preserved byte-for-byte, never echoed or rewritten',async()=>{
 const opaque='W/"authored-revision-2026:abcde1234567"';
 const gatewaySnapshot={valid:true,exists:true,hash:opaque,
   config:{models:{providers:{}}},parsed:{models:{providers:{}}},
   resolved:{models:{providers:{}}},sourceConfig:{models:{providers:{}}}};
 assert.deepEqual(validSnapshot(gatewaySnapshot),{hash:opaque});
 const h=harness({gatewaySnapshot});
 const result=await provisionOllama(h.opt);
 assert.equal(result.state,'applied');
 assert.equal(h.calls.filter(x=>x.name==='config.patch').length,1);
 assert.equal(h.calls.find(x=>x.name==='config.patch').params.baseHash,opaque);
 assert.equal(JSON.stringify(result).includes(opaque),false);
 assert.equal(h.files.length,1);
});

test('opaque revision rejects controls, whitespace, missing validity and conflicting provider sources',()=>{
 const opaque='W/"authored-revision-2026:abcde1234567"';
 const empty={hash:opaque,valid:true,exists:true,config:{models:{providers:{}}}};
 assert.deepEqual(validSnapshot(empty),{hash:opaque});
 for(const hash of ['','foo','has whitespace','has\nnewline','bad\ttab','🚫'.repeat(5),'x'.repeat(257)])
   assert.equal(validSnapshot({...empty,hash}),null,'reject unsafe revision representation');
 for(const change of [{valid:false},{exists:false},{config:'invalid'},{resolved:['unexpected']},
    {sourceConfig:{models:{providers:{ollama:{api:'ollama',apiKey:'secret'}}}}}])
   assert.equal(validSnapshot({...empty,...change}),null,'reject invalid/conflicting config');
 assert.deepEqual(validSnapshot({payload:empty}),{hash:opaque});
});

test('Gateway hash or provider conflict stops before backup and patch',async()=>{
 const opaque='W/"revision-actual-2026:1234567"';
 const variants=[
   {hash:'unsafe key',config:{}},
   {hash:opaque,valid:false,config:{}},
   {hash:opaque,config:{},parsed:{models:{providers:{ollama:{api:'ollama'}}}}},
   {hash:opaque,config:null,parsed:null,resolved:null,sourceConfig:null}
 ];
 for(const gatewaySnapshot of variants){
   const h=harness({gatewaySnapshot});
   const r=await provisionOllama(h.opt);
   assert.equal(r.state,'blocked');
   assert.equal(r.note,'config_revision_or_provider_changed');
   assert.equal(h.files.length,0);
   assert.deepEqual(h.calls.map(x=>x.name),['config.schema.lookup','config.get']);
 }
});

test('bounded and redacted result never includes provider secrets, config content or paths',()=>{
 const r=safeAudit('blocked',{note:'safe_status',provider:'unknown',privateToken:'untrusted',models:['gpt-oss:20b','forged-model']});
 assert.equal(r.audit,'IOANT_OPENCLAW_OLLAMA_PROVISION');
 assert.equal(r.schemaVersion,1);
 assert.equal(JSON.stringify(r).includes('untrusted'),false);
 assert.equal(r.models,undefined);
});

test('a single provider patch happens only after schema, pin and private before-image',async()=>{
 const h=harness();
 const result=await provisionOllama(h.opt);
 assert.equal(result.state,'applied');
 assert.deepEqual(result.models,['gemma4:26b-a4b','gpt-oss:20b']);
 assert.equal(result.runtimeAcknowledged,true);
 assert.equal(result.backup,true);
 assert.deepEqual(h.calls.map(x=>x.name),['config.schema.lookup','config.get','config.patch']);
 assert.equal(h.files.length,1);
 assert.equal(h.files[0].flags.flag,'wx');
 assert.equal(h.files[0].flags.mode,0o600);
 const patch=h.calls[2].params;
 assert.equal(patch.baseHash,RPC_HASH);
 assert.equal(patch.response,'summary');
 const object=JSON.parse(patch.raw);
 assert.deepEqual(Object.keys(object),['models']);
 assert.equal(object.models.providers.ollama.api,'ollama');
 assert.equal(object.models.providers.ollama.baseUrl,'http://127.0.0.1:11435');
 assert.equal(object.models.providers.ollama.apiKey,'ollama-local');
 assert.equal(object.agents,undefined);
 assert.equal(JSON.stringify(result).includes('private-token-do-not-log'),false);
});

test('existing provider and failed or changed prerequisite cause zero Gateway writes',async()=>{
 for(const override of [{provider:'target'},{provider:'different'}, {agents:'present'}, {installed:['gpt-oss:20b']}]){
  const h=harness({states:[{...READY,...override}]});
  const result=await provisionOllama(h.opt);
  assert.ok(['already_configured','blocked'].includes(result.state));
  assert.equal(h.calls.length,0);
  assert.equal(h.files.length,0);
 }
});

test('unknown gateway schema rejects before backup and mutation',async()=>{
 const h=harness({badSchema:true});
 const r=await provisionOllama(h.opt);
 assert.equal(r.state,'blocked');
 assert.equal(r.note,'schema_not_verified');
 assert.equal(h.files.length,0);
 assert.deepEqual(h.calls.map(x=>x.name),['config.schema.lookup']);
});

test('ambiguous patch does not retry and does not claim success',async()=>{
 const h=harness({patchFails:true});
 const r=await provisionOllama(h.opt);
 assert.equal(r.state,'inconclusive');
 assert.equal(r.note,'patch_receipt_unavailable');
 assert.equal(h.calls.filter(x=>x.name==='config.patch').length,1);
 assert.equal(h.files.length,1);
 assert.equal(JSON.stringify(r).includes('Bearer'),false);
});
