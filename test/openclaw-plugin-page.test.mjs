import test from 'node:test';
import assert from 'node:assert/strict';
import {pluginPageStep,pluginWindow,selectPluginWindow,windowInventory,nativeEnvelope} from '../scripts/openclaw-plugin-page.mjs';
import {projectBinding} from '../integrations/chatgpt-openclaw/project-binding.mjs';
const config={agents:{defaults:{model:'ollama/local'},entries:{'openclaw-dev':{
 model:'ollama/gemma4:26b-a4b',workspace:projectBinding().workspace,tools:{allow:['computer']}}}},
 models:{providers:{ollama:{baseUrl:'http://127.0.0.1:11435',api:'ollama'}}}};
const node={nodeId:'paired-mac',connected:true,platform:'macos',commands:['computer.act','screen.snapshot'],
 computerUse:{contractVersion:2,provider:{id:'cua-computer'},actions:['list_windows','get_window_state','bring_to_front','key','type','left_click']}};
const chromeWindow=ref=>({windowRef:ref,appName:'Google Chrome',isOnScreen:true,bounds:{width:900,height:700}});
function fixture({url='https://chatgpt.com/plugins',failType=false,duplicateRefresh=false,fakeAddress=false}={}){
 const calls=[],claims=new Set();let observation=0;
 const store={begin:async(id)=>{const created=!claims.has(id);claims.add(id);return {created};},finish:async()=>{}};
 const call=async args=>{
  if(args[0]==='nodes'&&args[1]==='status')return {nodes:[node]};
  const p=JSON.parse(args[args.indexOf('--params')+1]);calls.push(p);
  if(p.action==='list_windows')return {ok:true,details:{windows:[chromeWindow('win-chrome')]}};
  if(p.action==='get_window_state')return {ok:true,observation:{observationId:'obs-'+(++observation),elements:[
   {elementRef:'address',role:'text_field',label:'Address and search bar',value:url},
   ...(fakeAddress?[{elementRef:'fake-address',role:'text_field',label:'Address and search bar',value:'https://chatgpt.com/plugins'}]:[]),
   {elementRef:'plugin',role:'link',label:'OpenClaw Mac'},
   {elementRef:'more-actions',role:'AXPopUpButton',label:'More actions'},
   {elementRef:'refresh',role:'button',label:'Refresh'},
   ...(duplicateRefresh?[{elementRef:'refresh2',role:'button',label:'Refresh'}]:[])]}};
  if(p.action==='type'&&failType)throw Error('uncertain_native_input');
  return {ok:true,effect:'applied'};
 };
 return {calls,ctx:{call,store,load:async()=>config,pause:async()=>{},uuid:()=> '26874b5c-1b96-4d45-9500-34b2906c98c6'}};
}
test('authorized open uses fixed new-tab URL input only, targets Chrome and closes its own native execution',async()=>{
 const {calls,ctx}=fixture();const r=await pluginPageStep('open','open_plugin_page_0001',ctx);
 assert.equal(r.originVerified,true);assert.equal(r.modelInferenceInvoked,false);
 assert.equal(r.thisInvocationInputAttempted,true);
 assert.deepEqual(calls.filter(c=>c.action==='key').map(c=>c.keys),['CMD+T','ENTER']);
 assert.deepEqual(calls.filter(c=>c.action==='type').map(c=>c.text),['https://chatgpt.com/plugins']);
 assert.ok(calls.filter(c=>!['list_windows','__close_execution'].includes(c.action)).every(c=>c.windowRef==='win-chrome'));
 assert.equal(calls.at(-1).action,'__close_execution');
 assert.ok(calls.every(c=>c.executionId==='26874b5c-1b96-4d45-9500-34b2906c98c6'));
});
test('uncertain native input stops before Enter and the same ID never repeats it',async()=>{
 const {calls,ctx}=fixture({failType:true});const r=await pluginPageStep('open','open_plugin_page_0002',ctx);
 assert.equal(r.state,'inconclusive');assert.equal(calls.some(c=>c.keys==='ENTER'),false);
 const before=calls.length;const again=await pluginPageStep('open','open_plugin_page_0002',ctx);
 assert.equal(again.reason,'step_reserved_do_not_repeat');assert.equal(calls.length,before);
});
test('Refresh requires an attested plugins address and exactly one fresh target',async()=>{
 for(const opts of [{url:'https://example.com/plugins'},{duplicateRefresh:true},{url:'https://example.com/plugins',fakeAddress:true}]){
  const {calls,ctx}=fixture(opts);const r=await pluginPageStep('refresh','refresh_plugin_0001',ctx);
  assert.equal(r.state,'inconclusive');assert.equal(calls.some(c=>c.action==='left_click'),false);
 }
 const {calls,ctx}=fixture();const r=await pluginPageStep('refresh','refresh_plugin_0002',ctx);
 assert.equal(r.refreshClickedOnce,true);
 const click=calls.find(c=>c.action==='left_click');assert.equal(click.elementRef,'refresh');assert.equal(click.observationId,'obs-1');
});
test('ambiguous Chrome windows are not guessed and unsupported task modes do not access the computer',async()=>{
 assert.throws(()=>pluginWindow({ok:true,details:{windows:[{appName:'Google Chrome',windowRef:'one'},{appName:'Google Chrome',windowRef:'two'}]}}),/unique_chrome/);
 const {calls,ctx}=fixture();assert.equal((await pluginPageStep('navigate-any-url','some_id_001',ctx)).state,'inconclusive');assert.equal(calls.length,0);
});
test('multiple Chrome windows require an exact registered address, with read-only query before selection',async()=>{
 const windows={ok:true,details:{windows:[chromeWindow('one'),chromeWindow('two')]}};
 const target='https://chatgpt.com/g/registered-project/c/registered-chat';
 const read=async ref=>({ok:true,observation:{observationId:'obs-'+ref,elements:[
  {elementRef:'address-'+ref,role:'text_field',label:'Address and search bar',value:ref==='one'?target:'https://example.com/'}]}});
 assert.equal(await selectPluginWindow(windows,read,target),'one');
 await assert.rejects(selectPluginWindow(windows,async()=>read('two'),target),/registered_chrome_window_unverified/);
 await assert.rejects(selectPluginWindow(windows,async()=>read('one'),target),/registered_chrome_window_unverified/);
});
test('off-screen windows and small Chrome panels cannot become keyboard targets',async()=>{
 const windows={ok:true,details:{windows:[chromeWindow('target'),
  ...Array.from({length:45},(_,i)=>({...chromeWindow('panel-'+i),bounds:{width:50,height:30}})),
  {...chromeWindow('off-screen'),isOnScreen:false}]}};
 const chosen=await selectPluginWindow(windows,async()=>{throw Error('unexpected_query');},'https://chatgpt.com/plugins');
 assert.equal(chosen,'target');assert.equal(pluginWindow(windows),'target');
});
test('window diagnostics distinguish absent/name-mismatched/ambiguous inventory without revealing titles or refs',async()=>{
 const scan=windowInventory({result:{ok:true,details:{windows:[{windowRef:'a',appName:'Chrome',title:'private chat title'},
  {windowRef:'b',title:'another private title'}]}}});
 assert.deepEqual(scan,{windowCount:2,chromeNames:['Chrome'],exactChromeCount:0,nonMinimizedChromeCount:0,
  onScreenChromeCount:0,regularChromeCount:0,onScreenRegularChromeCount:0,pluginsTitleHints:0,unnamedWindows:1});
 const {calls,ctx}=fixture();const r=await pluginPageStep('windows',undefined,ctx);
 assert.equal(r.state,'observed');assert.equal(r.thisInvocationInputAttempted,false);
 assert.deepEqual(calls.map(c=>c.action),['list_windows','__close_execution']);
 assert.equal(JSON.stringify(r).includes('win-chrome'),false);
});
test('native bare success inside node.invoke is accepted without treating transport ACK as native proof',()=>{
 assert.deepEqual(nativeEnvelope({ok:true,command:'computer.act',payload:{ok:true}}),{ok:true});
 assert.throws(()=>nativeEnvelope({ok:true}),/not_verified/);
 assert.throws(()=>nativeEnvelope({ok:true,command:'computer.act',payload:{ok:false}}),/not_verified/);
});
test('an explicitly resumed navigation stage does not replay the earlier foreground action',async()=>{
 const {calls,ctx}=fixture();const r=await pluginPageStep('open-focused','continue_open_page_001',ctx);
 assert.equal(r.state,'observed');assert.equal(calls.some(c=>c.action==='bring_to_front'),false);
 assert.deepEqual(calls.filter(c=>c.action==='key').map(c=>c.keys),['CMD+T','ENTER']);
});
test('plugin controls menu targets exactly More actions after origin/plugin verification',async()=>{
 const {calls,ctx}=fixture();const r=await pluginPageStep('menu','plugin_controls_menu_001',ctx);
 assert.equal(r.state,'observed');assert.equal(calls.find(c=>c.action==='left_click').elementRef,'more-actions');
});
