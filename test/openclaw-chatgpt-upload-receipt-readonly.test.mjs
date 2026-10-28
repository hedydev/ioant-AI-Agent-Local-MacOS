import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReceiptProbe,summarizeReceipt,inspectReceipt}
 from '../scripts/openclaw-chatgpt-upload-receipt-readonly.mjs';

const prefix='IOANT_RECEIPT_DIAG:';
const sample={exact:true,main:true,counts:[1,0,0,1],markerRole:true,
 sameRole:false,parent:true,markerMain:true,filenameMain:true,filenameAttr:false};

test('exact page structural-only browser function compiles',()=>{
 const code=buildReceiptProbe();
 assert.equal(typeof new Function('return ('+code+')')(),'function');
 assert.match(code,/IOANT-UPLOAD-FIXTURE-20261028-196/);
 assert.match(code,/IOANT-ChatGPT-Upload-Fixture-20261028.txt/);
});
test('bounded proof parser accepts separate attachment and text ancestors',()=>{
 const result=summarizeReceipt({result:{content:[{text:prefix+JSON.stringify(sample)}]}});
 assert.equal(result.state,'observed');
 assert.equal(result.markerRole,true);
 assert.equal(result.sameRole,false);
 assert.equal(result.parent,true);
 assert.deepEqual(result.roleCounts,[1,0,0,1]);
 assert.equal(result.userTextReturned,false);
});
test('transport JSON wrapper is parsed, but raw content not returned',()=>{
 const result=summarizeReceipt(JSON.stringify({result:{text:prefix+JSON.stringify(sample)}}));
 assert.equal(result.state,'observed');
 assert.equal('privateValue' in result,false);
});
test('invalid exact page evidence or non-boolean proofs fail closed',()=>{
 for(const x of [{...sample,exact:false},{...sample,main:false},
  {...sample,parent:'yes'},{...sample,counts:[81,0,0,0]}]){
  assert.equal(summarizeReceipt(prefix+JSON.stringify(x)).state,'inconclusive');
 }
});
test('private runtime denial does not invoke any browser call',async()=>{
 let calls=0;
 const result=await inspectReceipt({allowedRuntime:async()=>false,
  call:async()=>{calls++}});
 assert.equal(result.state,'inconclusive');
 assert.equal(calls,0);
});
test('only one exact chat and one read-only evaluate are performed',async()=>{
 const chat='https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/6ae18e93-e2a0-83ec-aac9-88105079f208';
 const calls=[];
 const result=await inspectReceipt({allowedRuntime:async()=>true,
  call:async args=>{
   calls.push(args);
   if(args[1]==='tabs')return JSON.stringify({tabs:[{url:chat,tabId:'tab1'}]});
   if(args[1]==='evaluate')return prefix+JSON.stringify(sample);
   throw Error('unexpected_call');
  }});
 assert.equal(result.state,'observed');
 assert.equal(calls.length,2);
 assert.deepEqual(calls[0],['--json','tabs']);
 assert.deepEqual(calls[1].slice(0,4),['--json','evaluate','--target-id','tab1']);
});
test('ambiguous conversation never reaches DOM evaluation',async()=>{
 const chat='https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/6ae18e93-e2a0-83ec-aac9-88105079f208';
 let calls=0;
 const result=await inspectReceipt({allowedRuntime:async()=>true,
  call:async()=>{
   calls++;
   return JSON.stringify({tabs:[{url:chat,tabId:'a'},{url:chat,tabId:'b'}]});
  }});
 assert.equal(result.state,'inconclusive');
 assert.equal(calls,1);
});
