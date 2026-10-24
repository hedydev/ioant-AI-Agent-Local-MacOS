#!/usr/bin/env node
// Read-only structural Gateway config.get diagnostic. No user-controlled args,
// raw config, hash bytes, tokens, names or paths in the report.
import {resolve} from 'node:path';
import {execNative,rpcEnvelope,validSnapshot} from './openclaw-ollama-provision.mjs';

function shape(value){
  return value&&typeof value==='object'&&!Array.isArray(value)?'object':
    Array.isArray(value)?'array':value===null?'null':value===undefined?'absent':'primitive';
}
function has(obj,key){
 return obj&&typeof obj==='object'&&!Array.isArray(obj)&&Object.hasOwn(obj,key);
}
export function classifySnapshot(response){
  // An explicit payload wrapper must contain a structured payload.
  // Otherwise it is an RPC envelope error, never a config snapshot.
  if(has(response,'payload')&&shape(response.payload)!=='object')
    return {audit:'IOANT_OPENCLAW_RPC_SHAPE',schemaVersion:1,readOnly:true,status:'invalid_envelope'};
  const doc=rpcEnvelope(response);
  if(shape(doc)!=='object')return {
    audit:'IOANT_OPENCLAW_RPC_SHAPE',schemaVersion:1,readOnly:true,status:'invalid_envelope'
  };
  const hash=doc.hash;
  const hashKind=typeof hash!=='string'?'missing_or_non_string':
    hash.length===0?'empty':
    /^[a-f0-9]{32,128}$/i.test(hash)?'hex_compatible':
    hash.length<=256&&!/[\x00-\x1F\x7F]/.test(hash)?'opaque_non_hex':'unsupported';
  const keys=['config','parsed','resolved','sourceConfig'];
  const sources=Object.fromEntries(keys.map(k=>[k,shape(doc[k])]));
  const candidates=keys.map(k=>doc[k]).filter(x=>shape(x)==='object');
  const providerStates=candidates.map(x=>
   !has(x,'models')||!has(x.models,'providers')||!has(x.models.providers,'ollama')?'absent':'present');
  const provider=providerStates.includes('present')?'present':
    providerStates.length?'absent':'unresolved';
  const result={
   audit:'IOANT_OPENCLAW_RPC_SHAPE',
   schemaVersion:1,
   readOnly:true,
   status:'observed',
   hashKind,
   hashLengthBand:typeof hash==='string'?(hash.length<=32?'le_32':hash.length<=64?'le_64':hash.length<=128?'le_128':'gt_128'):'none',
   sources,
   validFlag:doc.valid===true?'true':doc.valid===false?'false':'unspecified',
   existsFlag:doc.exists===true?'true':doc.exists===false?'false':'unspecified',
   provider,
   previousGuard:validSnapshot(response)?'accepted':'rejected',
   wrapped:response!==doc
  };
  return result;
}
export async function inspectConfigRpc({call=execNative}={}){
 try {
  return classifySnapshot(await call('config.get',{}));
 }catch{
  return {audit:'IOANT_OPENCLAW_RPC_SHAPE',schemaVersion:1,readOnly:true,status:'rpc_unavailable'};
 }
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 inspectConfigRpc().then(r=>process.stdout.write(JSON.stringify(r)+'\n')).catch(()=>
  process.stdout.write(JSON.stringify({audit:'IOANT_OPENCLAW_RPC_SHAPE',schemaVersion:1,readOnly:true,status:'unavailable'})+'\n'));
}
