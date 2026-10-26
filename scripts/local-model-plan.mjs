#!/usr/bin/env node
// Standalone read-only planner. Does not invoke Gateway agent or route through ChatGPT watcher.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {OLLAMA_URL, ROUTES, planModelRoute} from '../src/local-model-routing.mjs';

const execFileAsync = promisify(execFile);
async function localJSON(path) {
  const response = await fetch(`${OLLAMA_URL}${path}`, {
    signal: AbortSignal.timeout(5000), redirect: 'error',
  });
  if (!response.ok) throw Error('local_http_failure');
  const text = await response.text();
  if (text.length > 1024 * 1024) throw Error('oversized_local_response');
  return JSON.parse(text);
}
export function parseArgs(args) {
  if (args.length !== 2 || args[0] !== '--task' || !Object.hasOwn(ROUTES,args[1]))
    throw Error('usage: node scripts/local-model-plan.mjs --task daily|architecture|coding|planning');
  return args[1];
}
export async function buildPlan(task, {readProvider, readTags, readPs} = {}) {
  const [provider, tags, ps] = await Promise.all([readProvider(),readTags(),readPs()]);
  // Never expose provider keys, model internal parameters, or raw Ollama replies.
  return planModelRoute(task, {
    provider,
    installed: Array.isArray(tags?.models) ? tags.models.map(x=>x?.name).filter(x=>typeof x==='string') : null,
    resident: Array.isArray(ps?.models) ? ps.models.map(x=>({name:x?.name})) : null,
  });
}
async function main(argv) {
  const task = parseArgs(argv);
  const cli = join(homedir(),'.openclaw','bin','openclaw');
  let plan;
  try {
    plan = await buildPlan(task, {
      readProvider: async () => {
        // Exact argv; no shell interpolation or config mutation.
        const {stdout} = await execFileAsync(cli,
          ['config','get','models.providers.ollama','--json'],
          {timeout:25000,maxBuffer:1024*1024,env:process.env});
        return JSON.parse(stdout);
      },
      readTags: ()=>localJSON('/api/tags'),
      readPs: ()=>localJSON('/api/ps'),
    });
  } catch {
    plan = {status:'blocked',reason:'read_only_preflight_failed',task,model:null,execution:'none'};
  }
  console.log(JSON.stringify({schemaVersion:1,kind:'IOANT_LOCAL_MODEL_ROUTE_PLAN',...plan}));
  if (plan.status !== 'ready_for_separate_operator_run') process.exitCode = 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(()=>{ console.error('STOP: planner_error'); process.exitCode=2; });
}
