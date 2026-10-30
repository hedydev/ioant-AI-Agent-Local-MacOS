import {StringDecoder} from 'node:string_decoder';

// Keep chunk boundaries, overlong lines and multi-line private-key blocks private.
export function outputCollector(emit){
 const decoder=new StringDecoder('utf8');let buffer='',dropping=false,inKey=false;
 const finishLine=()=>{
  if(dropping){emit('[overlong output line omitted]');dropping=false;buffer='';return;}
  const text=buffer;buffer='';
  if(inKey){if(/-----END [^-\r\n]*PRIVATE KEY-----/.test(text))inKey=false;return;}
  if(/-----BEGIN [^-\r\n]*PRIVATE KEY-----/.test(text)){inKey=!/-----END [^-\r\n]*PRIVATE KEY-----/.test(text);emit('[REDACTED PRIVATE KEY]');return;}
  emit(text);
 };
 const consume=text=>{for(const piece of text.split(/(?<=\n)/)){if(!dropping)buffer+=piece;if(buffer.length>8192){dropping=true;buffer='';}if(piece.endsWith('\n'))finishLine();}};
 return {write:chunk=>consume(decoder.write(chunk)),end:()=>{consume(decoder.end());if(buffer||dropping)finishLine();}};
}
