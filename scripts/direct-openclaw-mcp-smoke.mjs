#!/usr/bin/env node
// Explicit local protocol acceptance; no ChatGPT account/API calls.
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadClientSdk} from '../integrations/chatgpt-openclaw/sdk.mjs';

const mode=process.argv[2];
if(process.argv.length!==3||!['--status','--message-test'].includes(mode)){
 process.stderr.write('Use --status or --message-test.\n');process.exitCode=1;
}else{
 let client,transport;
 try{
  const sdk=await loadClientSdk();
  client=new sdk.Client({name:'ioant-local-acceptance',version:'0.1.0'});
  transport=new sdk.StdioClientTransport({command:process.execPath,
   args:[fileURLToPath(new URL('../integrations/chatgpt-openclaw/server.mjs',import.meta.url))],
   stderr:'pipe'});
  transport.stderr?.on('data',()=>{});
  await client.connect(transport);
  const catalog=await client.listTools();
  if(catalog.tools.map(x=>x.name).join(',')!=='openclaw_agent_status,openclaw_agent_message')
   throw Error('unexpected_catalog');
  const result=await client.callTool(mode==='--status'?{
   name:'openclaw_agent_status',arguments:{}}:{name:'openclaw_agent_message',arguments:{
    conversation_key:'mcp_probe_'+randomUUID(),
    message:'Reply with exactly DIRECT_MCP_READY. Do not use any tools.'}},undefined,{timeout:160000});
  const data=JSON.parse(result.content[0].text);
  const passed=mode==='--status'?data.state==='ready':
   data.state==='answered'&&data.text==='DIRECT_MCP_READY'&&data.provider==='ollama';
  console.log(JSON.stringify({audit:'IOANT_DIRECT_MCP_ACCEPTANCE',schemaVersion:1,
   state:passed?'passed':'inconclusive',mcpInitializationVerified:true,
   toolDiscoveryVerified:true,localAgentResponseVerified:mode==='--message-test'&&passed,
   modelInferenceInvoked:mode==='--message-test',chatgptConnectionVerified:false,
   workerUsed:false,computerControlTested:false}));
  if(!passed)process.exitCode=1;
 }catch{
  console.log(JSON.stringify({audit:'IOANT_DIRECT_MCP_ACCEPTANCE',schemaVersion:1,
   state:'inconclusive',reason:'local_mcp_acceptance_failed',chatgptConnectionVerified:false}));
  process.exitCode=1;
 }finally{await client?.close().catch(()=>{});await transport?.close().catch(()=>{});}
}
