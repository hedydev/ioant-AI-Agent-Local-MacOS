import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,chmod,writeFile,readFile,rm,symlink,mkdir,readdir,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProjectExecutionStore} from '../integrations/chatgpt-openclaw/project-execution-store.mjs';
import {projectBinding} from '../integrations/chatgpt-openclaw/project-binding.mjs';
import {projectExecution} from '../integrations/chatgpt-openclaw/project-execution.mjs';
import {archiveHistory,historyStatus,recentExecutionFiles} from '../console/execution-history.mjs';
import {archiveReadersReady,attestArchiveReader,archiveReaderProcesses} from '../integrations/chatgpt-openclaw/archive-reader.mjs';
import {executionHistoryPage,loadActivity} from '../console/activity.mjs';
async function fixture(t){
 const parent=await realpath(await mkdtemp(join(tmpdir(),'execution-archive-')));await chmod(parent,0o700);
 t.after(()=>rm(parent,{recursive:true,force:true}));const binding=projectBinding('alice-ai'),store=new ProjectExecutionStore(binding,{parent});await store.admit();
 return {store,binding,parent,bindings:{'alice-ai':binding},readersReady:async()=>true};
}
const request=(operation_id='archive_test_0001',retain_recent=0)=>({project_key:'alice-ai',operation_id,retain_recent});
const input={operation_id:'historic_task_0001',conversation_key:'historic_chat_0001',action:'alice_mac_regression',expected_commit:'a'.repeat(40)};
async function finished(ctx){
 const policy=async()=>({action:'alice_mac_regression'});
 await projectExecution('openclaw_project_execute',input,{...ctx,policy,launch:async()=>{}});
 const r=await ctx.store.get(input.operation_id),report=await ctx.store.writeLog(r.operationId,'old log\n'.repeat(700));
 const a=await ctx.store.writeArtifact(r.operationId,'audit',{text:'{"verified":true}',format:'json'});
 await ctx.store.save({...r,state:'passed',createdAt:'2000-01-01T00:00:00Z',finishedAt:'2000-01-01T00:00:01Z',report,artifacts:[a]});
 await ctx.store.release(r.operationId,r.digest);return policy;
}
async function seed(ctx,id,state='passed'){
 const record={schemaVersion:1,operationId:id,project:'alice-ai',agent:'alice-ai',digest:'b'.repeat(64),state,
  input:{action:'repository_task'},steps:[],createdAt:'2026-01-01T00:00:00Z',finishedAt:'2026-01-01T00:00:01Z'};
 await writeFile(ctx.store.path(id),JSON.stringify(record)+'\n',{mode:0o600});
}
test('500 hot receipts can be archived without forgetting old claims or reports; new admissions resume',async t=>{
 const ctx=await fixture(t),policy=await finished(ctx);
 await Promise.all(Array.from({length:499},(_,i)=>seed(ctx,'bulk_task_'+String(i).padStart(8,'0'))));
 assert.equal((await historyStatus(ctx.store)).hotCount,500);
 let launches=0;const next={...input,operation_id:'new_task_after_archive'};
 assert.equal((await projectExecution('openclaw_project_execute',next,{...ctx,policy,launch:async()=>launches++})).reason,'execution_history_full');
 const original=await ctx.store.get(input.operation_id),originalText=await readFile(ctx.store.path(input.operation_id),'utf8');
 const r=await archiveHistory(request('archive_full_0001',100),ctx);assert.equal(r.archivedCount,400);
 const s=await historyStatus(ctx.store);assert.equal(s.hotCount,100);assert.equal(s.archivedCount,400);assert.equal(s.remaining,400);
 assert.deepEqual(await ctx.store.get(input.operation_id),original);
 assert.equal(await readFile(join(ctx.store.dir,'archive',input.operation_id,input.operation_id+'.json'),'utf8'),originalText);
 assert.equal((await ctx.store.report(input.operation_id)).logText.length,4000);
 assert.equal((await ctx.store.report(input.operation_id,4000)).logText.length,1600);
 assert.equal((await ctx.store.report(input.operation_id,0,'audit')).logText,'{"verified":true}');
 const cached=await projectExecution('openclaw_project_execute',input,{...ctx,policy,launch:async()=>launches++});assert.equal(cached.cached,true);
 assert.equal((await projectExecution('openclaw_project_execute',{...input,expected_commit:'c'.repeat(40)},{...ctx,policy})).reason,'operation_id_conflict');
 assert.equal(launches,0);
 assert.equal((await archiveHistory(request('archive_full_0001',100),ctx)).cached,true);
 assert.equal((await projectExecution('openclaw_project_execute',next,{...ctx,policy,launch:async()=>launches++})).state,'accepted');assert.equal(launches,1);
});
test('concurrent report readers see the same verified text through archive publication',async t=>{
 const ctx=await fixture(t);await finished(ctx);
 const reads=(async()=>{for(let i=0;i<100;i++){
  assert.equal((await ctx.store.get(input.operation_id)).state,'passed');
  assert.match((await ctx.store.report(input.operation_id)).logText,/old log/);
 }})();
 await Promise.all([archiveHistory(request(),ctx),reads]);
 const files=await recentExecutionFiles(ctx.store);assert.equal(files.length,1);assert.equal(files[0].archived,true);
});
test('unfinished jobs and existing locks block maintenance; uncertain receipts are retained',async t=>{
 const ctx=await fixture(t);await seed(ctx,'old_finished_task');await seed(ctx,'unknown_old_task','inconclusive');
 await writeFile(join(ctx.store.dir,'active.lock'),'existing-owner',{mode:0o600});
 assert.equal((await archiveHistory(request(),ctx)).reason,'project_execution_busy');
 assert.equal(await readFile(join(ctx.store.dir,'active.lock'),'utf8'),'existing-owner');
 await rm(join(ctx.store.dir,'active.lock'));await seed(ctx,'running_old_task','running');
 assert.equal((await archiveHistory(request('archive_test_0002'),ctx)).reason,'project_execution_unsettled');
 await rm(ctx.store.path('running_old_task'));const r=await archiveHistory(request('archive_test_0003'),ctx);assert.equal(r.archivedCount,1);
 assert.equal((await historyStatus(ctx.store)).uncertainCount,1);assert.ok((await readdir(ctx.store.dir)).includes('unknown_old_task.json'));
});
test('old runtime, path injection and tampered reports fail before deleting originals',async t=>{
 const ctx=await fixture(t);await finished(ctx);
 await assert.rejects(archiveHistory(request(),{...ctx,readersReady:async()=>false}),/archive_reader_upgrade_required/);
 await assert.rejects(archiveHistory({...request(),path:'/tmp'},ctx),/invalid_archive_request/);
 await assert.rejects(archiveHistory({...request(),project_key:'unknown'},ctx),/project_not_registered/);
 await writeFile(ctx.store.path(input.operation_id,'log'),'tampered',{mode:0o600});
 const r=await archiveHistory(request(),ctx);assert.equal(r.reason,'execution_report_changed');
 assert.equal((await ctx.store.get(input.operation_id)).state,'passed');
 assert.ok((await readdir(ctx.store.dir)).includes(input.operation_id+'.json'));
});
test('archived links are rejected, and already published identical archives can finish hot cleanup',async t=>{
 const ctx=await fixture(t);await finished(ctx);const id=input.operation_id;
 const root=join(ctx.store.dir,'archive');await mkdir(root,{mode:0o700});await symlink(ctx.parent,join(root,id));
 assert.equal((await archiveHistory(request(),ctx)).state,'blocked');assert.ok((await readdir(ctx.store.dir)).includes(id+'.json'));
 await rm(join(root,id));await mkdir(join(root,id),{mode:0o700});
 for(const name of [id+'.json',id+'.log',id+'.artifact-audit.txt'])await copyFile(join(ctx.store.dir,name),join(root,id,name));
 assert.equal((await archiveHistory(request('archive_recover_0002'),ctx)).state,'archived');
 assert.equal((await historyStatus(ctx.store)).hotCount,0);assert.equal((await ctx.store.report(id,0,'audit')).state,'report');
});
test('runtime attestation rejects absent, stale and mixed readers; shell text is not a server',async t=>{
 const ctx=await fixture(t),processes=async()=>[{pid:process.pid,start:'fixed-start'}];
 assert.equal(await archiveReadersReady({...ctx,processes}),false);
 await attestArchiveReader({...ctx,processes});assert.equal(await archiveReadersReady({...ctx,processes}),true);
 assert.equal(await archiveReadersReady({...ctx,processes:async()=>[{pid:process.pid,start:'different-start'}]}),false);
 assert.equal(await archiveReadersReady({...ctx,processes:async()=>[...await processes(),{pid:42,start:'old-runtime'}]}),false);
 const entry=new URL('../integrations/chatgpt-openclaw/server.mjs',import.meta.url).pathname;
 const rows=await archiveReaderProcesses(async()=>({stdout:`${process.getuid()} 21 Mon Nov  2 08:00:00 2026 /bin/zsh -c node ${entry}\n${process.getuid()} 22 Mon Nov  2 08:00:00 2026 /opt/node ${entry}\n`}));
 assert.deepEqual(rows.map(r=>r.pid),[22]);
});
test('console pages archived history without losing project scoping or artifact links',async t=>{
 const ctx=await fixture(t);await finished(ctx);await archiveHistory(request(),ctx);
 await Promise.all(Array.from({length:31},(_,i)=>seed(ctx,'page_task_'+String(i).padStart(8,'0'))));
 const page=await executionHistoryPage({project:'alice-ai'},ctx);assert.equal(page.rows.length,30);assert.equal(page.nextOffset,30);
 const tail=await executionHistoryPage({project:'alice-ai',offset:30},ctx);assert.equal(tail.rows.length,2);assert.equal(tail.nextOffset,null);
 const old=[...page.rows,...tail.rows].find(r=>r.operationId===input.operation_id);
 assert.equal(old.archived,true);assert.ok(old.artifacts.some(a=>a.id==='audit'));assert.equal(old.digest,undefined);assert.equal(old.input,undefined);
 await assert.rejects(executionHistoryPage({project:'unknown'},ctx),/project_not_registered/);
 await assert.rejects(executionHistoryPage({project:'alice-ai',offset:-1},ctx),/invalid_history_request/);
 const activity=await loadActivity({...ctx,grants:{projects:{}},configLoad:async()=>({}),inspect:async()=>null,policy:async()=>false});
 assert.equal(activity.projects[0].history.archivedCount,1);assert.ok(activity.activities.some(r=>r.archived));
});
