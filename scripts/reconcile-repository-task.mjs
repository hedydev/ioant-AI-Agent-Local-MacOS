#!/usr/bin/env node
// Local maintenance only; pinned script/effects review precedes resolve.
import {projectBinding} from '../integrations/chatgpt-openclaw/project-binding.mjs';
import {ProjectExecutionStore} from '../integrations/chatgpt-openclaw/project-execution-store.mjs';
import {reconcileRepositoryTask} from '../integrations/chatgpt-openclaw/repository-task-recovery.mjs';
const argv=process.argv.slice(2);
const reviewedFlag=argv.at(-1)?.match(/^--reviewed-cwd-pids=([1-9]\d*(?:,[1-9]\d*)*)$/);
const reviewedCwdPids=reviewedFlag?argv.pop().split('=')[1].split(',').map(Number):[];
const [mode,key,id,digest,ack,...extra]=argv;
if(extra.length||!['inspect','resolve'].includes(mode)||mode==='resolve'&&ack!=='--effects-unverified'||mode==='inspect'&&(digest||ack))throw Error('usage_inspect_project_operation_or_resolve_project_operation_digest_effects_unverified');
const binding=projectBinding(key),store=new ProjectExecutionStore(binding);
const result=await reconcileRepositoryTask({mode,operation_id:id,...(mode==='resolve'?{review_digest:digest,acknowledge_effects_unverified:true}:{})},{binding,store,reviewedCwdPids});
console.log(JSON.stringify(result));if(result.state==='blocked')process.exitCode=1;
