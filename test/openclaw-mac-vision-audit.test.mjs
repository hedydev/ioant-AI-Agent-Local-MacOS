import test from 'node:test';
import assert from 'node:assert/strict';
import {findVisualCandidateInfo,visionCapabilities,parseVisualFinding,
 chooseVisionModel} from '../scripts/openclaw-mac-vision-audit.mjs';
const DIGEST='0921882d0523aeacaa558235c6bb9cd940ae8229b08c889dad144fe9654536ad';
const FILE='IOANT-Mac-Visual-Snapshot-20261027T170252Z-5f965fc6.jpg';
const good={chromeVisible:'yes',aliceChatVisible:'uncertain',
 extensionBadgeVisible:'yes',extensionOnVisible:'yes',
 confidence:0.64,uiEvidence:'Chrome visible; Alice Chat tab text too small.',
 suggestedCheck:'Compare the original UI screen with the exact Relay tab identity.'};
test('only owned private size-bounded helper screenshot names are eligible',()=>{
 const data=[
 {name:FILE,regular:true,owner:true,private:true,bytes:142132},
 {name:'Mac-Visual-Snapshot-20261027T170252Z-5f965fc6.jpg',
  regular:true,owner:true,private:true,bytes:142132},
 {name:FILE.replace('.jpg','.zip'),regular:true,owner:true,private:true,bytes:142132},
 {name:'IOANT-Mac-Visual-Snapshot-20261027T170252Z-abc12345.jpg',
  regular:true,owner:false,private:true,bytes:120},
 {name:'IOANT-Mac-Visual-Snapshot-20261027T170253Z-abc12345.jpg',
  regular:true,owner:true,private:false,bytes:120},
 {name:'IOANT-Mac-Visual-Snapshot-20261027T170254Z-abc12345.jpg',
  regular:false,owner:true,private:true,bytes:120},
 {name:'IOANT-Mac-Visual-Snapshot-20261027T170255Z-abc12345.jpg',
  regular:true,owner:true,private:true,bytes:99999999}
 ];
 assert.deepEqual(findVisualCandidateInfo(data,DIGEST),[data[0]]);
});
test('screenshot must be selected by expected SHA256, no arbitrary local path',()=>{
 assert.throws(()=>findVisualCandidateInfo([],'/Users/a/Desktop/private.jpg'),/invalid_screenshot_digest/);
 assert.throws(()=>findVisualCandidateInfo([],DIGEST.toUpperCase()),/invalid_screenshot_digest/);
});
test('vision capability requires explicit API report and not inferred from name',()=>{
 assert.equal(visionCapabilities({capabilities:['completion','vision']}),true);
 assert.equal(visionCapabilities({capabilities:['completion']}),false);
 assert.equal(visionCapabilities({capabilities:'vision'}),false);
 assert.equal(visionCapabilities({capabilities:undefined}),false);
});
test('pre-installed vision model selected in preferred order',async()=>{
 const seen=[];
 const api=async(path,payload)=>{
  seen.push([path,payload?.model??null]);
  if(path==='/api/tags')return {models:[{name:'gemma4:26b-a4b'},
   {name:'qwen3.8:27b-mlx'}]};
  if(payload?.model==='gemma4:26b-a4b')return {capabilities:['completion']};
  return {capabilities:['completion','vision']};
 };
 assert.equal(await chooseVisionModel(api),'qwen3.8:27b-mlx');
 assert.deepEqual(seen,[['/api/tags',null],['/api/show','gemma4:26b-a4b'],
  ['/api/show','qwen3.8:27b-mlx']]);
});
test('non-vision installed models are rejected',async()=>{
 const api=async(path)=>path==='/api/tags'?
  {models:[{name:'gpt-oss:20b'},{name:'qwen3.8:27b-mlx'}]}:
  {capabilities:['completion','tools']};
 await assert.rejects(chooseVisionModel(api),/no_installed_vision_model/);
});
test('bounded visual assessment accepted, still advisory',()=>{
 const result=parseVisualFinding(JSON.stringify(good));
 assert.equal(result.aliceChatVisible,'uncertain');
 assert.equal(result.extensionOnVisible,'yes');
 assert.equal(Object.isFrozen(result),true);
});
test('invalid model replies are rejected',()=>{
 for(const reply of [
  'not json','{}',JSON.stringify({...good,aliceChatVisible:'definitely'}),
  JSON.stringify({...good,confidence:2}),
  JSON.stringify({...good,uiEvidence:'X'.repeat(400)}),
  JSON.stringify({...good,suggestedCheck:null})
 ])assert.throws(()=>parseVisualFinding(reply));
});
test('unexpected model keys cannot authorize any actions',()=>{
 const payload={...good, extraAction:'click', extraCommand:'untrusted'};
 const out=parseVisualFinding(JSON.stringify(payload));
 assert.equal(out.extraAction,undefined);
 assert.equal(out.extraCommand,undefined);
 assert.deepEqual(Object.keys(out),[
  'chromeVisible','aliceChatVisible','extensionBadgeVisible',
  'extensionOnVisible','confidence','uiEvidence','suggestedCheck'
 ]);
});
