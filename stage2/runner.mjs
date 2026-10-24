import { aliceWitnessPreflight } from './alice-preflight.mjs';
import { aliceLabStartupProbe } from './alice-lab-startup.mjs';
import { mintBdsProcessIdentity } from './mint-diagnostics.mjs';
import { mintBdsProcessLineage } from './mint-lineage.mjs';
import {safeAudit} from './openclaw-ollama-provision.mjs';
import { spawn } from 'node:child_process';
import { summarizeTestEvidence,validTestEvidence } from './test-failure-evidence.mjs';
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
    'environment-scan': {bin:process.execPath,args:['src/environment.mjs','scan'],cwd:root,timeout:30000},
    'openclaw-config-preflight': {bin:process.execPath,args:['stage2/openclaw-config-preflight.mjs'],cwd:root,timeout:50000},
    'openclaw-config-rpc-diagnostic': {bin:process.execPath,args:['stage2/openclaw-config-rpc-diagnostic.mjs'],cwd:root,timeout:50000},
    'openclaw-patch-failure-diagnostic': {bin:process.execPath,args:['stage2/openclaw-patch-failure-diagnostic.mjs'],cwd:root,timeout:50000},
    'openclaw-ollama-dryrun': {bin:process.execPath,args:['stage2/openclaw-ollama-dryrun.mjs'],cwd:root,timeout:90000},
    'openclaw-rejection-evidence': {bin:process.execPath,args:['stage2/openclaw-rejection-evidence.mjs'],cwd:root,timeout:210000},
    'openclaw-version-parity': {bin:process.execPath,args:['stage2/openclaw-version-parity.mjs'],cwd:root,timeout:80000},
    'openclaw-ollama-smoke': {bin:process.execPath,args:['stage2/openclaw-ollama-smoke.mjs'],cwd:root,timeout:255000}
  };
  return plans[action] ?? null;
}
export async function executeStep(plan) {
  const result=await runFixedPlan(plan);
  return result;
}

export async function runAction(action, repoRoot, options={}) {
  if (action==='alice-witness-preflight') {
    if (options.enableAlicePreflight!==true) return {status:'approval_required',reason:'This Alice workflow must be explicitly enabled on the Mac launcher.'};
    return aliceWitnessPreflight({execute:executeStep,sshTarget:process.env.ALICE_SSH_TARGET});
  }
  if (action==='alice-lab-startup-probe') {
    if(options.enableAliceLabStartupProbe!==true)
      return {status:'approval_required',reason:'17880 lab BDS startup is not authorized; start the watcher with the separate --enable-alice-lab-startup-probe flag.'};
    return aliceLabStartupProbe({execute:executeStep,sshTarget:process.env.ALICE_SSH_TARGET});
  }
  if (action==='mint-bds-process-identity') {
    if(options.enableMintDiagnostics!==true)
      return {status:'approval_required',reason:'Mint read-only identity checks require explicit --enable-mint-diagnostics.'};
    return mintBdsProcessIdentity({execute:executeStep,sshTarget:process.env.ALICE_SSH_TARGET});
  }
  if(action==='openclaw-ollama-provision'){
    if(options.enableOpenClawProvision!==true)
      return {status:'approval_required',reason:'OpenClaw provider write requires explicit --enable-openclaw-provision on the Mac foreground launcher.'};
    const r=await runFixedPlan({bin:process.execPath,args:['stage2/openclaw-ollama-provision.mjs'],
      cwd:resolve(repoRoot),timeout:120000});
    let audit;
    try{audit=JSON.parse((r.output??'').trim());}catch{}
    if(!audit||audit.audit!=='IOANT_OPENCLAW_OLLAMA_PROVISION'||audit.schemaVersion!==1||
       !['blocked','inconclusive','already_configured','applied'].includes(audit.state))
      return {status:'inconclusive',reason:'Provisioning returned no valid status envelope.'};
    const cleaned=safeAudit(audit.state,audit);
    const applied=cleaned.state==='applied'&&cleaned.backup===true&&
      cleaned.provider==='target'&&cleaned.runtimeAcknowledged===true&&
      JSON.stringify(cleaned.models)==='["gemma4:26b-a4b","gpt-oss:20b"]';
    const already=cleaned.state==='already_configured'&&cleaned.provider==='target';
    return {status:r.status==='passed'&&(applied||already)?'passed':
      cleaned.state==='inconclusive'?'inconclusive':'failed',
      output:JSON.stringify(cleaned)};
  }
  if (action==='project-update-verify') {
    if(options.enableSelfUpdate!==true)
      return {status:'approval_required',reason:'Self-update requires the separate --enable-self-update Mac launcher flag.'};
    const r=await runFixedPlan({bin:process.execPath,args:['stage2/project-self-update.mjs'],
      cwd:resolve(repoRoot),timeout:270000});
    let audit;
    try{audit=JSON.parse((r.output??'').trim());}catch{}
    if(!audit||audit.audit!=='IOANT_PROJECT_SELF_UPDATE'||audit.schemaVersion!==1||
      !['updated','up_to_date','blocked'].includes(audit.state))
      return {status:'inconclusive',reason:'Updater returned no valid, bounded audit.'};
    if(audit.state==='blocked'){
      const details=validTestEvidence(audit.testEvidence)?audit.testEvidence:null;
      return {status:'failed',reason:'Safe update declined: '+String(audit.reason??'unknown').slice(0,64),
        output:JSON.stringify({audit:audit.audit,state:'blocked',reason:audit.reason,
          ...(details?{testEvidence:details}:{})})};
    }
    const sha=/^[0-9a-f]{40}$/;
    if(r.status!=='passed'||!sha.test(audit.from)||!sha.test(audit.to)||
      typeof audit.updated!=='boolean'||typeof audit.reloadRequired!=='boolean'||
      audit.updated!==audit.reloadRequired||audit.updated!==(audit.state==='updated'))
      return {status:'inconclusive',reason:'Self-update result is inconsistent.'};
    return {status:'passed',reloadRequired:audit.reloadRequired,
      output:JSON.stringify({audit:audit.audit,state:audit.state,from:audit.from,
        to:audit.to,tests:audit.tests??null,reloadRequired:audit.reloadRequired})};
  }
  if (action==='mint-bds-process-lineage') {
    if(options.enableMintDiagnostics!==true)
      return {status:'approval_required',reason:'Mint read-only lineage checks require explicit --enable-mint-diagnostics.'};
    return mintBdsProcessLineage({execute:executeStep,sshTarget:process.env.ALICE_SSH_TARGET});
  }
  const plan=actionPlan(action,repoRoot);
  if (!plan) return {status:'approval_required',reason:'Not on automatic action allowlist. No command was run.'};
  return runFixedPlan(plan);
}

