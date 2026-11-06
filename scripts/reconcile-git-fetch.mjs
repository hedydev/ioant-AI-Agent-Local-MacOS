#!/usr/bin/env node
// Local maintainer review of an old fetch-only timeout; never fetch/merge again.
import {projectBinding} from '../integrations/chatgpt-openclaw/project-binding.mjs';
import {ProjectExecutionStore} from '../integrations/chatgpt-openclaw/project-execution-store.mjs';
import {reconcileGitFetch} from '../integrations/chatgpt-openclaw/git-fetch-recovery.mjs';
const [mode,key,id,digest,ack,...extra]=process.argv.slice(2);
if(extra.length||!['inspect','resolve'].includes(mode)||mode==='resolve'&&ack!=='--effects-unverified'||mode==='inspect'&&(digest||ack))throw Error('usage_inspect_project_operation_or_resolve_project_operation_digest_effects_unverified');
const binding=projectBinding(key),store=new ProjectExecutionStore(binding);
const result=await reconcileGitFetch({mode,operation_id:id,...(mode==='resolve'?{review_digest:digest,acknowledge_effects_unverified:true}:{})},{binding,store});
console.log(JSON.stringify(result));if(result.state==='blocked')process.exitCode=1;
