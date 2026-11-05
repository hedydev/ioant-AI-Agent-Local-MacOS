import {recoverComputerLane} from '../integrations/chatgpt-openclaw/computer-lane-recovery.mjs';
import {registeredProjectBindings} from '../integrations/chatgpt-openclaw/project-binding.mjs';
try{
 const [mode,project,operationId,reviewDigest,...extra]=process.argv.slice(2);
 if(extra.length||!['inspect','resolve'].includes(mode)||mode==='inspect'&&reviewDigest)throw Error('use_inspect_or_resolve_project_operation_review');
 const binding=registeredProjectBindings()[project];if(!binding)throw Error('project_not_registered');
 console.log(JSON.stringify(await recoverComputerLane({mode,operationId,reviewDigest},{binding})));
}catch(e){console.error(/^[a-z_]+$/.test(e.message)?e.message:'computer_lane_recovery_failed');process.exitCode=1;}
