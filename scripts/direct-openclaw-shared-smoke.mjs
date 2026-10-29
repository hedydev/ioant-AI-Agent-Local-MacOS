#!/usr/bin/env node
// New stdio client/process per invocation; no model, desktop, web account or runtime key.
import {fileURLToPath} from 'node:url';
import {loadClientSdk} from '../integrations/chatgpt-openclaw/sdk.mjs';
const allowed=['--status','--resume'];
const mode=process.argv[2],key=process.argv[3]??'openclaw-workflow';
let client,transport;
try{
 if(process.argv.length>4||!allowed.includes(mode)||!['openclaw-workflow','alice-ai'].includes(key))throw Error('invalid_mode');
 const sdk=await loadClientSdk();client=new sdk.Client({name:'ioant-shared-acceptance',version:'0.2.0'});
 transport=new sdk.StdioClientTransport({command:process.execPath,args:[
  fileURLToPath(new URL('../integrations/chatgpt-openclaw/server.mjs',import.meta.url)),
  '--shared-projects','openclaw-workflow,alice-ai'],stderr:'pipe'});
 transport.stderr?.on('data',()=>{});await client.connect(transport);
 const catalog=await client.listTools();
 if(catalog.tools.length!==7)throw Error('catalog_mismatch');
 const read=async(name,args)=>{
  const r=await client.callTool({name,arguments:args});if(r.isError)throw Error('tool_failed');
  return JSON.parse(r.content[0].text);
 };
 const projects=await read('openclaw_projects',{});
 if(projects.projects.map(x=>x.project_key).join(',')!=='openclaw-workflow,alice-ai')throw Error('project_mismatch');
 const status=await read('openclaw_agent_status',{project_key:key});
 if(status.state!=='ready'||status.project!==key)throw Error('project_not_ready');
 const result=mode==='--resume'?await read('openclaw_project_resume',{project_key:key}):undefined;
 console.log(JSON.stringify({state:'passed',project:key,agent:status.agent,tools:catalog.tools.map(t=>t.name),
  modelInferenceInvoked:false,desktopActionsInvoked:false,chatgptConnectionVerified:false,
  ...(result?{handoffState:result.state,revision:result.revision,referencedOperations:result.operations??[]}: {})}));
}catch{
 console.log(JSON.stringify({state:'inconclusive',reason:'shared_mcp_acceptance_failed',chatgptConnectionVerified:false}));process.exitCode=1;
}finally{await client?.close().catch(()=>{});await transport?.close().catch(()=>{});}
