#!/usr/bin/env node
// Fresh local MCP client: actions|execute|result|report PROJECT [ID] [OFFSET].
// execute reads the exact bounded structured input from stdin; never shell text.
import {fileURLToPath} from 'node:url';
import {loadClientSdk} from '../integrations/chatgpt-openclaw/sdk.mjs';
const [mode,project,id,offset]=process.argv.slice(2);let client,transport;
try{
 if(!['actions','execute','result','report'].includes(mode)||!['openclaw-workflow','alice-ai'].includes(project)||
  process.argv.length>(mode==='report'?6:['actions','execute'].includes(mode)?4:5))throw Error('invalid_mode');
 let input={};
 if(mode==='execute'){
  let body='';for await(const c of process.stdin){body+=c;if(Buffer.byteLength(body)>4096)throw Error('input_too_large');}
  input=JSON.parse(body);if(!input||typeof input!=='object'||Array.isArray(input)||Object.hasOwn(input,'project_key'))throw Error('invalid_input');
 }else if(mode==='result'||mode==='report')input={operation_id:id,...(offset!==undefined?{offset:Number(offset)}:{})};
 const sdk=await loadClientSdk();client=new sdk.Client({name:'ioant-project-execution',version:'0.3.0'});
 transport=new sdk.StdioClientTransport({command:process.execPath,args:[
  fileURLToPath(new URL('../integrations/chatgpt-openclaw/server.mjs',import.meta.url)),
  '--shared-projects','openclaw-workflow,alice-ai'],stderr:'pipe'});
 transport.stderr?.on('data',()=>{});await client.connect(transport);
 const r=await client.callTool({name:'openclaw_project_'+mode,arguments:{project_key:project,...input}},undefined,{timeout:15000});
 console.log(r.content[0].text);if(r.isError)process.exitCode=1;
}catch{console.log(JSON.stringify({state:'inconclusive',reason:'project_execution_client_failed'}));process.exitCode=1;}
finally{await client?.close().catch(()=>{});await transport?.close().catch(()=>{});}
