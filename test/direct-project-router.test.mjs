import test from 'node:test';
import assert from 'node:assert/strict';
import {projectRoute,routedCatalog,routeCall,routeInstructions} from '../integrations/chatgpt-openclaw/project-router.mjs';
import {tools} from '../integrations/chatgpt-openclaw/server.mjs';
import {handoffTools} from '../integrations/chatgpt-openclaw/project-handoff.mjs';
const shared=()=>projectRoute(['--shared-projects','openclaw-workflow,alice-ai']);
const data=r=>JSON.parse(r.content[0].text);

test('local startup alone selects fixed or explicit shared registered bindings',()=>{
 assert.equal(projectRoute().bindings[0].agentId,'openclaw-dev');
 assert.equal(projectRoute(['--project','alice-ai']).shared,false);
 assert.equal(shared().bindings[1].agentId,'alice-ai');
 for(const args of [['--shared-projects','alice-ai'],['--shared-projects','alice-ai,alice-ai'],
  ['--shared-projects','openclaw-workflow,main'],['--shared-projects','openclaw-workflow,../../alice-ai'],
  ['--shared-projects','openclaw-workflow, alice-ai'],['--project','alice-ai','extra']])assert.throws(()=>projectRoute(args));
});
test('shared schemas require explicit project on every scoped tool; fixed catalog is unchanged',()=>{
 const fixed=routedCatalog(tools,projectRoute(),handoffTools);assert.deepEqual(fixed,tools);
 const catalog=routedCatalog(tools,shared(),handoffTools);assert.equal(catalog.length,7);
 for(const tool of catalog.slice(1)){
  assert.ok(tool.inputSchema.required.includes('project_key'));
  assert.deepEqual(tool.inputSchema.properties.project_key.enum,['openclaw-workflow','alice-ai']);
 }
 catalog[1].inputSchema.properties.project_key.enum.push('bad');
 assert.equal(routedCatalog(tools,shared(),handoffTools)[1].inputSchema.properties.project_key.enum.length,2);
 assert.equal(tools[0].inputSchema.properties.project_key,undefined);
});
test('missing/unknown project never reaches a backend or silently chooses the workflow',async()=>{
 let calls=0;const ctx={route:shared(),invoke:async()=>{calls++;}};
 for(const args of [{},{project_key:'main'},{project_key:'__proto__'},{project_key:'../../other'},[],null]){
  assert.equal((await routeCall('openclaw_computer_task',args,ctx)).isError,true);
 }
 assert.equal(calls,0);
 const listed=data(await routeCall('openclaw_projects',{},ctx));
 assert.equal(listed.authenticatedChatGPTProject,false);assert.equal(listed.projects.length,2);
 assert.equal((await routeCall('openclaw_projects',{project_key:'alice-ai'},ctx)).isError,true);
});
test('shared dispatch strips only the key and pins Agent locally for every tool family',async()=>{
 const seen=[];
 for(const name of ['openclaw_agent_status','openclaw_agent_message','openclaw_computer_task','openclaw_computer_result','openclaw_project_resume','openclaw_project_handoff']){
  await routeCall(name,{project_key:'alice-ai',operation_id:'same_id_123'},
   {route:shared(),invoke:async(n,args,binding)=>{seen.push({n,args,binding});return {};}});
 }
 assert.equal(seen.length,6);
 for(const row of seen){assert.equal(row.binding.agentId,'alice-ai');assert.deepEqual(row.args,{operation_id:'same_id_123'});}
 assert.match(routeInstructions(shared()),/fresh conversation_key/);
});
test('fixed routing never treats a remote project field as authority',async()=>{
 await routeCall('openclaw_agent_status',{project_key:'alice-ai'},
  {route:projectRoute(),invoke:async(name,args,binding)=>{
   assert.equal(binding.agentId,'openclaw-dev');assert.equal(args.project_key,'alice-ai');return {};
  }});
});
