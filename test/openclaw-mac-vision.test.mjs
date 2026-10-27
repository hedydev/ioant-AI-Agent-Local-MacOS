import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateImageArtifact,chooseVisionModel,sanitizeAdvice} from '../scripts/openclaw-mac-vision.mjs';
const name='IOANT-Mac-Visual-Snapshot-20261027T170252Z-5f965fc6.jpg';
const jpg=Buffer.from([255,216,255,224,17,0,255,217]);
const sha=createHash('sha256').update(jpg).digest('hex');
test('only accepts exact purpose-limited Desktop screenshot names and matching digest',()=>{
 assert.equal(validateImageArtifact(name,sha,jpg).sha,sha);
 assert.throws(()=>validateImageArtifact('../'+name,sha,jpg),/untrusted_snapshot_name/);
 assert.throws(()=>validateImageArtifact('secrets.jpg',sha,jpg),/untrusted_snapshot_name/);
 assert.throws(()=>validateImageArtifact(name,sha.toUpperCase(),jpg),/untrusted_snapshot_digest/);
 assert.throws(()=>validateImageArtifact(name,'0'.repeat(64),jpg),/snapshot_digest_mismatch/);
});
test('rejects file content not matching the specified JPEG or PNG magic',()=>{
 assert.throws(()=>validateImageArtifact(name,createHash('sha256').update(Buffer.from('hello')).digest('hex'),Buffer.from('hello')),
 /invalid_image_magic/);
 const png=Buffer.from([137,80,78,71,13,10,26,10,0]);
 const pngName=name.replace(/\.jpg$/,'.png'),sum=createHash('sha256').update(png).digest('hex');
 assert.equal(validateImageArtifact(pngName,sum,png).ext,'png');
 assert.throws(()=>validateImageArtifact(name,sha,Buffer.alloc(0)),/invalid_image_size/);
});
test('vision model must be both installed and explicitly vision-capable',()=>{
 const tags={models:[{name:'gemma4:26b-a4b'},{name:'qwen3.8:27b-mlx'}]};
 assert.equal(chooseVisionModel(tags,{'gemma4:26b-a4b':{capabilities:['completion']},
  'qwen3.8:27b-mlx':{capabilities:['completion','vision']}}),'qwen3.8:27b-mlx');
 assert.equal(chooseVisionModel(tags,{'gemma4:26b-a4b':{capabilities:['completion']},
  'qwen3.8:27b-mlx':{capabilities:['completion']}}),null);
 assert.equal(chooseVisionModel({models:[]},{'gemma4:26b-a4b':{capabilities:['vision']}}),null);
 assert.equal(chooseVisionModel(tags,{'gemma4:26b-a4b':{capabilities:['vision']}}),'gemma4:26b-a4b');
});
test('removes URLs, identifiers, bearer headers and common tokens from local model advice',()=>{
 const output=sanitizeAdvice('hello https://chatgpt.com/c/x\nBearer abc123456\nsk-abcdefghijklmnopqrstu\n6ade11a5-f0c0-83ec-add1-8a0cff00c938');
 assert.ok(output.includes('hello'));
 assert.equal(output.includes('https://'),false);
 assert.equal(output.includes('6ade11a5'),false);
 assert.equal(output.includes('sk-abcdefghijklmnopqrstu'),false);
 assert.equal(output.includes('Bearer abc123456'),false);
 assert.ok(output.length<=1650);
});
test('script import never calls screenshot/GUI/Ollama',()=>{
 assert.equal(typeof validateImageArtifact,'function');
 assert.equal(typeof chooseVisionModel,'function');
});