async function runFixedPlan(plan) {
  const start=performance.now();
  return new Promise(resolveResult=>{
    let output='',finished=false,timedOut=false;
    const isProjectTests=plan.bin===process.execPath&&plan.args?.length===1&&plan.args[0]==='--test';
    const done=(result)=>{
      if(!finished){
        finished=true;
        resolveResult({...result,elapsedMs:Math.round(performance.now()-start),
          output:isProjectTests?JSON.stringify(summarizeTestEvidence(output)):output});
      }
    };
    const env={...process.env,...(plan.env??{})};
    // Child jobs must never inherit browser Gateway credentials.
    delete env.OPENCLAW_GATEWAY_TOKEN;
    delete env.OPENCLAW_GATEWAY_PASSWORD;
    delete env.OPENCLAW_GATEWAY_URL;
    delete env.NODE_TEST_CONTEXT; // Do not turn nested project tests into recursive Node test-runner skips.
    if(isProjectTests){
      // The live watcher log is scoped to the real PROJECT_DEV_CACHE. Mock
      // test workers replace PROJECT_DEV_CACHE with a private fixture cache.
      // Inheriting this path makes the log safety guard reject test workers.
      // Keep the foreground watcher's own logging untouched.
      delete env.IOANT_LOOP_LOG_FILE;
    }
    const p=spawn(plan.bin,plan.args,{cwd:plan.cwd,env,shell:false,stdio:['ignore','pipe','pipe']});
    const timer=setTimeout(()=>{timedOut=true;p.kill('SIGTERM')},plan.timeout);
    const collect=chunk=>{output=(output+chunk.toString('utf8')).slice(-(isProjectTests?128*1024:OUTPUT_LIMIT))}; // Only a bounded test buffer is parsed; private assertion values are never forwarded.
    p.stdout.on('data',collect);p.stderr.on('data',collect);
    p.on('error',err=>{clearTimeout(timer);done({status:'execution_error',reason:err.code||'spawn_failure'})});
    p.on('close',code=>{clearTimeout(timer);done({status:timedOut?'timed_out':code===0?'passed':'failed',exitCode:code??-1})});
  });
}
