// Metadata only. Arguments, model text, reports and credentials never enter this log.
import {randomUUID} from 'node:crypto';
import {Diagnostics} from '../../console/diagnostics.mjs';
import {AUDIT_ROOT} from '../../console/config.mjs';

let logPromise;
function logger(){
 if(process.env.NODE_TEST_CONTEXT)return null;
 if(!logPromise)logPromise=new Diagnostics(AUDIT_ROOT,{kind:'mcp'}).init().catch(()=>{process.stderr.write('MCP metadata audit unavailable.\n');return null;});
 return logPromise;
}
export async function observeMcpCall(name,args,invoke,{log=logger}={}){
 const audit=typeof log==='function'?await log():log;
 const start=performance.now(),requestId=randomUUID();
 const fields={source:'mcp',requestId,tool:name,project:args.project_key,operationId:args.operation_id};
 audit?.record('mcp_call_started',fields);
 try{
  const reply=await invoke();let result;
  try{const text=reply?.content?.find(x=>x.type==='text')?.text;if(typeof text==='string'&&text.length<1048576)result=JSON.parse(text);}catch{}
  audit?.record('mcp_call_finished',{...fields,durationMs:Math.round(performance.now()-start),state:result?.state??(reply?.isError?'error':'returned'),reason:result?.reason,level:reply?.isError?'warn':'info'});
  await audit?.flush();return reply;
 }catch(error){audit?.record('mcp_call_finished',{...fields,durationMs:Math.round(performance.now()-start),state:'error',reason:'tool_exception',level:'error'});await audit?.flush();throw error;}
}
export async function closeMcpAudit(){const log=await logPromise;await log?.close();}
