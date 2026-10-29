#!/usr/bin/env node
// Private one-job entry; never a persistent browser Worker or model process.
import {projectBinding} from '../integrations/chatgpt-openclaw/project-binding.mjs';
import {ProjectExecutionStore} from '../integrations/chatgpt-openclaw/project-execution-store.mjs';
import {runRegisteredExecution} from '../integrations/chatgpt-openclaw/project-execution-runner.mjs';
import {operationId} from '../integrations/chatgpt-openclaw/computer-task-store.mjs';
try{
 if(process.argv.length!==4||!operationId.test(process.argv[3]??''))throw Error('invalid_job');
 const binding=projectBinding(process.argv[2]);
 await runRegisteredExecution(binding,process.argv[3],{store:new ProjectExecutionStore(binding)});
}catch{process.exitCode=1;} // Existing claim/lock stays authoritative on crash; no automatic replay.
