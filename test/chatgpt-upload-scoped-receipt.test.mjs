import test from 'node:test';
import assert from 'node:assert/strict';
import {buildScopedReceiptProbe,classifyScopedReceipt}
 from '../stage2/chatgpt-upload-scoped-receipt.mjs';
import {inspect} from '../scripts/openclaw-chatgpt-upload-scoped-receipt-readonly.mjs';

const URL='https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/6ae18e93-e2a0-83ec-aac9-88105079f208';
const TAG='IOANT-UPLOAD-FIXTURE-20261028-196';
const FILE='IOANT-ChatGPT-Upload-Fixture-20261028.txt';
const ROLE='[data-content-search-unit-key$=":user"]';
const PREFIX='IOANT_SCOPED_RECEIPT:';
function el({self='',selectors=[],title='',children=[]}={}){
 const v={self,selectors,title,children,parentElement:null,
  matches(s){return this.selectors.includes(s)},
  getAttribute(s){return s==='title'?this.title:null},
  get textContent(){return this.self+this.children.map(c=>c.textContent).join('')},
  contains(other){for(let p=other;p;p=p.parentElement)if(p===this)return true;return false},
  querySelectorAll(sel){
   const out=[];
   function visit(n){
    for(const c of n.children){
     if(sel==='[title],[aria-label]'?!!c.title:c.matches(sel))out.push(c);
     visit(c);
    }
   }
   visit(this);return out;
  }
 };
 for(const child of children)child.parentElement=v;
 return v;
}
const user=(txt='')=>el({self:txt,selectors:[ROLE]});
const file=()=>el({title:FILE});
const message=(txt,hasFile=false)=>el({children:[user(txt),...(hasFile?[file()]:[])]});
function sample(top,href=URL){
 const main=el({children:top});
 const document={
  querySelector(s){return s==='main'?main:null},
  querySelectorAll(s){return main.querySelectorAll(s)}
 };
 const code=buildScopedReceiptProbe();
 const fn=new Function('document','location','return ('+code+');')(document,{href});
 return classifyScopedReceipt(fn());
}
test('scoped browser proof compiles as a pure function',()=>{
 const f=new Function('return ('+buildScopedReceiptProbe()+')')();
 assert.equal(typeof f,'function');
});
test('attachment in same user-turn wrapper is confirmed despite separate elements',()=>{
 const r=sample([message(TAG,true),message('other')]);
 assert.equal(r.state,'confirmed');
 assert.equal(r.uniqueMarker,true);
 assert.equal(r.attachmentScoped,true);
 assert.equal(r.attachmentAttributeInScope,true);
 assert.equal(r.ancestorDepth,1);
 assert.equal(r.scopedUserTurnCount,1);
});
test('attachment in other user turn must NOT confirm',()=>{
 const r=sample([message(TAG),message('someone else',true)]);
 assert.equal(r.state,'inconclusive');
 assert.equal(r.attachmentScoped,false);
});
test('shared wrapper with multiple user turns must NOT confirm',()=>{
 const common=el({children:[user(TAG),user('other'),file()]});
 const r=sample([common]);
 assert.equal(r.state,'inconclusive');
 assert.equal(r.scopedUserTurnCount,2);
});
test('duplicate marker in two user messages must NOT confirm',()=>{
 assert.equal(sample([message(TAG,true),message(TAG,true)]).state,'inconclusive');
});
test('wrong conversation URL must NOT confirm',()=>{
 assert.equal(sample([message(TAG,true)],URL+'?extra=1').state,'inconclusive');
});
test('file name appearing elsewhere in main must NOT confirm',()=>{
 const unrelated=el({self:FILE});
 assert.equal(sample([message(TAG),unrelated]).state,'inconclusive');
});
test('malformed or faked result cannot confirm receipt',()=>{
 const valid={exact:true,main:true,markerCount:1,roleFamily:0,
  attached:true,inAttribute:true,depth:1,roleCount:1};
 assert.equal(classifyScopedReceipt(PREFIX+JSON.stringify(valid)).state,'confirmed');
 for(const bad of [
  {...valid,exact:false},{...valid,roleCount:2},
  {...valid,markerCount:2},{...valid,attached:'true'},
  {...valid,depth:10},{...valid,roleFamily:8}
 ])assert.equal(classifyScopedReceipt(PREFIX+JSON.stringify(bad)).state,'inconclusive');
});
test('transport JSON nesting parsed with no unrelated message text in output',()=>{
 const valid={exact:true,main:true,markerCount:1,roleFamily:0,
  attached:true,inAttribute:true,depth:1,roleCount:1,other:'REDACT_ME'};
 const r=classifyScopedReceipt({result:{content:[{text:PREFIX+JSON.stringify(valid)}]}});
 assert.equal(r.state,'confirmed');
 assert.equal(JSON.stringify(r).includes('REDACT_ME'),false);
});
test('diagnostic runtime guard makes no browser call',async()=>{
 let calls=0;
 const r=await inspect({allowedRuntime:async()=>false,invoke:async()=>{calls++}});
 assert.equal(r.state,'blocked');
 assert.equal(calls,0);
});
