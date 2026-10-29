import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,chmod,rm,writeFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProjectHandoffStore} from '../integrations/chatgpt-openclaw/project-handoff-store.mjs';
import {projectHandoff} from '../integrations/chatgpt-openclaw/project-handoff.mjs';
import {projectBinding} from '../integrations/chatgpt-openclaw/project-binding.mjs';
const input={conversation_key:'previous_chat_123',expected_revision:0,
 summary:'Task complete; inspect the existing uncertain receipt before any further action.',operation_ids:['uncertain_op_001']};
const receipt=async({operation_id},{binding})=>({state:'inconclusive',operationId:operation_id,
 reason:'agent_receipt_unavailable_do_not_repeat',project:binding.projectKey});
async function fixture(t,project='openclaw-workflow'){
 const parent=await realpath(await mkdtemp(join(tmpdir(),'ioant-handoff-')));await chmod(parent,0o700);
 t.after(()=>rm(parent,{recursive:true,force:true}));
 const binding=projectBinding(project),store=new ProjectHandoffStore({dir:join(parent,'state'),parent,binding});
 return {binding,store,receipt};
}
test('new process/chat resumes durable project state and rechecks uncertain operations without inference',async t=>{
 const ctx=await fixture(t);
 const saved=await projectHandoff('openclaw_project_handoff',input,ctx);
 assert.equal(saved.state,'handoff_saved');assert.match(saved.handoff_text,/minimum_revision/);
 const store=new ProjectHandoffStore({dir:ctx.store.dir,parent:ctx.store.parent,binding:ctx.binding});
 const result=await projectHandoff('openclaw_project_resume',{minimum_revision:1},{...ctx,store});
 assert.equal(result.state,'handoff_found');assert.equal(result.summary,input.summary);
 assert.equal(result.newConversationKeyRequired,true);assert.equal(result.previousConversationKey,input.conversation_key);
 assert.equal(result.operations[0].doNotRepeat,true);assert.equal(result.operations[0].state,'inconclusive');
 assert.equal((await projectHandoff('openclaw_project_resume',{minimum_revision:2},ctx)).state,'blocked');
});
test('stale or concurrent handoffs cannot overwrite another chat revision',async t=>{
 const {store}=await fixture(t);
 const claims=await Promise.allSettled([store.save(input),store.save({...input,summary:'Competing chat'})]);
 assert.equal(claims.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(claims.filter(x=>x.status==='rejected'&&x.reason.message==='handoff_revision_conflict').length,1);
 await assert.rejects(store.save(input),/handoff_revision_conflict/);
 await store.save({...input,expected_revision:1,summary:'Second revision'});
 assert.equal((await store.latest()).revision,2);
});
test('project state and operation references stay inside the selected project',async t=>{
 const ops=await fixture(t),alice=await fixture(t,'alice-ai');
 await projectHandoff('openclaw_project_handoff',input,ops);
 assert.equal((await projectHandoff('openclaw_project_resume',{},alice)).state,'empty');
 const rejected=await projectHandoff('openclaw_project_handoff',input,
  {...alice,receipt:async()=>({state:'not_found',operationId:input.operation_ids[0]})});
 assert.equal(rejected.reason,'referenced_task_unavailable');assert.equal(await alice.store.latest(),null);
 const wrong=await projectHandoff('openclaw_project_handoff',input,{...alice,
  receipt:async()=>({state:'returned',operationId:input.operation_ids[0],project:'openclaw-workflow'})});
 assert.equal(wrong.reason,'referenced_task_unavailable');
});
test('saved summaries redact secrets while preserving bounded useful context',async t=>{
 const ctx=await fixture(t),summary='Keep project context. api_key=sk-test-secret-value-12345678901234567890';
 const saved=await projectHandoff('openclaw_project_handoff',{...input,summary},ctx);
 assert.equal(saved.redactionApplied,true);
 const resumed=await projectHandoff('openclaw_project_resume',{},ctx);
 assert.match(resumed.summary,/Keep project context/);assert.equal(resumed.summary.includes('sk-test'),false);
 assert.equal(JSON.stringify(saved).includes('sk-test'),false);
});
test('invalid routing fields, payloads and duplicate IDs fail before state access',async()=>{
 let calls=0;const ctx={binding:projectBinding(),store:{save:()=>{calls++;},latest:()=>{calls++;}},receipt:()=>{calls++;}};
 for(const bad of [{...input,agent:'main'},{...input,conversation_key:12345678},{...input,summary:'x'.repeat(6001)},
  {...input,operation_ids:['../../secret']},{...input,operation_ids:['same_op_123','same_op_123']},{...input,expected_revision:-1}])
  assert.equal((await projectHandoff('openclaw_project_handoff',bad,ctx)).state,'blocked');
 for(const bad of [[],{minimum_revision:'1'},{project_key:'alice-ai'}])
  assert.equal((await projectHandoff('openclaw_project_resume',bad,ctx)).state,'blocked');
 assert.equal(calls,0);
});
test('unsafe or corrupt newest handoffs block recovery instead of silently using an older revision',async t=>{
 const ctx=await fixture(t);await ctx.store.save(input);
 await writeFile(join(ctx.store.dir,'handoff-002.json'),'not JSON',{mode:0o600});
 assert.equal((await projectHandoff('openclaw_project_resume',{},ctx)).state,'blocked');
 const other=await fixture(t);await other.store.admit();
 await symlink(join(ctx.store.dir,'handoff-001.json'),join(other.store.dir,'handoff-001.json'));
 await assert.rejects(other.store.latest(),/unsafe_handoff_record/);
});
test('execution references survive new chat resume separately from computer receipts',async t=>{
 const ctx=await fixture(t,'alice-ai');
 let state='running',reads=0;
 const execution=async(name,args,{binding})=>{
  reads++;assert.equal(name,'openclaw_project_result');assert.equal(binding.projectKey,'alice-ai');
  return {project:'alice-ai',agent:'alice-ai',operationId:args.operation_id,state,
   action:'alice_mac_regression',actualCommit:'a'.repeat(40),cached:state==='passed'};
 };
 const saved=await projectHandoff('openclaw_project_handoff',{...input,operation_ids:[],execution_ids:['execution_job_0001']},{...ctx,execution});
 assert.equal(saved.state,'handoff_saved');state='passed';
 const resumed=await projectHandoff('openclaw_project_resume',{}, {...ctx,execution});
 assert.equal(resumed.executions[0].state,'passed');assert.equal(resumed.executions[0].cached,true);
 assert.deepEqual(resumed.operations,[]);assert.equal(reads,2);
 const bad=await projectHandoff('openclaw_project_handoff',{...input,expected_revision:1,execution_ids:['execution_job_0001']},
  {...ctx,execution:async()=>({state:'not_found'})});
 assert.equal(bad.reason,'referenced_task_unavailable');
});
