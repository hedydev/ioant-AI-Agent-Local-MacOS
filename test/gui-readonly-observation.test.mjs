import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {actionFromJson} from '../stage2/protocol.mjs';
import {GUI_PREFIX,GUI_ACTION,guiEvaluateFunction,collectGuiStructure,
 validateGuiObservation,observeGuiReadOnly} from '../stage2/gui-readonly-observation.mjs';

const URL='https://chatgpt.com/c/6adb7dca-1214-83ec-b210-42efe8f2042e';
function element(tag,{label='',text='',value='',x=0,y=0,w=100,h=25,role=null,
 style={},disabled=false,hidden=false}={}){
 const attrs={'aria-label':label,'role':role,'aria-hidden':hidden?'true':null};
 return {tagName:tag,textContent:text,value,disabled,
  getAttribute:key=>attrs[key]??null,
  getBoundingClientRect:()=>({x,y,width:w,height:h}),
  contains:node=>node===undefined?false:node===this,
  style,
  rect:{x,y,w,h}};
}
function fixture(elements,href=URL){
 const view={innerWidth:1024,innerHeight:768,getComputedStyle:e=>({
  display:e.style.display??'block',visibility:e.style.visibility??'visible',
  opacity:e.style.opacity??'1'})};
 const document={defaultView:view,documentElement:{clientWidth:1024,clientHeight:768},
  querySelectorAll:()=>elements,
  elementFromPoint:(x,y)=>elements.find(e=>x>=e.rect.x&&y>=e.rect.y&&
    x<e.rect.x+e.rect.w&&y<e.rect.y+e.rect.h)};
 for(const e of elements)e.contains=node=>node===e;
 return {document,location:{href}};
}

test('read-only extractor returns positions, generic semantic labels, never user content',()=>{
 const b=element('BUTTON',{label:'Send',text:'do not leak',x:40,y:50});
 const input=element('INPUT',{label:'private key',value:'SECRET_INPUT_CONTENT',x:300,y:120});
 const link=element('A',{label:'Delete private chat Alice@example.com',
  text:'TOP_SECRET_CHAT_NAME',x:20,y:250});
 const hidden=element('BUTTON',{label:'Cancel',x:30,y:340,style:{display:'none'}});
 const {document,location}=fixture([b,input,link,hidden]);
 const raw=collectGuiStructure(document,location);
 assert.ok(raw.startsWith(GUI_PREFIX));
 assert.doesNotMatch(raw,/SECRET_INPUT_CONTENT|TOP_SECRET_CHAT_NAME|private key|Alice@example/);
 const data=JSON.parse(raw.slice(GUI_PREFIX.length));
 assert.equal(data.url,URL);assert.equal(data.visible,3);
 assert.equal(data.controls.length,3);assert.equal(data.controls[0].label,'send');
 assert.deepEqual(data.controls[0].box,{x:40,y:50,w:100,h:25});
 assert.equal(data.controls[1].role,'textbox');assert.equal(data.controls[1].label,'other');
 assert.equal(data.controls[2].role,'link');assert.equal(data.controls[2].label,'other');
 assert.equal(data.controls[0].centerHit,true);
 assert.equal(validateGuiObservation(data,URL).state,'observed');
 assert.equal(validateGuiObservation(data,'https://chatgpt.com/c/different'),null);
});

test('hidden, offscreen, disabled and covered control handling is read-only and bounded',()=>{
 const hidden=element('BUTTON',{label:'save',style:{visibility:'hidden'}});
 const offscreen=element('BUTTON',{label:'cancel',x:2000,y:100});
 const disabled=element('BUTTON',{label:'close',disabled:true,x:10,y:100});
 const covered=element('BUTTON',{label:'continue',x:10,y:150});
 const {document,location}=fixture([hidden,offscreen,disabled,covered]);
 const orig=document.elementFromPoint;
 document.elementFromPoint=(x,y)=>y>=150?null:orig(x,y);
 const data=JSON.parse(collectGuiStructure(document,location).slice(GUI_PREFIX.length));
 assert.equal(data.visible,2);assert.equal(data.occluded,1);
 assert.equal(data.controls[0].disabled,true);
 assert.equal(data.controls[1].centerHit,false);
});

test('observation output rejects page text, injected labels and extra keys',()=>{
 const data={url:URL,viewport:{w:1024,h:768},scanned:1,visible:1,
  occluded:0,controls:[{role:'button',label:'save',box:{x:1,y:1,w:80,h:30},
   centerHit:true,disabled:false}],truncated:false};
 assert.equal(validateGuiObservation(data,URL).state,'observed');
 assert.equal(validateGuiObservation({...data,text:'confidential'},URL),null);
 assert.equal(validateGuiObservation({...data,controls:[{...data.controls[0],
  label:'Pay $100 now'}]},URL),null);
 assert.equal(validateGuiObservation({...data,controls:[{...data.controls[0],
  href:'https://not-allowed'}]},URL),null);
 assert.equal(validateGuiObservation({...data,controls:[{...data.controls[0],
  box:{x:-2,y:1,w:80,h:30}}]},URL),null);
 assert.equal(validateGuiObservation({...data,visible:0},URL),null);
});

test('observer makes exactly one fixed evaluate call and never clicks, types or screenshots',async()=>{
 const {document,location}=fixture([element('BUTTON',{label:'Search',x:20,y:30})]);
 const reply=collectGuiStructure(document,location);
 const calls=[];
 const result=await observeGuiReadOnly({url:URL,target:'target_001',
  browser:async(...args)=>{calls.push(args);return JSON.stringify({result:{value:reply}})}});
 assert.equal(result.state,'observed');
 assert.equal(result.readOnly,true);assert.equal(result.click,false);
 assert.equal(result.inputRead,false);assert.equal(result.screenshot,false);
 assert.deepEqual(calls[0].slice(0,4),['--json','evaluate','--target-id','target_001']);
 assert.equal(calls.length,1);assert.ok(calls[0][5].includes('collectGuiStructure'));
 assert.equal((await observeGuiReadOnly({url:'https://evil.example/c/unknown',
  target:'target_001',browser:async()=>{throw Error('should not call')}})).state,'blocked');
 assert.equal((await observeGuiReadOnly({url:URL,target:'wrong;command',
  browser:async()=>{throw Error('should not call')}})).state,'blocked');
});

test('source contract leaves GUI observation behind a separate opt-in',()=>{
 const task={protocol:'ioant-mac-ops-v1',id:'gui-probe-001',
  action:GUI_ACTION};
 assert.equal(actionFromJson(JSON.stringify(task)).known,true);
 assert.equal(actionFromJson(JSON.stringify(task)).authorized,false);
 assert.throws(()=>actionFromJson(JSON.stringify({...task,url:'https://example.com'})),/Malformed/);
 const watcher=readFileSync(resolve(import.meta.dirname,'../stage2/chatgpt-loop.mjs'),'utf8');
 assert.match(watcher,/--enable-gui-readonly/);
 assert.match(watcher,/task\.action==='openclaw-gui-readonly-probe' && opts\.enableGuiReadonly/);
 assert.match(watcher,/const target=await exactTab\(opts\.url\)/);
 assert.match(watcher,/observeGuiReadOnly\(\{url:opts\.url,target,browser\}\)/);
 assert.ok(guiEvaluateFunction.startsWith('() => '));
 assert.doesNotMatch(guiEvaluateFunction,/\.click\(|\.focus\(|\.value\s*=|fetch\(|XMLHttpRequest|localStorage|sessionStorage/);
});
