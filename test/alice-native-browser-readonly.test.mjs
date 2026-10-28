import test from 'node:test';
import assert from 'node:assert/strict';
import {chromeAppleScript,verifyChromeTarget,selectNativeWindow,summarizeBrowserState}
 from '../scripts/alice-native-browser-readonly.mjs';

const CHAT='https://chatgpt.com/g/g-p-6acaef839af081919426a885b3209f54-ai-mc-alice/c/6ade11a5-f0c0-83ec-add1-8a0cff00c938';
const ref='cua:v2:window:confirmed';
const tab=(url=CHAT,title='AliceAI Chat',active=true)=>'1\t1\t'+(active?'1':'0')+'\t'+title+'\t'+url;
const windows=(items)=>({ok:true,details:{windows:items}});

test('OS Chrome attestation requires one exact Alice Project conversation in a known window',()=>{
 assert.deepEqual(verifyChromeTarget(tab()),{title:'AliceAI Chat',targetActive:true});
 assert.deepEqual(verifyChromeTarget(tab(CHAT,'Other active tab',false)),
  {title:'Other active tab',targetActive:false});
 assert.equal(verifyChromeTarget(tab(CHAT+'?utm_source=chatgpt.com'))?.title,'AliceAI Chat');
 assert.equal(verifyChromeTarget(tab(CHAT+'?token=not-approved')),null);
 assert.equal(verifyChromeTarget('2\t1\tAliceAI Chat\t'+CHAT),null);
 assert.equal(verifyChromeTarget('1\t0\t0\tAliceAI Chat\t'+CHAT),null);
 assert.equal(verifyChromeTarget('1\t1\t2\tAliceAI Chat\t'+CHAT),null);
 assert.equal(verifyChromeTarget('1\t1\tAliceAI Chat\t'+CHAT),null);
 assert.equal(verifyChromeTarget('1\t1\t1\t\t'+CHAT),null);
 assert.equal(verifyChromeTarget(tab(CHAT.replace('6ade11a5','7ade11a5'))),null);
 assert.equal(verifyChromeTarget(tab(CHAT.replace('6acaef83','7acaef83'))),null);
});
test('native CUA window must match exact OS title and exactly one opaque ref',()=>{
 const r=selectNativeWindow(windows([
  {title:'Other Chat',windowRef:'cua:v2:window:other'},
  {title:'AliceAI Chat',windowRef:ref},
  {title:'Google Chrome',windowRef:'cua:v2:window:generic'}]),'AliceAI Chat');
 assert.equal(r.state,'matched');
 assert.equal(r.windowRef,ref);
 assert.equal(r.compatibleCount,1);
});
test('native window selection refuses generic Chrome, duplicate, and mismatched titles',()=>{
 assert.equal(selectNativeWindow(windows([{title:'Google Chrome',windowRef:ref}]),'AliceAI Chat').state,'inconclusive');
 assert.equal(selectNativeWindow(windows([{title:'AliceAI Chat',windowRef:ref},
  {title:'AliceAI Chat',windowRef:'cua:v2:window:other'}]),'AliceAI Chat').reason,'ambiguous_native_window');
 assert.equal(selectNativeWindow(windows([{title:'AliceAI Chat',windowRef:ref},
  {title:'AliceAI Chat',windowRef:ref}]),'AliceAI Chat').reason,'ambiguous_native_window');
 assert.equal(selectNativeWindow(windows([{title:'AliceAI Chat',windowRef:123}]),'AliceAI Chat').state,'inconclusive');
 assert.equal(selectNativeWindow(windows([{title:'Another AliceAI Chat',windowRef:ref}]),'AliceAI Chat').state,'inconclusive');
 assert.equal(selectNativeWindow(windows([{title:'AliceAI Chat - Google Chrome',windowRef:ref}]),'AliceAI Chat').state,'matched');
});
test('native browser metadata never accepts another Project or conversation',()=>{
 const r=summarizeBrowserState({ok:true,details:{
  browserRef:'cua:v2:browser:verified',pages:[
  {pageRef:'cua:v2:page:other',url:CHAT.replace('6ade11a5','7ade11a5')},
  {pageRef:'cua:v2:page:alice',url:CHAT}
 ]}});
 assert.equal(r.state,'target_page_verified');
 assert.equal(r.exactPageMatches,1);
 assert.equal(r.browserRefObserved,true);
 assert.equal(summarizeBrowserState({details:{browserRef:'cua:v2:browser:one',
  pages:[{pageRef:'cua:v2:page:no',url:CHAT+'?secret=x'}]}}).state,'target_page_unverified');
 assert.equal(summarizeBrowserState({details:{pages:[{pageRef:'cua:v2:page:alice',url:CHAT}]}}).state,'target_page_unverified');
});
test('native browser state rejects ambiguous refs even when URL matches',()=>{
 assert.equal(summarizeBrowserState({details:{browserRef:'cua:v2:browser:one',
  pages:[{pageRef:'cua:v2:page:one',url:CHAT},
   {pageRef:'cua:v2:page:two',url:CHAT}]}}).state,'target_page_unverified');
 assert.equal(summarizeBrowserState({content:[{text:JSON.stringify({details:{
  browserRef:'cua:v2:browser:only',
  pages:[{pageRef:'cua:v2:page:alice',url:CHAT}]
 }})}]}).state,'target_page_verified');
});

test('Chrome AppleScript uses numeric enumeration, not unsupported tab.index property',()=>{
 const src=chromeAppleScript();
 assert.match(src,/repeat with j from 1 to \(count of tabs of w\)/);
 assert.match(src,/set activeIdx to active tab index of w/);
 assert.match(src,/set t to tab j of w/);
 assert.match(src,/if j is activeIdx then set b to b \+ 1/);
 assert.match(src,/set nm to title of tab activeIdx of w as text/);
 assert.doesNotMatch(src,/if j is activeIdx then\\nset a to a \+ 1/);
 assert.doesNotMatch(src,/index of t|name of w/);
});
test('Chrome OS read uses only tab URL and active title, no navigation or activation',()=>{
 const src=chromeAppleScript();
 assert.match(src,/set nm to title of tab activeIdx of w as text/);
 assert.match(src,/set u to URL of t as text/);
 assert.doesNotMatch(src,/set active tab|activate|execute javascript|reload|close window|make new/);
 assert.match(src,/return \(n as text\) & tab & \(a as text\) & tab & \(b as text\) & tab & nm & tab & uri/);
});

test('background Alice tab never requires UI activation in AppleScript',()=>{
 const src=chromeAppleScript();
 assert.match(src,/set nm to title of tab activeIdx of w as text/);
 assert.match(src,/set uri to u/);
 assert.match(src,/if j is activeIdx then set b to b \+ 1/);
 assert.doesNotMatch(src,/set active tab index|set active tab|activate|bring to front/);
 assert.deepEqual(verifyChromeTarget(tab(CHAT,'Current foreground page',false)),{
  title:'Current foreground page',targetActive:false
 });
});
test('background-window identity requires unique OS tab and native title',()=>{
 assert.equal(verifyChromeTarget('2\t2\t0\tCurrent tab\t'+CHAT),null);
 assert.equal(verifyChromeTarget('1\t1\t0\tCurrent tab\t'+CHAT+'?unexpected=1'),null);
 assert.equal(selectNativeWindow(windows([
  {windowRef:ref,title:'Different tab'},
  {windowRef:'cua:v2:window:other',title:'Current tab'}
 ]),'Current tab').windowRef,'cua:v2:window:other');
});
