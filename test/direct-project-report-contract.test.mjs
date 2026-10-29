import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {reportOutputSchema,reportToolResult} from '../integrations/chatgpt-openclaw/project-report-contract.mjs';
import {executionTools} from '../integrations/chatgpt-openclaw/project-execution.mjs';
import {loadSdk,loadClientSdk} from '../integrations/chatgpt-openclaw/sdk.mjs';
const require=createRequire(join(homedir(),'.openclaw/tools/node-v24.22.1/lib/node_modules/openclaw/package.json'));
const Ajv=require('ajv');
const validate=new Ajv({strict:false}).compile(reportOutputSchema);
const page=(length=64)=>({state:'report',project:'alice-ai',operationId:'contract_probe_0001',artifact:'execution_log',
 sha256:'a'.repeat(64),offset:0,nextOffset:null,logText:'x'.repeat(length),pageCharacters:length,
 totalCharacters:length,contentIsUntrusted:true,truncated:false});

test('report output schema rejects empty objects, absent log text, old business content and oversized pages',()=>{
 assert.equal(validate(page()),true);assert.equal(validate(page(4000)),true);
 const missing=page();delete missing.logText;
 const old=page();old.content=old.logText;delete old.logText;
 for(const value of [{},missing,old,page(4001),{state:'unknown'}])assert.equal(validate(value),false);
});
test('explicit report states remain schema-valid for pending, absent and failed reads',()=>{
 for(const result of [{state:'pending',operationId:'contract_probe_0001',doNotRepeat:true},
  {state:'not_found',operationId:'contract_probe_0001'},
  {state:'unavailable',operationId:'contract_probe_0001',reason:'no_execution_log'},
  {state:'blocked',reason:'execution_report_changed'}]){
  assert.equal(validate(result),true);
  const envelope=reportToolResult(result);assert.deepEqual(envelope.structuredContent,result);
  assert.equal(envelope.isError,result.state==='blocked');
 }
});
test('business logText lives in structuredContent and exactly matches the MCP JSON text channel',()=>{
 const result=page(4000),envelope=reportToolResult(result);
 assert.equal(Array.isArray(envelope.content),true);assert.equal(envelope.content[0].type,'text');
 assert.deepEqual(JSON.parse(envelope.content[0].text),envelope.structuredContent);
 assert.equal(envelope.structuredContent.logText.length,4000);
 assert.equal(Object.hasOwn(envelope.structuredContent,'content'),false);
 assert.deepEqual(executionTools.find(t=>t.name==='openclaw_project_report').outputSchema,reportOutputSchema);
});
async function sdkPair(t,reply){
 const {Server,ListToolsRequestSchema,CallToolRequestSchema}=await loadSdk();
 const {Client}=await loadClientSdk();const {InMemoryTransport}=require('@modelcontextprotocol/sdk/inMemory.js');
 const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
 const server=new Server({name:'report-contract-test',version:'1'},{capabilities:{tools:{}}});
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[executionTools.find(t=>t.name==='openclaw_project_report')]}));
 server.setRequestHandler(CallToolRequestSchema,async()=>reply());
 const client=new Client({name:'report-contract-client',version:'1'});
 t.after(async()=>{await client.close();await server.close();});
 await server.connect(serverTransport);await client.connect(clientTransport);await client.listTools();return client;
}
test('real MCP SDK retains and validates the report body at 64 and 4000 characters',async t=>{
 let length=64;const client=await sdkPair(t,()=>reportToolResult(page(length)));
 for(length of [64,4000]){
  const r=await client.callTool({name:'openclaw_project_report',arguments:{operation_id:'contract_probe_0001',offset:0}});
  assert.equal(r.structuredContent.logText.length,length);
  assert.deepEqual(JSON.parse(r.content[0].text),r.structuredContent);
 }
});
test('real MCP SDK refuses text-only or empty structured output under the declared report contract',async t=>{
 let response={content:[{type:'text',text:JSON.stringify(page())}]};
 const client=await sdkPair(t,()=>response);
 await assert.rejects(client.callTool({name:'openclaw_project_report',arguments:{operation_id:'contract_probe_0001'}}),/did not return structured content/);
 response={content:[{type:'text',text:'{}'}],structuredContent:{}};
 await assert.rejects(client.callTool({name:'openclaw_project_report',arguments:{operation_id:'contract_probe_0001'}}),/output schema/);
});
