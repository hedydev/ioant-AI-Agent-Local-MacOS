import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,chmod,mkdir,writeFile,readFile,rm,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {removeProject} from '../console/project-removal.mjs';
import {decodeRoute,routeHash,projectSelection} from '../console/web/navigation.js';
import {projectRetired} from '../integrations/chatgpt-openclaw/project-lifecycle.mjs';
async function fixture(t){
 const parent=await realpath(await mkdtemp(join(tmpdir(),'project-removal-')));await chmod(parent,0o700);t.after(()=>rm(parent,{recursive:true,force:true}));
 const key='repo-example-123',binding={projectKey:key,agentId:key,workspace:join(parent,'workspace')};await mkdir(binding.workspace,{mode:0o700});await writeFile(join(binding.workspace,'keep.txt'),'user data');
 const configPath=join(parent,'config.json'),grantPath=join(parent,'grants.json'),config={agents:{entries:{main:{untouched:true},[key]:{workspace:binding.workspace}}}},grants={schemaVersion:1,projects:{[key]:{agent:key,workspace:binding.workspace}}};
 await writeFile(configPath,JSON.stringify(config),{mode:0o600});await writeFile(grantPath,JSON.stringify(grants),{mode:0o600});let writes=0;
 const options={parent,configPath,grantPath,bindings:()=>({[key]:binding}),readGrants:()=>JSON.parse(requireRead()),command:async(args,patch)=>{
  if(args[2]==='config.get')return JSON.stringify({config:JSON.parse(await readFile(configPath,'utf8'))});
  if(args[2]==='agents.delete'){const params=JSON.parse(args[args.indexOf('--params')+1]);assert.equal(params.deleteFiles,false);writes++;const c=JSON.parse(await readFile(configPath,'utf8'));delete c.agents.entries[params.agentId];await writeFile(configPath,JSON.stringify(c),{mode:0o600});}return '{}';
 }};
 // A sync reader mirrors the production grant reader.
 const {readFileSync}=await import('node:fs');const requireRead=()=>readFileSync(grantPath,'utf8');
 return {parent,key,binding,config,grants,options,writes:()=>writes,input:{project_key:key,operation_id:'remove_example_123'}};
}
test('removal archives configuration, drops only generated identity, preserves files/receipts and caches operation',async t=>{
 const f=await fixture(t),r=await removeProject(f.input,f.options);assert.equal(r.state,'removed',JSON.stringify(r));assert.equal(f.writes(),1);assert.equal(r.filesDeleted,false);
 assert.deepEqual(JSON.parse(await readFile(f.options.configPath,'utf8')),{agents:{entries:{main:{untouched:true}}}});
 assert.deepEqual(JSON.parse(await readFile(f.options.grantPath,'utf8')).projects,{});assert.equal(await readFile(join(f.binding.workspace,'keep.txt'),'utf8'),'user data');
 assert.deepEqual(JSON.parse(await readFile(join(r.backup,'openclaw.json'),'utf8')),f.config);assert.equal(await projectRetired(f.key,f.parent),true);
 const cached=await removeProject(f.input,{...f.options,command:()=>{throw Error('must_not_repeat');}});assert.equal(cached.cached,true);assert.equal(f.writes(),1);
});
test('active execution prevents removal and leaves its lock and all configuration untouched',async t=>{
 const f=await fixture(t),dir=join(f.parent,'direct-project-execution-'+f.key);await mkdir(dir,{mode:0o700});await writeFile(join(dir,'active.lock'),'existing task',{mode:0o600});
 const r=await removeProject(f.input,f.options);assert.equal(r.reason,'project_execution_busy');assert.equal(f.writes(),0);assert.equal(await readFile(join(dir,'active.lock'),'utf8'),'existing task');assert.equal(await projectRetired(f.key,f.parent),false);
});
test('partial native mutation retains retirement and locks; protected built-ins cannot be removed',async t=>{
 const f=await fixture(t);await assert.rejects(removeProject({...f.input,project_key:'alice-ai'},f.options),/generated_project/);
 const r=await removeProject(f.input,{...f.options,command:async(args)=>{if(!args.includes('--dry-run'))throw Error('native_outcome_unknown');return '{}';}});
 assert.equal(r.state,'inconclusive');assert.equal(await projectRetired(f.key,f.parent),true);assert.ok(await lstat(join(f.parent,'.repository-grants.lock')));
});
test('project route and selection survive refresh; global views never falsely select a project',()=>{
 const route=decodeRoute('#project=repo-example-123');assert.deepEqual(route,{view:'project',project:'repo-example-123'});
 const state={view:route.view,selectedProject:route.project};assert.equal(routeHash(state),'#project=repo-example-123');assert.equal(projectSelection(state,'repo-example-123'),true);assert.equal(projectSelection({...state,view:'activity'},'repo-example-123'),false);
 assert.equal(decodeRoute('#project=%00bad').view,'overview');assert.equal(decodeRoute('#logs').view,'logs');
});
