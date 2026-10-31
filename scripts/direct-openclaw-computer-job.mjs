#!/usr/bin/env node
import {projectBinding} from '../integrations/chatgpt-openclaw/project-binding.mjs';
import {operationId} from '../integrations/chatgpt-openclaw/computer-task-store.mjs';
import {runComputerJob} from '../integrations/chatgpt-openclaw/computer-job.mjs';
try{
 if(process.argv.length!==4||!operationId.test(process.argv[3]??''))throw Error('invalid_job');
 await runComputerJob(projectBinding(process.argv[2]),process.argv[3]);
}catch{process.exitCode=1;} // Persisted intent/lane survives a crash, never replay.
