import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const OUTPUT_LIMIT=6000;
// Exact safe registry, not a shell interpreter. Commands are never read from page content.
export function actionPlan(action, repoRoot) {
  const root=resolve(repoRoot);
  const plans={
    'project-tests': {bin:process.execPath,args:['--test'],cwd:root,timeout:150000},
    'project-status': {bin:'git',args:['status','--short','--branch'],cwd:root,timeout:15000},
    'project-head': {bin:'git',args:['rev-parse','HEAD'],cwd:root,timeout:15000},
    'environment-scan': {bin:process.execPath,args:['src/environment.mjs','scan'],cwd:root,timeout:30000}
  };
  return plans[action] ?? null;
}
export async function runAction(action, repoRoot) {
  const plan=actionPlan(action,repoRoot);
  if (!plan) return {status:'approval_required',reason:'Not on automatic action allowlist. No command was run.'};
  const start=performance.now();
  return new Promise(resolveResult=>{
    let output='',finished=false,timedOut=false;
    const done=(result)=>{if(!finished){finished=true;resolveResult({...result,elapsedMs:Math.round(performance.now()-start),output})}};
    const env={...process.env};
    delete env.NODE_TEST_CONTEXT; // Do not turn nested project tests into recursive Node test-runner skips.
    const p=spawn(plan.bin,plan.args,{cwd:plan.cwd,env,shell:false,stdio:['ignore','pipe','pipe']});
    const timer=setTimeout(()=>{timedOut=true;p.kill('SIGTERM')},plan.timeout);
    const collect=chunk=>{output=(output+chunk.toString('utf8')).slice(-OUTPUT_LIMIT)}; // Keep final test summaries, not megabytes of raw logs.
    p.stdout.on('data',collect);p.stderr.on('data',collect);
    p.on('error',err=>{clearTimeout(timer);done({status:'execution_error',reason:err.code||'spawn_failure'})});
    p.on('close',code=>{clearTimeout(timer);done({status:timedOut?'timed_out':code===0?'passed':'failed',exitCode:code??-1})});
  });
}
