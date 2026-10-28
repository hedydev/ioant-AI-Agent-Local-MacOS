import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {extractWindowImage,visualReadArgs} from
 '../scripts/alice-native-computer-window-visual.mjs';

const PNG=Buffer.from([
 137,80,78,71,13,10,26,10,0,0,0,0
]);
test('image extraction is bounded to a provider-supplied visual branch',()=>{
 const raw={ok:true,result:{details:{observationId:'obs-one',
  screenshot:{format:'png',base64:PNG.toString('base64'),width:10,height:10}}}};
 const actual=extractWindowImage(raw);
 assert.equal(actual.format,'png');
 assert.equal(actual.width,10);
 assert.deepEqual(actual.bytes,PNG);
});
test('invalid screenshot body fails without creating a misleading image',()=>{
 for(const x of [
  {ok:true,result:{details:{screenshot:{format:'png',base64:'!!!'}}}},
  {ok:true,result:{details:{observationId:'obs-only'}}},
  {ok:true,result:{details:{screenshot:{format:'jpeg',base64:PNG.toString('base64')}}}}
 ])assert.throws(()=>extractWindowImage(x),/window_image_not_delivered/);
});
test('native visual request uses only one known window ref and no browser API',()=>{
 const args=visualReadArgs('node-id','execution-uuid','window-ref');
 assert.equal(args[0],'nodes');
 assert.equal(args[4],'--command');
 assert.equal(args[5],'computer.act');
 const request=JSON.parse(args[7]);
 assert.deepEqual(request,{action:'get_window_state',
  executionId:'execution-uuid',windowRef:'window-ref',includeScreenshot:true});
 assert.throws(()=>visualReadArgs('','uuid','window'));
});
test('visual path rechecks Alice tab and never clicks, types, or sends messages',()=>{
 const code=readFileSync(new URL('../scripts/alice-native-computer-window-visual.mjs',
  import.meta.url),'utf8');
 assert.match(code,/before\.targetActive!==true/);
 assert.match(code,/after\.targetActive!==true\|\|after\.title!==before\.title/);
 assert.match(code,/scopedCloseRequest\(node,execId\)/);
 assert.match(code,/file,format:image\.format/);
 assert.match(code,/composerIdentityVerified:false,chatDeliveryAuthorized:false/);
 assert.doesNotMatch(code,/action:'(?:get_browser_state|browser_prepare|set_value|click|type)'/);
});
