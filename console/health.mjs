import {privateRead} from './private-files.mjs';

export function healthUrl(value){
 const u=new URL(String(value).trim());
 if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!/^\d+$/.test(u.port)||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('loopback_health_required');
 return u.origin;
}
export async function boundedFetch(url,{fetchImpl=fetch,method='GET',body,limit=2*1024*1024}={}){
 const r=await fetchImpl(url,{method,body:body===undefined?undefined:JSON.stringify(body),
  headers:body===undefined?{}:{'content-type':'application/json'},redirect:'error',signal:AbortSignal.timeout(2500)});
 const chunks=[];let bytes=0;
 if(r.body)for await(const chunk of r.body){bytes+=chunk.length;if(bytes>limit)throw Error('health_response_too_large');chunks.push(chunk);}
 return {ok:r.ok,status:r.status,text:Buffer.concat(chunks).toString('utf8')};
}
export function metricValue(text,name){
 let value=0,found=false;
 for(const line of String(text).split('\n')){
  if(!line.startsWith(name+' ')&&!line.startsWith(name+'{'))continue;
  const n=Number(line.trim().split(/\s+/).at(-1));if(Number.isFinite(n)){found=true;value+=n;}
 }
 return found?value:null;
}
export function classifyHealth({ready,lastPollAt,now=Date.now()}){
 if(!ready)return 'degraded';
 if(!lastPollAt)return 'starting';
 return now-lastPollAt*1000<=90000?'ready':'stale';
}
export async function inspectHealth(url,{request=boundedFetch}={}){
 url=healthUrl(url);
 const paths=['/readyz','/metrics','/api/status','/api/logs?limit=200'];
 const rows=await Promise.allSettled(paths.map(p=>request(url+p)));
 if(rows.every(x=>x.status==='rejected'))throw Error('tunnel_unreachable');
 const val=i=>rows[i].status==='fulfilled'?rows[i].value:null;
 const ready=val(0)?.ok===true&&val(0).text.trim()==='ready';
 const metrics=val(1)?.ok?val(1).text:'';
 let info={},events=[];
 try{if(val(2)?.ok)info=JSON.parse(val(2).text);}catch{}
 try{if(val(3)?.ok)events=JSON.parse(val(3).text).events??[];}catch{}
 const lastPollAt=metricValue(metrics,'commands_poll_last_successful_timestamp_seconds');
 return {url,state:classifyHealth({ready,lastPollAt}),ready,lastPollAt,
  lastPollAgeSeconds:lastPollAt?Math.max(0,Math.round(Date.now()/1000-lastPollAt)):null,
  startedAt:info.started_at??null,uptimeSeconds:Number.isFinite(info.uptime_seconds)?info.uptime_seconds:null,
  version:typeof info.version==='string'?info.version.slice(0,80):null,
  tunnelId:typeof info.control_plane_tunnel_id==='string'&&/^tunnel_[a-zA-Z0-9_-]+$/.test(info.control_plane_tunnel_id)?info.control_plane_tunnel_id:null,
  rawHttpLoggingEnabled:info.raw_http_logging_enabled===true,
  channels:Array.isArray(info.channels)?info.channels.map(c=>({name:String(c.name??'').slice(0,40),enabled:c.enabled===true,transport:c.transport_kind,probeStatus:c.probe_status})):[],
  metrics:{polled:metricValue(metrics,'commands_polled_total'),pollErrors:metricValue(metrics,'commands_poll_errors_total'),queue:metricValue(metrics,'commands_queue_length'),queueCapacity:metricValue(metrics,'commands_queue_capacity')},
  vendorEvents:Array.isArray(events)?events.slice(-200):[],instanceId:String(info.client_instance_id??'').slice(0,100)};
}
export async function discoverHealth(files,{inspect=inspectHealth}={}){
 for(const file of files){try{const url=healthUrl(await privateRead(file,512));const h=await inspect(url);return {...h,healthFile:file};}catch{}}
 return {state:'stopped',ready:false,url:null,lastPollAgeSeconds:null,metrics:{},channels:[],vendorEvents:[],instanceId:null};
}
