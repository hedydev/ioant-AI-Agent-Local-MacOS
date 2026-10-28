import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,lstat,readFile,writeFile,symlink,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {initialWatcherState,persistInitialWatcherState}
 from '../stage2/watch-state-bootstrap.mjs';
const ROOT=resolve(import.meta.dirname,'..');
const fixture=async(run)=>{
 const dir=await realpath(await mkdtemp(join(tmpdir(),'ioant-watch-init-')));
 try{return await run(dir)}
 finally{await rm(dir,{recursive:true,force:true})}
};
test('first watch run persists private, minimal, empty state checkpoint',()=>fixture(async(dir)=>{
 const file=join(dir,'state.json');
 const state=initialWatcherState();
 const result=await persistInitialWatcherState(file,state);
 assert.equal(result.durable,true);
 assert.equal(result.created,true);
 assert.deepEqual(JSON.parse(await readFile(file,'utf8')),state);
 const st=await lstat(file);
 assert.equal(st.isFile(),true);
 assert.equal(st.mode&0o077,0);
 assert.deepEqual(Object.keys(state).sort(),['feedbackPending','initSent','lastTaskId']);
}));
test('existing state never overwritten or reset when idle watcher returns',()=>fixture(async(dir)=>{
 const file=join(dir,'state.json');
 const prior={lastTaskId:'accepted-task-001',feedbackPending:{id:'unconfirmed',
  phase:'press_intent'},initSent:true};
 const raw=JSON.stringify(prior)+'\n';
 await writeFile(file,raw,{mode:0o600});
 await assert.rejects(persistInitialWatcherState(file,initialWatcherState()),
  /initial_watcher_state_race/);
 assert.equal(await readFile(file,'utf8'),raw);
}));
test('symlink injection cannot be overwritten by initial checkpoint',()=>fixture(async(dir)=>{
 const other=join(dir,'keep');
 const file=join(dir,'state.json');
 await writeFile(other,'SENTINEL',{mode:0o600});
 await symlink(other,file);
 await assert.rejects(persistInitialWatcherState(file,initialWatcherState()),
  /initial_watcher_state_race/);
 assert.equal(await readFile(other,'utf8'),'SENTINEL');
}));
test('unsafe startup state cannot become trusted checkpoint',()=>fixture(async(dir)=>{
 const file=join(dir,'state.json');
 for(const state of [{lastTaskId:null,feedbackPending:{},initSent:false},
  {lastTaskId:null,feedbackPending:null,initSent:true},
  {lastTaskId:'123',feedbackPending:null,initSent:false},
  {...initialWatcherState(),extra:'untrusted'},null,[]]){
  await assert.rejects(persistInitialWatcherState(file,state),
   /initial_watcher_state_untrusted/);
 }
 await assert.rejects(lstat(file),{code:'ENOENT'});
}));
test('only one watcher can create a missing checkpoint, never silently accept a race',()=>fixture(async(dir)=>{
 const file=join(dir,'state.json');
 const attempts=await Promise.allSettled([
  persistInitialWatcherState(file,initialWatcherState()),
  persistInitialWatcherState(file,initialWatcherState())
 ]);
 assert.equal(attempts.filter(a=>a.status==='fulfilled').length,1);
 assert.equal(attempts.filter(a=>a.status==='rejected').length,1);
 assert.match(String(attempts.find(a=>a.status==='rejected').reason),
  /initial_watcher_state_race/);
 assert.deepEqual(JSON.parse(await readFile(file,'utf8')),initialWatcherState());
}));
test('watcher seeds only under its per-chat lock; once is never mutated',()=>{
 const source=readFileSync(resolve(ROOT,'stage2/chatgpt-loop.mjs'),'utf8');
 const lock=source.indexOf('const unlock=await acquireConversationLock(workDir)');
 const load=source.indexOf('state=await loadState(stateFile,{initializeMissing:opts.mode');
 assert.ok(lock>0&&load>lock);
 assert.match(source,/if\(initializeMissing\)await persistInitialWatcherState\(file,first\)/);
 assert.match(source,/const first=initialWatcherState\(\)/);
 assert.match(source,/if\(opts.mode==='once'\)/);
 assert.match(source,/if\(err.code!=='ENOENT'\)throw err/);
});
