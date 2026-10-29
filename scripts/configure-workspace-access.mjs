#!/usr/bin/env node
// One local root approval. MCP can connect child repositories, not add roots.
import {homedir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {mkdir,writeFile,rename,unlink,readFile,stat} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {WORKSPACE_ACCESS,validateWorkspaceAccess,loadWorkspaceAccess,verifyWorkspaceRoot} from '../integrations/chatgpt-openclaw/workspace-access.mjs';
import {privateExecutionPath} from '../integrations/chatgpt-openclaw/project-execution-store.mjs';
const runtimeDefaults={node:join(homedir(),'.openclaw/tools/node/bin/node'),python:'/opt/homebrew/bin/python3',bash:'/bin/bash'};
let lock;
try{
 const [mode,...args]=process.argv.slice(2);
 if(!['--dry-run','--apply'].includes(mode)||!args.length||args.length%2||args.some((v,i)=>i%2===0?v!=='--root':!v.startsWith('/')))
  throw Error('explicit_workspace_roots_required');
 const roots=[];
 for(let i=1;i<args.length;i+=2){
  const path=args[i];await verifyWorkspaceRoot(path);
  const suffix=createHash('sha256').update(path).digest('hex').slice(0,8);
  roots.push({key:(basename(path).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,20)||'workspace')+'-'+suffix,path});
 }
 await privateExecutionPath(dirname(WORKSPACE_ACCESS),true);
 if(mode==='--apply'){
  lock=join(dirname(WORKSPACE_ACCESS),'.workspace-access.lock');
  try{await writeFile(lock,'local root enrollment\n',{mode:0o600,flag:'wx'});}catch{lock=null;throw Error('workspace_enrollment_busy');}
 }
 const before=await loadWorkspaceAccess();
 const next=before?structuredClone(before):{schemaVersion:1,roots:[],scriptRoots:['scripts','tools','games'],runtimes:runtimeDefaults,provisionAgents:true};
 for(const root of roots)if(!next.roots.some(r=>r.path===root.path))next.roots.push(root);
 validateWorkspaceAccess(next);
 for(const path of Object.values(next.runtimes)){const st=await stat(path);if(!st.isFile()||!(st.mode&0o111))throw Error('workspace_runtime_unavailable');}
 const changed=!isDeepStrictEqual(before,next);
 if(mode==='--apply'&&changed){
  if(!isDeepStrictEqual(await loadWorkspaceAccess(),before))throw Error('workspace_access_changed_before_write');
  if(before)await writeFile(join(dirname(WORKSPACE_ACCESS),'.workspace-access-before-'+randomUUID()+'.json'),await readFile(WORKSPACE_ACCESS),{mode:0o600,flag:'wx'});
  const temp=join(dirname(WORKSPACE_ACCESS),'.workspace-access-'+randomUUID()+'.tmp');
  await writeFile(temp,JSON.stringify(next)+'\n',{mode:0o600,flag:'wx'});await rename(temp,WORKSPACE_ACCESS);
  if(!isDeepStrictEqual(await loadWorkspaceAccess(),next))throw Error('workspace_access_readback_failed');
 }
 console.log(JSON.stringify({state:mode==='--apply'?'prepared':'validated',roots:next.roots,
  configurationWritten:mode==='--apply'&&changed,provisionNativeAgents:next.provisionAgents,
  nativeAgentTools:'deny_all',scriptRoots:next.scriptRoots,modelInferenceInvoked:false,serviceRestarted:false}));
}catch(e){console.log(JSON.stringify({state:'blocked',reason:/^[a-z_]+$/.test(e.message)?e.message:'workspace_access_requires_review'}));process.exitCode=1;}
finally{if(lock)await unlink(lock).catch(()=>{});}
