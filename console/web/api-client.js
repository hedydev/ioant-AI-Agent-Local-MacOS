const token=document.querySelector('meta[name="console-token"]').content;
export async function api(path,{method='GET',body}={}){
 let r;try{r=await fetch(path,{method,headers:{'x-console-token':token,...(body!==undefined?{'content-type':'application/json'}:{})},body:body!==undefined?JSON.stringify(body):undefined,cache:'no-store'});}catch{throw Object.assign(Error('network_error'),{code:'network_error'});}
 const data=await r.json();if(!r.ok)throw Object.assign(Error(data.reason??'request_failed'),{code:data.reason??'request_failed'});return data;
}
export function subscribe(onSnapshot,onConnection){
 const controller=new AbortController();let attempt=0;
 const run=async()=>{
  while(!controller.signal.aborted){
   try{const r=await fetch('/api/events',{headers:{'x-console-token':token},signal:controller.signal,cache:'no-store'});if(!r.ok||!r.body)throw Error('event_stream_failed');
    onConnection(true);attempt=0;const reader=r.body.getReader(),decoder=new TextDecoder();let buffer='';
    while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});if(buffer.length>4*1024*1024)throw Error('event_frame_too_large');
     let index;while((index=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,index);buffer=buffer.slice(index+2);if(frame.startsWith('data: ')){const data=JSON.parse(frame.slice(6));if(data)onSnapshot(data);}}
    }
   }catch{if(controller.signal.aborted)return;}
   onConnection(false);const delay=Math.min(15000,1000*2**attempt++);await new Promise(resolve=>{const timer=setTimeout(resolve,delay);controller.signal.addEventListener('abort',()=>{clearTimeout(timer);resolve();},{once:true});});
  }
 };run();return ()=>controller.abort();
}
