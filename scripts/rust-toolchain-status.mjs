#!/usr/bin/env node
// Read-only acceptance: versions/paths only. No install, build, default or override write.
import {spawn} from 'node:child_process';
import {join} from 'node:path';
const result={state:'rust_toolchain_status',readOnly:true,automaticToolchainInstall:process.env.RUSTUP_AUTO_INSTALL!=='0',
 cargoHome:process.env.CARGO_HOME,rustupHome:process.env.RUSTUP_HOME,targetDir:process.env.CARGO_TARGET_DIR};
if(!result.cargoHome||!result.rustupHome||!result.targetDir||result.automaticToolchainInstall)throw Error('explicit_rust_build_environment_required');
for(const [name,args] of [['cargo',['--version']],['rustc',['--version']],['rustup',['show','active-toolchain']]]){
 result[name]=await new Promise((resolve,reject)=>{
  let text='';const child=spawn(join(result.cargoHome,'bin',name),args,{env:process.env,stdio:['ignore','pipe','pipe'],shell:false});
  const timer=setTimeout(()=>child.kill('SIGTERM'),10000);
  child.stdout.on('data',c=>{text+=c;if(text.length>4096)child.kill('SIGTERM');});child.stderr.resume();
  child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0&&text.length<=4096?resolve(text.trim()):reject(Error('rust_status_probe_failed'));});
 });
}
console.log(JSON.stringify(result));
