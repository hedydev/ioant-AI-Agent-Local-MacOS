import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..');
const src=readFileSync(resolve(root,'stage2/maintainer-health.mjs'),'utf8');
const filename=resolve(root,'stage2/maintainer-health.mjs');
test('maintainer CLI rejects arbitrary commands before running any diagnostics',()=>{
 for(const args of [[],['inspect'],['inspect','../etc'],['repair','openclaw-workflow'],
  ['inspect','openclaw-workflow','--restart']]){
  const result=spawnSync(process.execPath,[filename,...args],{
   cwd:root,encoding:'utf8',timeout:5000,env:{...process.env,HOME:'/path/does/not/exist'}});
  assert.equal(result.status,0);
  const json=JSON.parse(result.stdout.trim());
  assert.equal(json.audit,'IOANT_OPENCLAW_MAINTAINER_HEALTH');
  assert.equal(json.state,'blocked');
  assert.equal(json.reason,'invalid_arguments');
 }
});
test('maintainer probes are four fixed local read commands and two tab observations',()=>{
 assert.match(src,/extension_status:\{bin:OC,args:\['browser','extension','status','--json'\]\}/);
 assert.match(src,/browser_doctor:\{bin:OC,args:\['browser','doctor','--browser-profile','chrome'\]\}/);
 assert.match(src,/chrome_tabs:\{bin:OC,args:\['browser','--browser-profile','chrome','--json','tabs'\]\}/);
 assert.match(src,/watcher_status:\{bin:process\.execPath,args:\[\s*join\(ROOT,'stage2','ops-supervisor\.mjs'\),'status'\]\}/);
 assert.doesNotMatch(src,/\bexecSync\(|\bspawnSync\(|\bshell:\s*true|\['browser','(?:click|navigate|type|press|open)'/);
 assert.doesNotMatch(src,/launchctl.*(?:kickstart|bootout|bootstrap)|chrome\.debugger\.|chmod\(|chown\(/);
});
