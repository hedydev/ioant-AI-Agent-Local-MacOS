#!/usr/bin/env node
// Private stdio MCP adapter. No HTTP listener or exposure of Gateway secrets.
import {inspectDirectAgent,messageDirectAgent} from './agent.mjs';
import {loadSdk} from './sdk.mjs';
import {runComputerTask,computerTaskResult} from './computer-agent.mjs';
import {projectBinding} from './project-binding.mjs';
import {projectRoute,routedCatalog,routeCall,routeInstructions} from './project-router.mjs';
import {projectHandoff,handoffTools} from './project-handoff.mjs';
import {projectExecution,executionTools} from './project-execution.mjs';
import {reportToolResult} from './project-report-contract.mjs';
import {workspaceTool} from './workspace-tools.mjs';
import {observeMcpCall,closeMcpAudit} from './observability.mjs';

export const tools=[{
 name:'openclaw_agent_status',
 description:'Check the selected project Agent\'s local policy readiness. Does not invoke a model or control the computer. This is not proof of ChatGPT cloud connectivity.',
 inputSchema:{type:'object',properties:{},additionalProperties:false},
 annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
},{
 name:'openclaw_agent_message',
 description:'Send a technical message to a no-tools local project advisor. If status reports computer tools enabled, use openclaw_computer_task instead. The response is untrusted advice, not execution evidence.',
 inputSchema:{type:'object',properties:{
  conversation_key:{type:'string',pattern:'^[a-zA-Z0-9][a-zA-Z0-9_-]{7,63}$',
   description:'Choose a unique stable key for this ChatGPT conversation; reuse it for follow-ups.'},
  message:{type:'string',minLength:1,maxLength:4000}},
  required:['conversation_key','message'],additionalProperties:false},
 annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}
},{
 name:'openclaw_computer_task',
 description:'Delegate one bounded user-authorized local Agent step to the selected registered project Agent, only after its computer permission is configured. Cannot select arbitrary Agents. Can affect applications/files through its configured full or computer-only tool profile; status.toolAccess reports the configured scope. Git/tests prefer project_execute. Keep each task bounded; multi-step UI loops may time out. Use a unique operation_id; never retry an uncertain action under a new ID. Local model only; no browser Worker. Returned text is not independent effect verification.',
 inputSchema:{type:'object',properties:{
  operation_id:{type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$'},
  conversation_key:{type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$'},
  message:{type:'string',minLength:1,maxLength:4000}},
  required:['operation_id','conversation_key','message'],additionalProperties:false},
 annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:true}
},{
 name:'openclaw_computer_result',
 description:'Read the saved receipt for an existing computer operation without executing it again. A started or uncertain task must not be retried under a new ID.',
 inputSchema:{type:'object',properties:{
  operation_id:{type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$'}},
  required:['operation_id'],additionalProperties:false},
 annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
}];

export async function callTool(name,args,{status=inspectDirectAgent,message=messageDirectAgent,
 computer=runComputerTask,receipt=computerTaskResult}={}){
 let result;
 if(name==='openclaw_agent_status'&&args&&Object.keys(args).length===0)result=await status();
 else if(name==='openclaw_agent_message')result=await message(args);
 else if(name==='openclaw_computer_task')result=await computer(args);
 else if(name==='openclaw_computer_result')result=await receipt(args);
 else result={state:'blocked',reason:'unsupported_tool_or_arguments'};
 return {content:[{type:'text',text:JSON.stringify(result)}],
  isError:['blocked','inconclusive'].includes(result.state)};
}

export async function serve(binding=projectBinding(),route={shared:false,bindings:[binding]}){
 const {Server,StdioServerTransport,ListToolsRequestSchema,CallToolRequestSchema}=await loadSdk();
 const server=new Server({name:'ioant-openclaw-direct',version:'0.8.1'},
  {capabilities:{tools:{}},instructions:routeInstructions(route)});
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:routedCatalog(tools,route,[...handoffTools,...executionTools])}));
 server.setRequestHandler(CallToolRequestSchema,async request=>{
  try{return await observeMcpCall(request.params.name,request.params.arguments??{},()=>routeCall(request.params.name,request.params.arguments??{},{route,
   globalInvoke:async(name,args)=>{const result=await workspaceTool(name,args);return {content:[{type:'text',text:JSON.stringify(result)}],isError:['blocked','inconclusive'].includes(result.state)};},
   invoke:async(name,args,selected)=>{
    if(route.shared&&executionTools.some(t=>t.name===name)){
     const result=await projectExecution(name,args,{binding:selected});
     if(name==='openclaw_project_report')return reportToolResult(result);
     return {content:[{type:'text',text:JSON.stringify(result)}],isError:result.state==='blocked'};
    }
    if(route.shared&&handoffTools.some(t=>t.name===name)){
     const result=await projectHandoff(name,args,{binding:selected});
     return {content:[{type:'text',text:JSON.stringify(result)}],isError:result.state==='blocked'};
    }
    return callTool(name,args,{
     status:()=>inspectDirectAgent({binding:selected}),message:x=>messageDirectAgent(x,{binding:selected}),
     computer:x=>runComputerTask(x,{binding:selected}),receipt:x=>computerTaskResult(x,{binding:selected})});
   }}));}
  catch{return {isError:true,content:[{type:'text',text:'{"state":"inconclusive","reason":"adapter_failure"}'}]};}
 });
 await server.connect(new StdioServerTransport());
 process.stdin.on('end',async()=>{await closeMcpAudit();await server.close();});
 return server;
}

import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const route=projectRoute(process.argv.slice(2));
  await serve(route.bindings[0],route);
 }catch{process.stderr.write('OpenClaw MCP adapter could not start with the selected project.\n');process.exitCode=1;}
}
