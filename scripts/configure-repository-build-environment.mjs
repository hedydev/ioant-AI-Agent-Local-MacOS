#!/usr/bin/env node
// Enroll only an already-installed operator-selected toolchain. Never installs.
import {writeFile,link,unlink,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {BUILD_PROFILE,verifyBuildProfile,rustBuildEnvironment,readBuildProfile} from '../integrations/chatgpt-openclaw/repository-build-environment.mjs';
import {executionCommand,executionEnvironment} from '../integrations/chatgpt-openclaw/project-execution-command.mjs';
import {privateExecutionPath} from '../integrations/chatgpt-openclaw/project-execution-store.mjs';
import {dirname} from 'node:path';
const [mode,volumeRoot,cargoHome,rustupHome,targetRoot,...extra]=process.argv.slice(2);
if(extra.length||!['inspect','enable'].includes(mode)||mode==='inspect'&&[volumeRoot,cargoHome,rustupHome,targetRoot].some(x=>x!==undefined))throw Error('usage_inspect_or_enable_volume_cargo_home_rustup_home_target_root');
const profile=mode==='inspect'?await readBuildProfile():{schemaVersion:1,volumeRoot,cargoHome,rustupHome,targetRoot};
if(!profile){console.log(JSON.stringify({state:'not_configured'}));process.exit(0);}
await verifyBuildProfile(profile);
const env=rustBuildEnvironment(executionEnvironment(),profile,process.cwd()),versions={};
for(const [name,args] of [['rustup',['show','active-toolchain']],['cargo',['--version']],['rustc',['--version']]]){
 const r=await executionCommand(join(profile.cargoHome,'bin',name),args,{env,cwd:process.cwd(),timeout:10000,limit:4096});
 if(!r.ok||r.truncated)throw Error('existing_rust_toolchain_probe_failed');versions[name]=r.stdout.trim();
}
if(mode==='enable'){
 await privateExecutionPath(dirname(BUILD_PROFILE),true);
 let old;try{old=await readFile(BUILD_PROFILE,'utf8');await readBuildProfile();}catch(e){if(e.code!=='ENOENT')throw e;}
 if(old&&JSON.stringify(JSON.parse(old))!==JSON.stringify(profile))throw Error('existing_build_profile_requires_separate_review');
 if(!old){const tmp=BUILD_PROFILE+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(profile)+'\n',{mode:0o600,flag:'wx'});try{await link(tmp,BUILD_PROFILE);}finally{await unlink(tmp);}}
}
console.log(JSON.stringify({state:mode==='enable'?'enabled':'configured',scope:'repository_task_steps_only',profile,versions,toolchainInstalled:false,globalDefaultChanged:false,automaticToolchainInstall:false}));
