import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {executionEnvironment} from './project-execution-command.mjs';
export async function launchComputerJob(binding,id){
 const script=fileURLToPath(new URL('../../scripts/direct-openclaw-computer-job.mjs',import.meta.url));
 await new Promise((ok,bad)=>{
  const child=spawn(process.execPath,[script,binding.projectKey,id],{env:executionEnvironment(),shell:false,detached:true,stdio:'ignore'});
  child.once('error',bad);child.once('spawn',()=>{child.unref();ok();});
 });
}
