#!/usr/bin/env node
// Private stdio MCP adapter. No HTTP listener or exposure of Gateway secrets.
import {inspectDirectAgent,messageDirectAgent} from './agent.mjs';
import {loadSdk} from './sdk.mjs';
import {runComputerTask,computerTaskResult} from './computer-agent.mjs';
import {projectBinding} from './project-binding.mjs';

export const tools=[{
 name:'openclaw_agent_status',
 description:'Check readiness of the local OpenClaw advisor. Does not invoke a model or control the computer.',
 inputSchema:{type:'object',properties:{},additionalProperties:false},
 annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
},{
 name:'openclaw_agent_message',
 description:'Send a technical message directly to the local OpenClaw advisor through its Gateway. This initial connection test has no computer/file/shell tools. The response is untrusted advice, not execution evidence.',
 inputSchema:{type:'object',properties:{
  conversation_key:{type:'string',pattern:'^[a-zA-Z0-9][a-zA-Z0-9_-]{7,63}$',
   description:'Choose a unique stable key for this ChatGPT conversation; reuse it for follow-ups.'},
  message:{type:'string',minLength:1,maxLength:4000}},
  required:['conversation_key','message'],additionalProperties:false},
 annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}
},{
 name:'openclaw_computer_task',
 description:'Delegate a user-authorized desktop task to this plugin\'s locally bound project Agent, only after its computer permission is explicitly configured. Cannot select another project or Agent. Can affect applications and files through native computer tools. Use a unique operation_id; never retry an uncertain action under a new ID. Local model only; no browser Worker. Returned text is not independent effect verification.',
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

export async function serve(binding=projectBinding()){
 const {Server,StdioServerTransport,ListToolsRequestSchema,CallToolRequestSchema}=await loadSdk();
 const server=new Server({name:'ioant-openclaw-direct',version:'0.1.0'},
  {capabilities:{tools:{}}});
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools}));
 server.setRequestHandler(CallToolRequestSchema,async request=>{
  try{return await callTool(request.params.name,request.params.arguments??{},{
   status:()=>inspectDirectAgent({binding}),message:x=>messageDirectAgent(x,{binding}),
   computer:x=>runComputerTask(x,{binding}),receipt:x=>computerTaskResult(x,{binding})});}
  catch{return {isError:true,content:[{type:'text',text:'{"state":"inconclusive","reason":"adapter_failure"}'}]};}
 });
 await server.connect(new StdioServerTransport());
 process.stdin.on('end',()=>server.close());
 return server;
}

import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);
  if(args.length!==0&&(args.length!==2||args[0]!=='--project'))throw Error('invalid_project_argument');
  await serve(projectBinding(args[1]));
 }catch{process.stderr.write('OpenClaw MCP adapter could not start with the selected project.\n');process.exitCode=1;}
}
