import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseConnectedMacNode,extractBoundedImage} from '../scripts/openclaw-mac-visual.mjs';

const node={id:'mac-abc',platform:'macOS 27.0.1',connected:true,
 commands:['screen.snapshot','computer.act']};
const good={activeNodeId:'mac-abc',nodes:[node,
 {id:'iphone',platform:'iOS 26.6',connected:false}]};
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZacAAAAASUVORK5CYII=';
test('chooses exactly one actively connected mac node, with no model or browser lookup',()=>{
 const found=chooseConnectedMacNode(good);
 assert.equal(found.id,'mac-abc');
 assert.equal(found.snapshotAdvertised,true);
 assert.equal(found.computerActAdvertised,true);
 assert.equal(Object.isFrozen(found),true);
});
test('does not fall back to other macs, phone nodes or an unregistered ID',()=>{
 assert.throws(()=>chooseConnectedMacNode({...good,activeNodeId:'unknown'}),/active_macos_node_unavailable/);
 assert.throws(()=>chooseConnectedMacNode({...good,activeNodeId:'iphone'}),/active_macos_node_unavailable/);
 assert.throws(()=>chooseConnectedMacNode({...good,nodes:[{...node,connected:false}]}),/active_macos_node_unavailable/);
 assert.throws(()=>chooseConnectedMacNode({...good,nodes:[node,node]}),/active_macos_node_unavailable/);
 assert.throws(()=>chooseConnectedMacNode({nodes:[node]}),/active_node_missing/);
});
test('bounded nested PNG decoding produces file bytes but no interaction',()=>{
 const result=extractBoundedImage({result:{payload:JSON.stringify({format:'png',
  base64:PNG,width:1,height:1})}});
 assert.equal(result.format,'png');
 assert.equal(result.width,1);
 assert.equal(result.height,1);
 assert.equal(result.bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
});
test('JPEG decoding validates signature, size and file extension',()=>{
 const jpg=Buffer.from([255,216,255,224,1,2,3,255,217]).toString('base64');
 const result=extractBoundedImage({content:[{data:{format:'jpeg',base64:jpg}}]});
 assert.equal(result.format,'jpg');
 assert.equal(result.bytes.length,9);
});
test('refuses malformed, non-image and unexpectedly large screenshots',()=>{
 assert.throws(()=>extractBoundedImage({result:{format:'jpeg',base64:PNG}}),/image_encoding_unverified/);
 assert.throws(()=>extractBoundedImage({result:{format:'jpg',base64:''}}),/snapshot_payload_unavailable/);
 assert.throws(()=>extractBoundedImage({result:{format:'webp',base64:PNG}}),/snapshot_payload_unavailable/);
 assert.throws(()=>extractBoundedImage({result:{format:'png',base64:'A'.repeat(12_000_000)}}),/snapshot_payload_unavailable/);
});
test('script does not accidentally invoke tools when imported by a test runner',()=>{
 // If entry guard is broken, importing the helper would attempt to call the
 // private Mac-only OpenClaw CLI, and this suite would fail in CI.
 assert.equal(typeof chooseConnectedMacNode,'function');
});
