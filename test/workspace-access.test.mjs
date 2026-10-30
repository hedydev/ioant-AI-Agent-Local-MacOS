import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,chmod,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {validateWorkspaceAccess,workspaceCandidates,resolveWorkspaceRepository,repositoryId,safeGitOrigin} from '../integrations/chatgpt-openclaw/workspace-access.mjs';
import {workspaceTool} from '../integrations/chatgpt-openclaw/workspace-tools.mjs';
import {executionEnvironment} from '../integrations/chatgpt-openclaw/project-execution-command.mjs';
import {projectRoute,routedCatalog,routeCall,routeInstructions} from '../integrations/chatgpt-openclaw/project-router.mjs';
import {tools} from '../integrations/chatgpt-openclaw/server.mjs';
import {executionTools} from '../integrations/chatgpt-openclaw/project-execution.mjs';
import {handoffTools} from '../integrations/chatgpt-openclaw/project-handoff.mjs';
async function fixture(t){
 const root=await realpath(await mkdtemp(join(tmpdir(),'ioant-workspaces-')));await chmod(root,0o700);t.after(()=>rm(root,{recursive:true,force:true}));
 return {root,access:{schemaVersion:1,roots:[{key:'fixture',path:root}],scriptRoots:['scripts'],runtimes:{node:process.execPath},provisionAgents:true}};
}
async function repo(root,name,origin='git@github.com:fixture/'+name+'.git'){
 const path=join(root,name);await mkdir(path);
 const git=(...args)=>execFileSync('/usr/bin/git',args,{cwd:path,encoding:'utf8',env:executionEnvironment(),stdio:['ignore','pipe','pipe']}).trim();
 git('init','-q','-b','main');await writeFile(join(path,'README.md'),'fixture\n');git('add','.');
 git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','initial');git('remote','add','origin',origin);
 return {path,git,id:repositoryId(path)};
}
test('workspace grants reject unknown fields, relative roots, duplicate keys and runtime injection',()=>{
 const valid={schemaVersion:1,roots:[{key:'workspace',path:'/approved/root'}],scriptRoots:['scripts'],runtimes:{node:'/absolute/node'},provisionAgents:true};
 assert.equal(validateWorkspaceAccess(valid),valid);
 for(const edit of [d=>d.roots[0].path='../escape',d=>d.roots.push(d.roots[0]),d=>d.scriptRoots=['..'],
  d=>d.runtimes={shell:'/bin/sh'},d=>d.command='anything',d=>d.provisionAgents='yes']){
  const doc=structuredClone(valid);edit(doc);assert.throws(()=>validateWorkspaceAccess(doc));
 }
 assert.equal(safeGitOrigin('https://user:password@github.com/o/r'),false);
 assert.equal(safeGitOrigin('https://github.com/o/r.git?token=x'),false);
});
test('read-only discovery identifies two real Git repositories without network, content or desktop access',async t=>{
 const f=await fixture(t);const a=await repo(f.root,'first'),b=await repo(f.root,'second');
 await mkdir(join(f.root,'not-a-repo'));await symlink(a.path,join(f.root,'linked'));
 const candidates=await workspaceCandidates(f.access);assert.equal(candidates.length,2);
 const info=await resolveWorkspaceRepository(f.access,a.id);assert.equal(info.repo,a.path);assert.equal(info.worktreeClean,true);assert.equal(info.repository,'github.com/fixture/first');
 await writeFile(join(a.path,'private-secret-name.txt'),'not returned');
 const r=await workspaceTool('openclaw_workspace_projects',{}, {load:async()=>f.access,lookup:async()=>null});
 assert.equal(r.projects.length,2);assert.ok(r.projects.every(x=>x.nextTool==='openclaw_project_connect'));
 assert.equal(JSON.stringify(r).includes('private-secret-name'),false);assert.equal(r.modelInferenceInvoked,false);assert.equal(r.computerOperationInvoked,false);
 const single=await workspaceTool('openclaw_workspace_projects',{repository_id:b.id},{load:async()=>f.access,lookup:async()=>null});assert.equal(single.projects.length,1);
 await assert.rejects(resolveWorkspaceRepository(f.access,'0'.repeat(24)),/outside_approved/);
 await assert.rejects(resolveWorkspaceRepository(f.access,'../../secret'),/invalid_repository/);
});
test('discovery refuses credential origins and unsafe roots without leaking their contents',async t=>{
 const f=await fixture(t);await repo(f.root,'credential','https://user:password@github.com/o/r');
 const r=await workspaceTool('openclaw_workspace_projects',{}, {load:async()=>f.access,lookup:async()=>null});
 assert.equal(r.projects[0].reason,'workspace_origin_requires_review');assert.equal(JSON.stringify(r).includes('password'),false);
 await chmod(f.root,0o777);await assert.rejects(workspaceCandidates(f.access),/root_unverified/);
 const absent=await workspaceTool('openclaw_workspace_projects',{}, {load:async()=>null});assert.equal(absent.state,'not_configured');assert.match(absent.nextAction,/do not probe desktop/);
});
test('dynamic routing sees a newly registered third project in the same connection with no schema refresh',async()=>{
 let bindings={one:{projectKey:'one',agentId:'one'},two:{projectKey:'two',agentId:'two'}};
 const route=projectRoute(['--shared-projects','registered'],{registry:()=>bindings});
 const catalog=routedCatalog(tools,route,[...handoffTools,...executionTools]);assert.equal(catalog.length,16);
 const workspace=catalog.find(t=>t.name==='openclaw_workspace_projects');assert.equal(workspace.inputSchema.properties.project_key,undefined);
 const key=catalog.find(t=>t.name==='openclaw_project_execute').inputSchema.properties.project_key;
 assert.equal(key.enum,undefined);assert.ok(key.pattern);
 const read=async()=>JSON.parse((await routeCall('openclaw_projects',{}, {route,invoke:async()=>{}})).content[0].text);
 assert.equal((await read()).projects.length,2);
 bindings.third={projectKey:'third',agentId:'third'};
 assert.equal((await read()).projects.length,3);
 let seen;await routeCall('openclaw_agent_status',{project_key:'third'}, {route,invoke:async(n,a,b)=>{seen=b;return {};}});
 assert.equal(seen.agentId,'third');assert.deepEqual(routedCatalog(tools,route,[...handoffTools,...executionTools]),catalog);
 const global=await routeCall('openclaw_workspace_projects',{}, {route,invoke:async()=>{throw Error('must not route to Agent');},globalInvoke:async()=>({global:true})});
 assert.equal(global.global,true);assert.match(routeInstructions(route),/neither requires project_key/);
});
