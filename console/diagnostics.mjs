// One bounded, redacted facade for console lifecycle, vendor output and MCP metadata.
import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {appendFile,lstat,readdir,unlink,rename,rmdir} from 'node:fs/promises';
import {privateDirectory,privateRead,privateWrite} from './private-files.mjs';
import {redactExecutionOutput} from '../integrations/chatgpt-openclaw/project-execution-command.mjs';

const LIMIT=512*1024,PARTS=4,KEEP=20;
const safeId=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,100}$/.test(x)?x:undefined;
export function cleanText(value){return redactExecutionOutput(String(value??'')).slice(0,1800);}
export function safeEvent(event,fields={},sessionId='unknown'){
 const out={id:randomUUID(),ts:new Date().toISOString(),sessionId,event:/^[a-z_]{1,60}$/.test(event)?event:'diagnostic_error',level:['info','warn','error'].includes(fields.level)?fields.level:'info'};
 for(const k of ['source','project','operationId','tool','requestId','state','reason','channel','artifact']){const v=safeId(fields[k]);if(v!==undefined)out[k]=v;}
 for(const k of ['pid','durationMs','exitCode','count','statusCode'])if(Number.isFinite(fields[k]))out[k]=fields[k];
 if(typeof fields.message==='string')out.message=cleanText(fields.message);
 return out;
}
export class Diagnostics extends EventEmitter{
 constructor(root,{kind='console'}={}){super();this.root=root;this.kind=kind;this.id=randomUUID();this.dir=join(root,'session-'+this.id);this.queue=Promise.resolve();this.rows=[];this.part=0;this.bytes=0;this.dropped=0;this.failed=false;}
 async init(){
  await privateDirectory(this.root,{create:true});await privateDirectory(this.dir,{create:true});
  await privateWrite(join(this.dir,'session.json'),{schemaVersion:1,sessionId:this.id,application:'openclaw-tunnel-console',kind:this.kind,startedAt:new Date().toISOString(),pid:process.pid});
  // Only closed private sessions are eligible; active sessions are never removed.
  const closed=[];for(const n of await readdir(this.root)){if(!/^session-[a-f0-9-]{36}$/.test(n)||n==='session-'+this.id)continue;
   try{const d=join(this.root,n);await privateDirectory(d);const s=await lstat(join(d,'closed.json'));if(s.isFile()&&!s.isSymbolicLink())closed.push({d,time:s.mtimeMs});}catch{}}
  closed.sort((a,b)=>b.time-a.time);
  for(const {d} of closed.slice(KEEP)){for(const n of await readdir(d)){if(!/^(session|closed|events(?:\.[0-3])?)\.(json|jsonl)$/.test(n))continue;const p=join(d,n),s=await lstat(p);if(s.isFile()&&!s.isSymbolicLink()&&s.uid===process.getuid())await unlink(p);}await rmdir(d).catch(()=>{});}
  return this;
 }
 record(event,fields={}){
  const row=safeEvent(event,fields,this.id);this.rows.push(row);if(this.rows.length>1000)this.rows.shift();this.emit('event',row);
  this.queue=this.queue.then(async()=>{
   const line=JSON.stringify(row)+'\n',bytes=Buffer.byteLength(line);
   if(this.bytes+bytes>LIMIT){
    for(let i=PARTS-1;i>=1;i--){const target=join(this.dir,'events.'+i+'.jsonl'),source=join(this.dir,i===1?'events.jsonl':'events.'+(i-1)+'.jsonl');
     if(i===PARTS-1)await unlink(target).catch(e=>{if(e.code!=='ENOENT')throw e;});
     await rename(source,target).catch(e=>{if(e.code!=='ENOENT')throw e;});
    }this.part++;this.bytes=0;
   }
   const p=join(this.dir,'events.jsonl');
   await appendFile(p,line,{mode:0o600,flag:'a'});this.bytes+=bytes;
  }).catch(()=>{this.failed=true;});return row;
 }
 async flush(){await this.queue;}
 async close(){this.record('session_closed');await this.flush();await privateWrite(join(this.dir,'closed.json'),{closedAt:new Date().toISOString()});}
 summary(){return {sessionId:this.id,path:this.dir,dropped:this.dropped,writeFailed:this.failed};}
}
export function vendorEvent(row){
 return {level:String(row?.level).toLowerCase()==='error'?'error':String(row?.level).toLowerCase()==='warn'?'warn':'info',
  source:'tunnel',message:cleanText(row?.message??''),
  requestId:safeId(row?.attrs?.tunnel_request_id),channel:safeId(row?.attrs?.channel),
  durationMs:Number.isFinite(row?.attrs?.duration_ms)?row.attrs.duration_ms:undefined};
}
