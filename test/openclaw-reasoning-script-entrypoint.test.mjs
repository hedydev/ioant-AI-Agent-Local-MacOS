import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFile,mkdir,mkdtemp,rm,symlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
const root=resolve(import.meta.dirname,'..');
test('reasoning CLI path with spaces and symlink executes and audits without writing',async()=>{
 const tmp=await mkdtemp(join(tmpdir(),'gemma-thinking-entry-'));
 try{
  const dir=join(tmp,'Application Support','runtime','stage2');
  await mkdir(dir,{recursive:true,mode:0o700});
  for(const name of [
   'openclaw-reasoning-metadata.mjs',
   'openclaw-ollama-provision.mjs',
   'openclaw-config-preflight.mjs'
  ])await copyFile(join(root,'stage2',name),join(dir,name));
  const alias=join(tmp,'space-alias');
  await symlink(join(tmp,'Application Support'),alias);
  for(const path of [join(dir,'openclaw-reasoning-metadata.mjs'),
   join(alias,'runtime','stage2','openclaw-reasoning-metadata.mjs')]){
   const child=spawnSync(process.execPath,[path],{
    encoding:'utf8',timeout:10000,
    env:{...process.env,OPENCLAW_PROFILE:'no-write-regression'}
   });
   assert.equal(child.status,0,JSON.stringify({stderr:child.stderr,signal:child.signal}));
   assert.deepEqual(JSON.parse(child.stdout.trim()),{
    audit:'IOANT_GEMMA_REASONING_PATCH',schemaVersion:1,
    state:'blocked',note:'custom_profile_review'
   });
   assert.equal(child.stderr,'');
  }
 }finally{await rm(tmp,{recursive:true,force:true})}
});
