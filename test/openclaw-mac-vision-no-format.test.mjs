import test from 'node:test';
import assert from 'node:assert/strict';
import {
 visionChatPayload,parseVisualFinding
} from '../scripts/openclaw-mac-vision-audit.mjs';

const SAMPLE=Buffer.from([255,216,255,217]);

test('vision request omits unsupported format while retaining JSON prompt',()=>{
 const payload=visionChatPayload('gemma4:26b-a4b',SAMPLE);
 assert.equal(Object.hasOwn(payload,'format'),false);
 assert.equal(payload.model,'gemma4:26b-a4b');
 assert.equal(payload.stream,false);
 assert.equal(payload.think,false);
 assert.equal(payload.keep_alive,0);
 assert.equal(payload.options.temperature,0);
 assert.equal(payload.options.num_predict,384);
 assert.equal(payload.messages.length,1);
 assert.equal(payload.messages[0].role,'user');
 assert.match(payload.messages[0].content,/Reply ONLY with one valid JSON object/);
 assert.deepEqual(Buffer.from(payload.messages[0].images[0],'base64'),SAMPLE);
});
test('untrusted or empty local screenshot inputs are not accepted',()=>{
 assert.throws(()=>visionChatPayload('unknown-model',SAMPLE),/invalid_vision_model/);
 assert.throws(()=>visionChatPayload('gemma4:26b-a4b','some file path'),/invalid_image_size/);
 assert.throws(()=>visionChatPayload('gemma4:26b-a4b',Buffer.alloc(0)),/invalid_image_size/);
 assert.throws(()=>visionChatPayload('gemma4:26b-a4b',Buffer.alloc(8*1024*1024+1)),/invalid_image_size/);
});
test('without constrained decoding, only strict validated complete JSON is accepted',()=>{
 const valid={chromeVisible:'yes',aliceChatVisible:'uncertain',
  extensionBadgeVisible:'yes',extensionOnVisible:'no',
  confidence:0.5,uiEvidence:'Browser visible',
  suggestedCheck:'Compare exact authorized tab registration'};
 const observed=parseVisualFinding(JSON.stringify(valid));
 assert.equal(observed.aliceChatVisible,'uncertain');
 assert.equal(observed.extensionOnVisible,'no');
 for(const unstructured of [
  'Here is what I see: '+JSON.stringify(valid),
  '\x60\x60\x60json\n'+JSON.stringify(valid)+'\n\x60\x60\x60',
  JSON.stringify({...valid,confidence:1.5}),
  '{"chromeVisible":"yes"}'
 ])assert.throws(()=>parseVisualFinding(unstructured));
});
