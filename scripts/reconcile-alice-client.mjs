#!/usr/bin/env node
// Same reviewed reconciliation mechanism as MCP; local maintenance entrypoint.
import {projectBinding} from '../integrations/chatgpt-openclaw/project-binding.mjs';
import {ProjectExecutionStore} from '../integrations/chatgpt-openclaw/project-execution-store.mjs';
import {reconcileAliceLifecycle} from '../integrations/chatgpt-openclaw/alice-lifecycle-recovery.mjs';
const [mode,id,digest,...extra]=process.argv.slice(2);
if(extra.length||!['inspect','resolve'].includes(mode))throw Error('usage_inspect_or_resolve_operation_review_digest');
const binding=projectBinding('alice-ai'),store=new ProjectExecutionStore(binding);
const result=await reconcileAliceLifecycle({operation_id:id,mode,...(digest?{review_digest:digest}:{})},{binding,store});
console.log(JSON.stringify(result));
if(result.state==='blocked')process.exitCode=1;
