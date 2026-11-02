#!/usr/bin/env node
// Direct SDK protocol acceptance, no browser focus, key recovery or game actions.
import {loadClientSdk} from '../integrations/chatgpt-openclaw/sdk.mjs';
import {executionEnvironment} from '../integrations/chatgpt-openclaw/project-execution-command.mjs';
import {fileURLToPath} from 'node:url';
const id=process.argv[2];
if(process.argv.length!==3||!/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(id??''))throw Error('operation_id_required');
const {Client,StdioClientTransport}=await loadClientSdk();
const client=new Client({name:'alice-recovery-readonly-acceptance',version:'1.0.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../integrations/chatgpt-openclaw/server.mjs',import.meta.url)),'--shared-projects','registered'],env:executionEnvironment(),stderr:'ignore'});
try{
 await client.connect(transport);
 const catalog=await client.listTools();
 if(!catalog.tools.some(t=>t.name==='openclaw_project_reconcile'))throw Error('reconciliation_tool_missing');
 const raw=await client.callTool({name:'openclaw_project_reconcile',arguments:{project_key:'alice-ai',operation_id:id,mode:'inspect'}});
 const r=JSON.parse(raw.content.find(c=>c.type==='text').text);
 if(r.state!=='resolved'||!r.cached||!r.lockReleased||r.clientActionInvoked!==false)throw Error('resolved_audit_not_verified');
 console.log(JSON.stringify({server:client.getServerVersion(),toolCount:catalog.tools.length,reconciliationToolVisible:true,state:r.state,cached:r.cached,decision:r.decision,clientActionInvoked:r.clientActionInvoked,evidenceScope:'historical_operation_at_reconciliation'}));
}finally{await client.close();}
