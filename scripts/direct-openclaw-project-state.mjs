#!/usr/bin/env node
// Local MCP roundtrip for project handoff state. Save accepts bounded JSON on stdin only.
import {fileURLToPath} from 'node:url';
import {loadClientSdk} from '../integrations/chatgpt-openclaw/sdk.mjs';
const [mode,project]=process.argv.slice(2);let client,transport;
try{
 if(process.argv.length!==4||!['save','resume'].includes(mode)||!['openclaw-workflow','alice-ai'].includes(project))
  throw Error('Use save|resume openclaw-workflow|alice-ai; save reads JSON from stdin.');
 let input={};
 if(mode==='save'){
  let body='';for await(const chunk of process.stdin){body+=chunk;if(Buffer.byteLength(body)>16384)throw Error('Bounded handoff required.');}
  input=JSON.parse(body);if(!input||typeof input!=='object'||Array.isArray(input)||Object.hasOwn(input,'project_key'))throw Error('Invalid handoff.');
 }
 const sdk=await loadClientSdk();client=new sdk.Client({name:'ioant-project-state',version:'0.2.0'});
 transport=new sdk.StdioClientTransport({command:process.execPath,args:[
  fileURLToPath(new URL('../integrations/chatgpt-openclaw/server.mjs',import.meta.url)),
  '--shared-projects','openclaw-workflow,alice-ai'],stderr:'pipe'});
 transport.stderr?.on('data',()=>{});await client.connect(transport);
 const r=await client.callTool({name:mode==='save'?'openclaw_project_handoff':'openclaw_project_resume',
  arguments:{project_key:project,...input}},undefined,{timeout:15000});
 console.log(r.content[0].text);if(r.isError)process.exitCode=1;
}catch{
 console.log(JSON.stringify({state:'inconclusive',reason:'local_project_state_request_failed'}));process.exitCode=1;
}finally{await client?.close().catch(()=>{});await transport?.close().catch(()=>{});}
