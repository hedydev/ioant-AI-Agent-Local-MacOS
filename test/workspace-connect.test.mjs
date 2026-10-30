import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,chmod,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {ComputerTaskStore} from '../integrations/chatgpt-openclaw/computer-task-store.mjs';
import {connectWorkspaceProject,generatedProjectBinding} from '../integrations/chatgpt-openclaw/workspace-connect.mjs';
import {readRepositoryTaskGrants} from '../integrations/chatgpt-openclaw/repository-task-policy.mjs';
import {nativeProjectPatch,projectAgentDefinition,provisionProjectAgent} from '../integrations/chatgpt-openclaw/native-project-agent.mjs';
async function fixture(t){
 const parent=await realpath(await mkdtemp(join(tmpdir(),'ioant-connect-')));await chmod(parent,0o700);t.after(()=>rm(parent,{recursive:true,force:true}));
 const store=new ComputerTaskStore(join(parent,'claims'),parent),repo={repository_id:'a'.repeat(24),name:'Example',repo:join(parent,'repo'),repository:'github.com/fixture/repo',branch:'main',origin:'git@github.com:fixture/repo.git'};
 const access={scriptRoots:['scripts'],runtimes:{node:process.execPath},provisionAgents:true};let provisions=0;
 const opts={store,grantPath:join(parent,'grants.json'),accessLoad:async()=>access,resolve:async()=>repo,lookup:async()=>null,
  provision:async(b,{onMutation})=>{provisions++;await onMutation('native_config_write');return {};}};
 return {parent,repo,access,opts,provisions:()=>provisions,input:{operation_id:'connect_example_0001',repository_id:repo.repository_id}};
}
test('connection creates independent data grants, caches same ID and refuses ID conflicts',async t=>{
 const f=await fixture(t),r=await connectWorkspaceProject(f.input,f.opts);assert.equal(r.state,'connected',JSON.stringify(r));assert.equal(r.nativeAgentCreated,true);
 assert.equal(r.pluginRefreshRequired,false);assert.equal(f.provisions(),1);
 const grants=readRepositoryTaskGrants(f.opts.grantPath);assert.equal(grants.projects[r.project_key].repo,f.repo.repo);
 const repeat=await connectWorkspaceProject(f.input,{...f.opts,provision:()=>{throw Error('must not repeat');}});assert.equal(repeat.cached,true);assert.equal(repeat.state,'connected');
 assert.equal((await connectWorkspaceProject({...f.input,repository_id:'b'.repeat(24)},f.opts)).reason,'operation_id_conflict');
 const b=generatedProjectBinding({...f.repo,repository_id:'b'.repeat(24)});assert.notEqual(r.project_key,b.projectKey);assert.notEqual(grants.projects[r.project_key].workspace,b.workspace);
});
test('already-bound repositories reuse their Agent and preserve existing grant unchanged',async t=>{
 const f=await fixture(t),binding=generatedProjectBinding(f.repo);
 const first=await connectWorkspaceProject(f.input,f.opts),before=await readFile(f.opts.grantPath,'utf8');
 const second=await connectWorkspaceProject({...f.input,operation_id:'connect_example_0002'},{...f.opts,lookup:async()=>({binding,generic:true})});
 assert.equal(first.agent,second.agent);assert.equal(second.alreadyConnected,true);assert.equal(f.provisions(),1);assert.equal(await readFile(f.opts.grantPath,'utf8'),before);
});
test('uncertain native mutation retains lock and repeated requests only read the durable result',async t=>{
 const f=await fixture(t);let calls=0;
 const options={...f.opts,provision:async(b,{onMutation})=>{calls++;await onMutation('native_config_write');throw Error('native_project_live_readback_pending');}};
 const r=await connectWorkspaceProject(f.input,options);assert.equal(r.state,'inconclusive');assert.equal(r.configurationMayHaveChanged,true);
 assert.equal((await connectWorkspaceProject(f.input,options)).cached,true);assert.equal(calls,1);
 assert.equal((await connectWorkspaceProject({...f.input,operation_id:'connect_example_0002'},options)).reason,'workspace_connection_busy');
 assert.equal(Object.keys(readRepositoryTaskGrants(f.opts.grantPath).projects).length,0);
});
test('missing root grant, malformed inputs and disabled native provisioning do not configure Agents',async t=>{
 const f=await fixture(t);
 for(const bad of [{...f.input,command:'anything'},{...f.input,repository_id:'../escape'},{...f.input,project_key:'other'}])assert.equal((await connectWorkspaceProject(bad,f.opts)).state,'blocked');
 assert.equal((await connectWorkspaceProject(f.input,{...f.opts,accessLoad:async()=>null})).reason,'workspace_access_not_configured');
 const r=await connectWorkspaceProject({...f.input,operation_id:'connect_example_0002'},{...f.opts,accessLoad:async()=>({...f.access,provisionAgents:false})});
 assert.equal(r.reason,'native_project_provisioning_not_enabled');assert.equal(f.provisions(),0);
});
function config(){return {agents:{ownership:'explicit',defaults:{systemAgent:{agentId:'main'}},entries:{main:{name:'owner'},existing:{workspace:'/existing',unchanged:true}}},models:{providers:{ollama:{baseUrl:'http://127.0.0.1:11435',api:'ollama'}}},privateSetting:'never returned'};}
test('native patch creates deny-all local Agent and cannot edit an existing or privileged identity',()=>{
 const binding=generatedProjectBinding({name:'Any Project',repository_id:'a'.repeat(24)}),before=config(),patch=nativeProjectPatch(before,binding,{fullAccess:false});
 assert.deepEqual(patch.agents.entries[binding.agentId],projectAgentDefinition(binding,{fullAccess:false}));assert.deepEqual(before,config());
 const agent=patch.agents.entries[binding.agentId];assert.deepEqual(agent.tools.deny,['*']);assert.equal(agent.tools.exec.mode,'deny');assert.deepEqual(agent.subagents.allowAgents,[]);
 const occupied=config();occupied.agents.entries[binding.agentId]={};assert.throws(()=>nativeProjectPatch(occupied,binding),/identity_in_use/);
 assert.throws(()=>nativeProjectPatch(config(),{...binding,agentId:'main'}),/precondition/);
});
test('native provisioning dry-validates, backs up, adds one Agent and verifies disk/live without inference',async t=>{
 const f=await fixture(t),agentRoot=join(f.parent,'agents'),backups=join(f.parent,'backups'),configPath=join(f.parent,'config.json');
 await mkdir(agentRoot,{mode:0o700});await mkdir(backups,{mode:0o700});const before=config();await writeFile(configPath,JSON.stringify(before),{mode:0o600});
 const binding=generatedProjectBinding(f.repo,{agentRoot}),calls=[];
 const command=async(args,patch)=>{
  calls.push(args.join(' '));
  if(args[0]==='gateway'){const c=JSON.parse(await readFile(configPath,'utf8'));return JSON.stringify({sourceConfig:c,config:c,parsed:c,resolved:c});}
  if(!args.includes('--dry-run')){const c=JSON.parse(await readFile(configPath,'utf8'));Object.assign(c.agents.entries,patch.agents.entries);await writeFile(configPath,JSON.stringify(c),{mode:0o600});}
  return '{}';
 };
 const r=await provisionProjectAgent(binding,{configPath,agentRoot,backups,command,fullAccess:false});assert.equal(r.nativeAgentCreated,true);assert.equal(r.modelInferenceInvoked,false);
 assert.deepEqual(calls,['config patch --stdin --dry-run --json','config patch --stdin','gateway call config.get --json']);
 const after=JSON.parse(await readFile(configPath,'utf8'));delete after.agents.entries[binding.agentId];assert.equal(isDeepStrictEqual(after,before),true);
 assert.match(await readFile(join(binding.workspace,'AGENTS.md'),'utf8'),/no-tools advisor/);
});
