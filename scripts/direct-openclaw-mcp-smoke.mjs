#!/usr/bin/env node
// Explicit local protocol acceptance; no ChatGPT account/API calls.
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadClientSdk} from '../integrations/chatgpt-openclaw/sdk.mjs';
import {projectBinding} from '../integrations/chatgpt-openclaw/project-binding.mjs';

const mode=process.argv[2];
const projectArgs=process.argv.slice(3);
if(!['--status','--message-test','--computer-read-test'].includes(mode)||
 (projectArgs.length!==0&&(projectArgs.length!==2||projectArgs[0]!=='--project'))){
 process.stderr.write('Use --status, --message-test or --computer-read-test, optionally --project <registered-project>.\n');process.exitCode=1;
}else{
 let client,transport;
 try{
  const sdk=await loadClientSdk();
  const binding=projectBinding(projectArgs[1]);
  client=new sdk.Client({name:'ioant-local-acceptance',version:'0.1.0'});
  transport=new sdk.StdioClientTransport({command:process.execPath,
   args:[fileURLToPath(new URL('../integrations/chatgpt-openclaw/server.mjs',import.meta.url)),
    '--project',binding.projectKey],
   stderr:'pipe'});
  transport.stderr?.on('data',()=>{});
  await client.connect(transport);
  const catalog=await client.listTools();
  if(catalog.tools.map(x=>x.name).join(',')!==
   'openclaw_agent_status,openclaw_agent_message,openclaw_computer_task,openclaw_computer_result')
   throw Error('unexpected_catalog');
  const operation='cursor_'+randomUUID();
  const request=mode==='--status'?{name:'openclaw_agent_status',arguments:{}}:
   mode==='--computer-read-test'?{name:'openclaw_computer_task',arguments:{
    operation_id:operation,conversation_key:'computer_probe_'+randomUUID(),
    message:'Use the computer tool once with action get_cursor_position. Do not take screenshots, list apps/windows, move the pointer, click, type, open apps, read files or change settings. Do not retry a refused action. Report the actual tool outcome.'}}:
   {name:'openclaw_agent_message',arguments:{
    conversation_key:'mcp_probe_'+randomUUID(),
    message:'Reply with exactly DIRECT_MCP_READY. Do not use any tools.'}};
  const result=await client.callTool(request,undefined,{timeout:160000});
  const data=JSON.parse(result.content[0].text);
  let passed=mode==='--status'?data.state==='ready':mode==='--computer-read-test'?
   data.state==='returned'&&data.computerToolSucceeded===true:
    data.state==='answered'&&data.text==='DIRECT_MCP_READY'&&data.provider==='ollama';
  if(mode==='--computer-read-test'&&passed){
   const saved=await client.callTool({name:'openclaw_computer_result',arguments:{operation_id:operation}});
   const record=JSON.parse(saved.content[0].text);
   passed=record.operationId===operation&&record.cached===true&&record.computerToolSucceeded===true;
  }
  console.log(JSON.stringify({audit:'IOANT_DIRECT_MCP_ACCEPTANCE',schemaVersion:1,
   state:passed?'passed':'inconclusive',project:binding.projectKey,mcpInitializationVerified:true,
   toolDiscoveryVerified:true,localAgentResponseVerified:mode!=='--status'&&passed,
   modelInferenceInvoked:mode!=='--status',chatgptConnectionVerified:false,
   workerUsed:false,computerControlTested:mode==='--computer-read-test',
   ...(mode==='--computer-read-test'?{operationId:operation}:{} )}));
  if(!passed)process.exitCode=1;
 }catch{
  console.log(JSON.stringify({audit:'IOANT_DIRECT_MCP_ACCEPTANCE',schemaVersion:1,
   state:'inconclusive',reason:'local_mcp_acceptance_failed',chatgptConnectionVerified:false}));
  process.exitCode=1;
 }finally{await client?.close().catch(()=>{});await transport?.close().catch(()=>{});}
}
