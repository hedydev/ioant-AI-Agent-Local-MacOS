import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,chmod,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FULL_PROJECT_TOOLS,projectFullAccessEnabled} from '../integrations/chatgpt-openclaw/project-access-policy.mjs';
import {nativeProjectPatch} from '../integrations/chatgpt-openclaw/native-project-agent.mjs';
import {projectComputerPolicy,inspectDirectAgent} from '../integrations/chatgpt-openclaw/agent.mjs';
import {configureProjectAgentAccess} from '../scripts/configure-project-agent-access.mjs';
import {activityRow} from '../console/activity.mjs';
async function fixture(t){
 const root=await realpath(await mkdtemp(join(tmpdir(),'project-access-')));await chmod(root,0o700);t.after(()=>rm(root,{recursive:true,force:true}));
 const binding={projectKey:'repo-example-123',agentId:'repo-example-123',workspace:join(root,'agents/repo-example-123')};await mkdir(binding.workspace,{recursive:true,mode:0o700});await writeFile(join(binding.workspace,'AGENTS.md'),'old advisor',{mode:0o600});
 const config={agents:{ownership:'explicit',defaults:{systemAgent:{agentId:'main'}},entries:{main:{untouched:true},[binding.agentId]:{workspace:binding.workspace,model:'ollama/gemma4:26b-a4b',tools:{deny:['*'],exec:{mode:'deny'}}}}},models:{providers:{ollama:{api:'ollama',baseUrl:'http://127.0.0.1:11435'}}}};
 const configPath=join(root,'config.json'),accessPath=join(root,'access.json'),backups=join(root,'backups');await writeFile(configPath,JSON.stringify(config),{mode:0o600});await mkdir(backups,{mode:0o700});let applies=0;
 const options={bindings:{[binding.projectKey]:binding},configPath,accessPath,backups,workspace:async()=>'present_private',command:async(args,patch)=>{
  if(args[0]==='gateway')return JSON.stringify({config:JSON.parse(await readFile(configPath,'utf8'))});
  if(!args.includes('--dry-run')){applies++;const c=JSON.parse(await readFile(configPath,'utf8'));for(const [k,v] of Object.entries(patch.agents.entries))Object.assign(c.agents.entries[k],v);await writeFile(configPath,JSON.stringify(c),{mode:0o600});}return '{}';
 }};return {root,binding,config,options,applies:()=>applies};
}
test('operator opt-in is private, validated, and absent by default',async t=>{
 const f=await fixture(t),path=f.options.accessPath;assert.equal(projectFullAccessEnabled(path),false);
 await writeFile(path,JSON.stringify({schemaVersion:1,projectAgentAccess:'full'}),{mode:0o600});assert.equal(projectFullAccessEnabled(path),true);
 await chmod(path,0o644);assert.equal(projectFullAccessEnabled(path),false);
});
test('migration dry run changes nothing; apply backs up and changes only registered Agent tools/roles',async t=>{
 const f=await fixture(t);assert.equal((await configureProjectAgentAccess('--dry-run',f.options)).state,'validated');assert.equal(f.applies(),0);
 assert.equal(await readFile(join(f.binding.workspace,'AGENTS.md'),'utf8'),'old advisor');assert.equal(projectFullAccessEnabled(f.options.accessPath),false);
 const result=await configureProjectAgentAccess('--apply',f.options);assert.equal(result.state,'applied');assert.equal(f.applies(),1);assert.equal(projectFullAccessEnabled(f.options.accessPath),true);
 const after=JSON.parse(await readFile(f.options.configPath,'utf8'));assert.deepEqual(after.agents.entries.main,{untouched:true});assert.deepEqual(after.agents.entries[f.binding.agentId].tools,FULL_PROJECT_TOOLS);
 assert.equal(projectComputerPolicy(after,f.binding),true);const status=await inspectDirectAgent({binding:f.binding,load:async()=>after,workspace:async()=>'present_private'});assert.equal(status.computerControlEnabled,true);assert.equal(status.toolAccess,'full');
 assert.deepEqual(JSON.parse(await readFile(join(result.backup,'openclaw.json'),'utf8')),f.config);
});
test('new full-mode projects use independent local identity and still reject remote fallback policy',async t=>{
 const f=await fixture(t),c=structuredClone(f.config);delete c.agents.entries[f.binding.agentId];
 const patch=nativeProjectPatch(c,f.binding,{agentRoot:join(f.root,'agents'),fullAccess:true});assert.deepEqual(patch.agents.entries[f.binding.agentId].tools,FULL_PROJECT_TOOLS);
 c.agents.defaults.model={primary:'ollama/gemma4:26b-a4b',fallbacks:['external/model']};assert.throws(()=>nativeProjectPatch(c,f.binding,{agentRoot:join(f.root,'agents'),fullAccess:true}),/local_model/);
});
test('capability display distinguishes actual successful tools from available permission and legacy unknowns',()=>{
 const computer=activityRow({operationId:'cursor_probe_123',result:{state:'returned',toolsUsed:{evidence:'native_terminal_receipt',successful:['computer','read']}}},'computer','project');assert.deepEqual(computer.toolsUsed.successful,['computer','read']);
 const legacy=activityRow({operationId:'old_probe_123',result:{state:'returned'}},'computer','project');assert.equal(legacy.toolsUsed.evidence,'unavailable');
 const exec=activityRow({operationId:'build_probe_123',state:'failed',steps:[{name:'fetch',state:'passed'},{name:'build',state:'failed',runtime:'bash',script:'scripts/check.sh',capability:'script',exitCode:1}]},'execution','project');assert.deepEqual(exec.toolsUsed.successful,['git']);assert.equal(exec.steps[1].script,'scripts/check.sh');assert.equal(exec.toolsUsed.subprocessesEnumerated,false);
});
