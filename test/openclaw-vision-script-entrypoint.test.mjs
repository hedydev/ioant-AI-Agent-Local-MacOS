import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFile,mkdir,mkdtemp,rm,symlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';

const root=resolve(import.meta.dirname,'..');
test('direct vision CLI entrypoint works from macOS Application Support path containing spaces',async()=>{
 const scratch=await mkdtemp(join(tmpdir(),'ioant-vision-entry-'));
 try{
  const dir=join(scratch,'Application Support','runtime','stage2');
  await mkdir(dir,{recursive:true,mode:0o700});
  for(const name of ['openclaw-vision-metadata.mjs','openclaw-ollama-provision.mjs','openclaw-config-preflight.mjs'])
   await copyFile(join(root,'stage2',name),join(dir,name));
  // An explicit custom profile blocks BEFORE reading or patching the user's
  // Gateway. The audit on stdout proves main() truly ran, not just imported.
  // Exercise both the literal space path and a /var -> /private/var-style
  // symbolic alias. Node may canonicalize the ESM URL while leaving argv[1]
  // exactly as invoked. Neither invocation is allowed to modify config.
  const alias=join(scratch,'temporary-alias');
  await symlink(join(scratch,'Application Support'),alias);
  for(const path of [
   join(dir,'openclaw-vision-metadata.mjs'),
   join(alias,'runtime','stage2','openclaw-vision-metadata.mjs')
  ]){
   const child=spawnSync(process.execPath,[path],{
    encoding:'utf8',timeout:10000,
    env:{...process.env,OPENCLAW_PROFILE:'vision-entrypoint-regression'}
   });
   assert.equal(child.status,0,JSON.stringify({signal:child.signal,stderr:child.stderr}));
   assert.deepEqual(JSON.parse(child.stdout.trim()),{
    audit:'IOANT_GEMMA_VISION_PATCH',schemaVersion:1,
    state:'blocked',note:'custom_profile_review'
   });
   assert.equal(child.stderr,'');
  }
 }finally{await rm(scratch,{recursive:true,force:true})}
});
