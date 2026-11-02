#!/usr/bin/env node
// Supported local maintenance entrypoint; never runs repository jobs or models.
import {randomUUID} from 'node:crypto';
import {ProjectExecutionStore} from '../integrations/chatgpt-openclaw/project-execution-store.mjs';
import {registeredProjectBindings} from '../integrations/chatgpt-openclaw/project-binding.mjs';
import {historyStatus,archiveHistory} from '../console/execution-history.mjs';
import {archiveReadersReady} from '../integrations/chatgpt-openclaw/archive-reader.mjs';
try{
 const [mode,key,...extra]=process.argv.slice(2),bindings=registeredProjectBindings();
 if(extra.length||!['status','archive'].includes(mode)||!bindings[key])throw Error('use_status_or_archive_registered_project');
 const result=mode==='status'?{...await historyStatus(new ProjectExecutionStore(bindings[key])),archiveReadersReady:await archiveReadersReady()}:
  await archiveHistory({project_key:key,operation_id:'archive_'+randomUUID().replaceAll('-',''),retain_recent:100});
 console.log(JSON.stringify(result));if(!['observed','archived'].includes(result.state))process.exitCode=1;
}catch(e){console.log(JSON.stringify({state:'blocked',reason:/^[a-z_]+$/.test(e.message)?e.message:'execution_history_unavailable'}));process.exitCode=1;}
