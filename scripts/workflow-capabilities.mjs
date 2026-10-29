#!/usr/bin/env node
import {inspectWorkflowCapabilities} from '../stage2/workflow-capabilities.mjs';

if(process.argv.length!==2){
 console.log(JSON.stringify({audit:'IOANT_WORKFLOW_CAPABILITIES',schemaVersion:1,
  readOnly:true,state:'blocked',reason:'no_arguments_supported'}));
 process.exitCode=1;
}else{
 const report=await inspectWorkflowCapabilities();
 console.log(JSON.stringify(report));
 if(report.state!=='observed')process.exitCode=1;
}
