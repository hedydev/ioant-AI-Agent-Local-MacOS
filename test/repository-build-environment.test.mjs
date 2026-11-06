import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,mkdir,writeFile,chmod,symlink,rm,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {validateBuildProfile,verifyBuildProfile,readBuildProfile,rustBuildEnvironment,repositoryBuildEnvironment} from '../integrations/chatgpt-openclaw/repository-build-environment.mjs';
import {executionEnvironment} from '../integrations/chatgpt-openclaw/project-execution-command.mjs';
import {executeRepositoryTask} from '../integrations/chatgpt-openclaw/repository-task.mjs';
async function fixture(t){
 const root=await realpath(await mkdtemp(join(tmpdir(),'build-env-')));await chmod(root,0o700);t.after(()=>rm(root,{recursive:true,force:true}));
 const profile={schemaVersion:1,volumeRoot:root,cargoHome:join(root,'cargo'),rustupHome:join(root,'rustup'),targetRoot:join(root,'targets')};
 for(const p of [profile.cargoHome,profile.rustupHome,profile.targetRoot,join(profile.cargoHome,'bin')])await mkdir(p,{mode:0o700});
 await writeFile(join(profile.cargoHome,'bin/rustup'),'#!/bin/sh\necho fixture\n',{mode:0o700});
 for(const name of ['cargo','rustc'])await symlink('rustup',join(profile.cargoHome,'bin',name));
 return {root,profile,verify:p=>verifyBuildProfile(p,{mounted:async()=>true})};
}
test('explicit Rust homes survive sanitized task launch without inheriting host credentials or toolchain overrides',async t=>{
 const c=await fixture(t),base=executionEnvironment({OPENAI_API_KEY:'secret',RUSTUP_TOOLCHAIN:'untrusted',CARGO_HOME:'/wrong',PATH:'/wrong'});
 await c.verify(c.profile);const env=rustBuildEnvironment(base,c.profile,'/workspace/Some-Project');
 assert.equal(env.CARGO_HOME,c.profile.cargoHome);assert.equal(env.RUSTUP_HOME,c.profile.rustupHome);assert.equal(env.CARGO_TARGET_DIR,join(c.profile.targetRoot,'some-project'));assert.equal(env.RUSTUP_AUTO_INSTALL,'0');
 assert.equal(env.OPENAI_API_KEY,undefined);assert.equal(env.RUSTUP_TOOLCHAIN,undefined);assert.equal(env.PATH,join(c.profile.cargoHome,'bin')+':'+base.PATH);
 assert.equal(executionEnvironment().RUSTUP_HOME,undefined);
});
test('no profile retains old base and configured missing storage never silently falls back',async t=>{
 const c=await fixture(t);assert.deepEqual(await repositoryBuildEnvironment({repo:'/workspace/test'},{load:async()=>null}),executionEnvironment());
 await assert.rejects(verifyBuildProfile(c.profile,{mounted:async()=>false}),/build_volume_not_mounted/);
 await rm(c.profile.rustupHome,{recursive:true});await assert.rejects(repositoryBuildEnvironment({repo:'/workspace/test'},{load:async()=>c.profile,verify:c.verify}),{code:'ENOENT'});
});
test('private configuration rejects symlinks, public permissions, extra keys and unsafe tool paths',async t=>{
 const c=await fixture(t),path=join(c.root,'profile.json');await writeFile(path,JSON.stringify(c.profile),{mode:0o600});assert.deepEqual(await readBuildProfile(path),c.profile);
 await chmod(path,0o644);await assert.rejects(readBuildProfile(path),/private_build_profile_required/);
 assert.throws(()=>validateBuildProfile({...c.profile,API_KEY:'forbidden'}),/invalid_repository_build_profile/);
 assert.throws(()=>validateBuildProfile({...c.profile,rustupHome:c.root+'/../escape'}),/invalid_repository_build_profile/);
 await unlink(join(c.profile.cargoHome,'bin/cargo'));await symlink('/bin/sh',join(c.profile.cargoHome,'bin/cargo'));await assert.rejects(c.verify(c.profile),/rust_proxy_unverified/);
});
test('actual task step receives project-specific cache and retains operation/output identity',async t=>{
 const c=await fixture(t),calls=[];
 const environment=p=>repositoryBuildEnvironment(p,{load:async()=>c.profile,verify:c.verify});
 await executeRepositoryTask({taskFile:'.openclaw/tasks/probe.json',definitionSha256:'a'.repeat(64),steps:[{name:'probe',runtime:'node',script:'scripts/probe.mjs',args:[],timeoutSeconds:60}],artifacts:[]},
  {repo:'/workspace/My-Repo',runtimes:{node:process.execPath}},{operationId:'runtime_env_probe_01',outputDir:'/private/output',verify:async()=>{},buildEnvironment:environment,step:async(...args)=>calls.push(args)});
 const env=calls[0][3].env;assert.equal(env.RUSTUP_HOME,c.profile.rustupHome);assert.equal(env.CARGO_TARGET_DIR,join(c.profile.targetRoot,'my-repo'));assert.equal(env.OPENCLAW_OPERATION_ID,'runtime_env_probe_01');assert.equal(env.OPENCLAW_OUTPUT_DIR,'/private/output');
});
