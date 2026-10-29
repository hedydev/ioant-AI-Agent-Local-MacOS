#!/usr/bin/env node
// Fixed Alice-only enrollment; no Agent shell grant, secrets or service restart.
import {readFile,writeFile,link,unlink} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {EXECUTION_GRANT,EXECUTION_PARENT,EXECUTION_ENROLLMENT,ALICE_ACTION} from '../integrations/chatgpt-openclaw/project-execution-policy.mjs';
import {privateExecutionPath} from '../integrations/chatgpt-openclaw/project-execution-store.mjs';
import {inspectExecutionRepository} from '../integrations/chatgpt-openclaw/project-execution-runner.mjs';
import {executionCommand} from '../integrations/chatgpt-openclaw/project-execution-command.mjs';
try{
 if(process.argv.length!==3||!['--dry-run','--apply'].includes(process.argv[2]))throw Error('explicit_mode_required');
 await privateExecutionPath(EXECUTION_PARENT,true);
 const repo=await inspectExecutionRepository(ALICE_ACTION);
 const python=await executionCommand(ALICE_ACTION.python,['--version'],{cwd:ALICE_ACTION.repo});
 if(!python.ok)throw Error('registered_python_unavailable');
 let existing;
 try{await privateExecutionPath(EXECUTION_GRANT);existing=JSON.parse(await readFile(EXECUTION_GRANT,'utf8'));}
 catch(e){if(e.code!=='ENOENT')throw e;}
 if(existing&&!isDeepStrictEqual(existing,EXECUTION_ENROLLMENT))throw Error('existing_enrollment_requires_review');
 if(!existing&&process.argv[2]==='--apply'){
  const tmp=join(dirname(EXECUTION_GRANT),'.execution-enroll-'+randomUUID()+'.tmp');
  await writeFile(tmp,JSON.stringify(EXECUTION_ENROLLMENT)+'\n',{mode:0o600,flag:'wx'});
  try{await link(tmp,EXECUTION_GRANT);}finally{await unlink(tmp);}
  await privateExecutionPath(EXECUTION_GRANT);
  if(!isDeepStrictEqual(JSON.parse(await readFile(EXECUTION_GRANT,'utf8')),EXECUTION_ENROLLMENT))throw Error('enrollment_readback_failed');
 }
 console.log(JSON.stringify({state:existing?'already_enrolled':process.argv[2]==='--apply'?'enrolled':'validated',
  project:'alice-ai',action:'alice_mac_regression',branch:repo.branch,beforeCommit:repo.head,
  configurationWritten:!existing&&process.argv[2]==='--apply',agentPermissionsChanged:false,serviceRestarted:false}));
}catch(e){console.log(JSON.stringify({state:'blocked',reason:/^[a-z_]+$/.test(e.message)?e.message:'enrollment_requires_review'}));process.exitCode=1;}
