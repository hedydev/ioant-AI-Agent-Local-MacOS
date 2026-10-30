import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {activityReport} from './activity.mjs';
import {boundedFetch} from './health.mjs';

const ASSETS={
 '/':'index.html','/app.js':'app.js','/api-client.js':'api-client.js','/i18n.js':'i18n.js',
 '/render.js':'render.js','/styles.css':'styles.css','/tokens.css':'tokens.css'
};
const TYPES={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8'};
async function jsonBody(req){let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>4096)throw Error('request_too_large');}try{const data=text?JSON.parse(text):{};if(!data||typeof data!=='object'||Array.isArray(data))throw Error();return data;}catch{throw Error('invalid_json');}}
function equal(a,b){return typeof a==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
export function createConsoleServer(service,{port=18489,token=randomBytes(32).toString('hex'),report=activityReport}={}){
 let origin='http://127.0.0.1:'+port;
 const server=createServer(async(req,res)=>{
  const common={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',
   'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"};
  const reply=(code,data,headers={})=>{res.writeHead(code,{...common,'content-type':'application/json; charset=utf-8',...headers});res.end(typeof data==='string'?data:JSON.stringify(data));};
  try{
   origin='http://127.0.0.1:'+(server.address()?.port??port);
   if(req.headers.host!==new URL(origin).host)return reply(403,{state:'blocked',reason:'loopback_host_required'});
   const url=new URL(req.url,origin),path=url.pathname;
   if(req.method==='GET'&&Object.hasOwn(ASSETS,path)){
    let body=await readFile(fileURLToPath(new URL('./web/'+ASSETS[path],import.meta.url)),'utf8');
    if(path==='/')body=body.replace('{{CONSOLE_TOKEN}}',token);
    return reply(200,body,{'content-type':TYPES[ASSETS[path].split('.').at(-1)]});
   }
   if(!path.startsWith('/api/'))return reply(404,{state:'not_found'});
   if(!equal(req.headers['x-console-token'],token)||req.headers.origin&&req.headers.origin!==origin)return reply(403,{state:'blocked',reason:'local_session_required'});
   if(req.method!=='GET'&&req.headers.origin!==origin)return reply(403,{state:'blocked',reason:'same_origin_required'});
   if(req.method==='GET'&&path==='/api/snapshot')return reply(200,service.snapshot??await service.refresh());
   if(req.method==='GET'&&path==='/api/events'){
    res.writeHead(200,{...common,'content-type':'text/event-stream','connection':'keep-alive','x-accel-buffering':'no'});
    const send=s=>{if(!res.destroyed){if(res.writableLength>2*1024*1024){res.end();return;}res.write('data: '+JSON.stringify(s)+'\n\n');}};
    send(service.snapshot);service.listeners.add(send);const keep=setInterval(()=>res.write(': heartbeat\n\n'),15000);
    req.on('close',()=>{clearInterval(keep);service.listeners.delete(send);});return;
   }
   if(req.method==='GET'&&path==='/api/report'){
    if([...url.searchParams.keys()].some(k=>!['project','operationId','artifact','offset'].includes(k)))throw Error('invalid_report_request');
    return reply(200,await report({project:url.searchParams.get('project'),operationId:url.searchParams.get('operationId'),artifact:url.searchParams.get('artifact')??'execution_log',offset:Number(url.searchParams.get('offset')??0)}));
   }
   if(req.method==='GET'&&path==='/api/export'){
    await service.diagnostics.flush();
    return reply(200,{schemaVersion:1,exportedAt:new Date().toISOString(),snapshot:service.snapshot,events:service.diagnostics.rows},
     {'content-disposition':'attachment; filename="openclaw-console-diagnostics.json"'});
   }
   if(req.method==='POST'&&path.startsWith('/api/control/')){
    if(req.headers['content-type']?.split(';')[0]!=='application/json')throw Error('json_required');
    const body=await jsonBody(req);let result;await service.refresh();
    if(path==='/api/control/start'){
     if(Object.keys(body).some(k=>k!=='runtimeKey'))throw Error('invalid_start_input');
     result=await service.controller.start(body.runtimeKey,service.snapshot?.tunnel??{});
    }else if(path==='/api/control/restart'){
     if(Object.keys(body).some(k=>k!=='runtimeKey'))throw Error('invalid_start_input');
     result=await service.controller.restart(body.runtimeKey,service.snapshot?.tunnel??{});
    }else if(path==='/api/control/stop'){
     if(Object.keys(body).length)throw Error('invalid_stop_input');
     result=await service.controller.stop(service.snapshot?.tunnel??{});
    }else if(path==='/api/control/forget-key'){service.controller.forgetKey();result={state:'forgotten'};}
    else return reply(404,{state:'not_found'});
    await service.refresh();return reply(200,result);
   }
   if(req.method==='POST'&&path==='/api/log-level'){
    const body=await jsonBody(req);if(!['info','warn'].includes(body.level)||Object.keys(body).length!==1)throw Error('invalid_log_level');
    const url=service.snapshot?.tunnel?.url;if(!url)throw Error('tunnel_not_running');
    const r=await boundedFetch(url+'/api/log-level',{method:'PUT',body:{level:body.level}});if(!r.ok)throw Error('log_level_update_failed');
    service.diagnostics.record('log_level_changed',{state:body.level,source:'console'});return reply(200,{state:'updated',level:body.level});
   }
   if(req.method==='POST'&&path==='/api/frontend-error'){
    const body=await jsonBody(req);service.diagnostics.record('frontend_error',{source:'frontend',level:'error',message:typeof body.message==='string'?body.message:'frontend_failure'});return reply(200,{state:'recorded'});
   }
   return reply(404,{state:'not_found'});
  }catch(e){
   const reason=/^[a-z_]{1,80}$/.test(e.message)?e.message:'console_operation_failed';
   service.diagnostics.record('console_request_failed',{level:'warn',reason,source:'console'});return reply(reason==='request_too_large'?413:400,{state:'blocked',reason});
  }
 });
 server.requestTimeout=10000;server.headersTimeout=10000;
 return {server,get origin(){return 'http://127.0.0.1:'+(server.address()?.port??port);},token};
}
