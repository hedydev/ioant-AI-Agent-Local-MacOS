// Metadata-only loopback query; never a generate/chat/preload/unload request.
export async function modelResidency({fetchImpl=fetch}={}){
 try{
  const r=await fetchImpl('http://127.0.0.1:11435/api/ps',{signal:AbortSignal.timeout(2000),redirect:'error'});
  if(!r.ok)throw Error();const text=await r.text();if(text.length>32768)throw Error();
  const x=JSON.parse(text);if(!Array.isArray(x.models)||x.models.length>32)throw Error();
  return {state:'observed',modelInferenceInvoked:false,models:x.models.map(m=>({
   name:typeof m.name==='string'&&/^[a-zA-Z0-9_.:/-]{1,100}$/.test(m.name)?m.name:'unverified',
   residentBytes:Number.isSafeInteger(m.size)&&m.size>=0?m.size:null,
   contextLength:Number.isSafeInteger(m.context_length)?m.context_length:null,
   expiresAt:typeof m.expires_at==='string'&&Number.isFinite(Date.parse(m.expires_at))?new Date(m.expires_at).toISOString():null})),
   scope:'Ollama loaded-model snapshot, not active request attribution or proof of memory leak. No residency settings changed.'};
 }catch{return {state:'unavailable',modelInferenceInvoked:false,models:[]};}
}
