#!/usr/bin/env node
// Local one-time enrollment from AI-prepared private data, never an MCP tool.
// Only adds grants; changing/revoking an existing grant requires separate review.
import {readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {REPOSITORY_TASK_GRANT,readRepositoryTaskGrants,validateRepositoryTaskGrants} from '../integrations/chatgpt-openclaw/repository-task-policy.mjs';
import {registeredProjectBindings} from '../integrations/chatgpt-openclaw/project-binding.mjs';
import {inspectDirectAgent} from '../integrations/chatgpt-openclaw/agent.mjs';
import {inspectExecutionRepository} from '../integrations/chatgpt-openclaw/project-execution-runner.mjs';
import {privateExecutionPath} from '../integrations/chatgpt-openclaw/project-execution-store.mjs';
let lock;
try{
 const [mode,input]=process.argv.slice(2);
 if(process.argv.length!==4||!['--dry-run','--apply'].includes(mode)||!input?.startsWith('/'))throw Error('explicit_local_input_required');
 const source=await privateExecutionPath(input);if(source.size>65536)throw Error('grant_input_too_large');
 const doc=validateRepositoryTaskGrants(JSON.parse(await readFile(input,'utf8')));
 const bindings=registeredProjectBindings({load:()=>doc});
 await privateExecutionPath(dirname(REPOSITORY_TASK_GRANT),true);
 if(mode==='--apply'){
  lock=join(dirname(REPOSITORY_TASK_GRANT),'.repository-grants.lock');
  try{await writeFile(lock,'enrollment\n',{mode:0o600,flag:'wx'});}catch{lock=null;throw Error('enrollment_busy');}
 }
 const existing=readRepositoryTaskGrants();
 for(const [key,value] of Object.entries(existing.projects))
  if(!isDeepStrictEqual(doc.projects[key],value))throw Error('existing_grant_change_requires_review');
 for(const [key,p] of Object.entries(doc.projects)){
  if((await inspectDirectAgent({binding:bindings[key]})).state!=='ready')throw Error('registered_agent_not_ready');
  await inspectExecutionRepository(p);
  for(const runtime of Object.values(p.runtimes)){
   const {lstat}=await import('node:fs/promises');
   const {stat}=await import('node:fs/promises');
   const st=await stat(runtime);if(!st.isFile()||(st.mode&0o111)===0)throw Error('registered_runtime_unavailable');
   const link=await lstat(runtime);if(!link.isFile()&&!link.isSymbolicLink())throw Error('registered_runtime_unavailable');
  }
 }
 const changed=!isDeepStrictEqual(existing,doc);
 if(mode==='--apply'&&changed){
  const temp=join(dirname(REPOSITORY_TASK_GRANT),'.repository-grants-'+randomUUID()+'.tmp');
  await writeFile(temp,JSON.stringify(doc)+'\n',{mode:0o600,flag:'wx'});
  await rename(temp,REPOSITORY_TASK_GRANT);
  if(!isDeepStrictEqual(readRepositoryTaskGrants(),doc))throw Error('enrollment_readback_failed');
 }
 console.log(JSON.stringify({state:mode==='--apply'?'enrolled':'validated',projects:Object.keys(doc.projects),
  configurationWritten:mode==='--apply'&&changed,agentPermissionsChanged:false,serviceRestarted:false,
  note:'New projects require an already configured independent Agent. Restart shared registered mode and refresh metadata once when ready.'}));
}catch(e){console.log(JSON.stringify({state:'blocked',reason:/^[a-z_]+$/.test(e.message)?e.message:'repository_enrollment_requires_review'}));process.exitCode=1;}
finally{if(lock)await unlink(lock).catch(()=>{});}
