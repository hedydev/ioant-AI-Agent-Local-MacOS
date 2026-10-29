import test from 'node:test';import assert from 'node:assert/strict';
import {chromeWindows,nativeBrowserControls,extensionToolbarTarget,pluginTabAllowTarget} from '../scripts/direct-openclaw-native-browser-ui.mjs';
test('native probe selects exact Chrome application and emits only relevant UI labels without user text',()=>{
 const raw={payload:JSON.stringify({windows:[{appName:'Google Chrome',windowRef:'owned'},{appName:'Google Chrome',windowRef:'owned'},{appName:'Other',windowRef:'other'}],
  tree:[{elementRef:'a',role:'AXButton',label:'Extensions'},{elementRef:'b',role:'AXTextArea',label:'Message',value:'private body'},
   {elementRef:'c',role:'AXCheckBox',label:'Debug Browser',value:'1'}]})};
 assert.equal(chromeWindows(raw).length,1);const controls=nativeBrowserControls(raw);
 assert.equal(controls.length,2);assert.equal(JSON.stringify(controls).includes('private body'),false);assert.equal(controls[1].value,'1');
});

test('extension click requires the exact native Plugins address, toolbar role and fresh observation',()=>{
 const raw={observationId:'observation-1',elements:[{elementRef:'address',role:'AXTextField',label:'Address and search bar',value:'chatgpt.com/plugins'},
  {elementRef:'toolbar',role:'AXPopUpButton',label:'OpenClaw'},{elementRef:'page',role:'AXLink',label:'OpenClaw'}]};
 assert.deepEqual(extensionToolbarTarget(raw),{elementRef:'toolbar',observationId:'observation-1'});
 const wrong=structuredClone(raw);wrong.elements[0].value='chatgpt.com/c/other';assert.throws(()=>extensionToolbarTarget(wrong),/page_unverified/);
 const ambiguous=structuredClone(raw);ambiguous.elements.push({elementRef:'second',role:'AXPopUpButton',label:'OpenClaw'});assert.throws(()=>extensionToolbarTarget(ambiguous),/unique_extension/);
});

test('restoring tab access can only click the observed extension popup allow control on Plugins',()=>{
 const raw={observationId:'fresh',elements:[{elementRef:'url',role:'AXTextField',label:'Address and search bar',value:'chatgpt.com/plugins'},
  {elementRef:'toolbar',role:'AXPopUpButton',label:'OpenClaw'},{elementRef:'popup',role:'AXWebArea',label:'OpenClaw'},
  {elementRef:'allow',role:'AXButton',label:'Allow on this tab'}]};
 assert.deepEqual(pluginTabAllowTarget(raw),{elementRef:'allow',observationId:'fresh'});
 const noPopup=structuredClone(raw);noPopup.elements.splice(2,1);assert.throws(()=>pluginTabAllowTarget(noPopup),/popup_required/);
 const pageButton=structuredClone(raw);pageButton.elements.splice(2,0,{elementRef:'wrong',role:'AXButton',label:'Allow on this tab'});assert.equal(pluginTabAllowTarget(pageButton).elementRef,'allow');
});
