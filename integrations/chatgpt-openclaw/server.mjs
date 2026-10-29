#!/usr/bin/env node
// Private stdio MCP adapter. No HTTP listener or exposure of Gateway secrets.
import {inspectDirectAgent,messageDirectAgent} from './agent.mjs';
import {loadSdk} from './sdk.mjs';

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
}];

export async function callTool(name,args,{status=inspectDirectAgent,message=messageDirectAgent}={}){
 let result;
 if(name==='openclaw_agent_status'&&args&&Object.keys(args).length===0)result=await status();
 else if(name==='openclaw_agent_message')result=await message(args);
 else result={state:'blocked',reason:'unsupported_tool_or_arguments'};
 return {content:[{type:'text',text:JSON.stringify(result)}],
  isError:['blocked','inconclusive'].includes(result.state)};
}

export async function serve(){
 const {Server,StdioServerTransport,ListToolsRequestSchema,CallToolRequestSchema}=await loadSdk();
 const server=new Server({name:'ioant-openclaw-direct',version:'0.1.0'},
  {capabilities:{tools:{}}});
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools}));
 server.setRequestHandler(CallToolRequestSchema,async request=>{
  try{return await callTool(request.params.name,request.params.arguments??{});}
  catch{return {isError:true,content:[{type:'text',text:'{"state":"inconclusive","reason":"adapter_failure"}'}]};}
 });
 await server.connect(new StdioServerTransport());
 process.stdin.on('end',()=>server.close());
 return server;
}

import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==2){process.stderr.write('No server arguments supported.\n');process.exitCode=1;}
 else await serve().catch(()=>{process.stderr.write('OpenClaw MCP adapter could not start.\n');process.exitCode=1;});
}
