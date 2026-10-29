#!/usr/bin/env node
// Real smoke effect: only write a small fixture report in the runner's private output.
import {lstat,realpath,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {executionEnvironment,GIT_ARGS} from '../integrations/chatgpt-openclaw/project-execution-command.mjs';
try{
 const dir=process.env.OPENCLAW_OUTPUT_DIR,id=process.env.OPENCLAW_OPERATION_ID;
 if(process.argv.length!==2||!dir?.startsWith('/')||!/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(id??''))throw Error('runner_context_required');
 const st=await lstat(dir);
 if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o077)!==0||await realpath(dir)!==dir)
  throw Error('private_output_required');
 const head=execFileSync('/usr/bin/git',[...GIT_ARGS,'rev-parse','--verify','HEAD'],{encoding:'utf8',env:executionEnvironment()}).trim();
 if(!/^[a-f0-9]{40}$/.test(head))throw Error('head_unverified');
 const report={schemaVersion:1,marker:'OPENCLAW_GENERIC_REPOSITORY_ACCEPTED',operationId:id,commit:head,
  localScriptExecuted:true,modelInferenceInvoked:false,computerOperationInvoked:false,
  password:'synthetic-redaction-fixture'};
 await writeFile(join(dir,'report.json'),JSON.stringify(report)+'\n',{mode:0o600,flag:'wx'});
 console.log('OPENCLAW_GENERIC_REPORT_WRITTEN');
}catch(e){console.log(JSON.stringify({state:'blocked',reason:/^[a-z_]+$/.test(e.message)?e.message:'acceptance_requires_review'}));process.exitCode=1;}
