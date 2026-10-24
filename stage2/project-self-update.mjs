#!/usr/bin/env node
// ChatGPT-commanded self-update is an explicit, fixed repo/main workflow.
// No model-supplied shell, commit SHA, repo URL, flags, credentials or path.
// Candidate revision is extracted into private LunaDrive storage and tested
// before Git fast-forward. Feedback MUST be confirmed before watcher restarts.
import {spawn} from 'node:child_process';
import {summarizeTestEvidence,validTestEvidence} from './test-failure-evidence.mjs';
import {mkdtemp,rm,mkdir,lstat} from 'node:fs/promises';
import {join,resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const AUDIT='IOANT_PROJECT_SELF_UPDATE';
const REPO='hedydev/ioant-AI-Agent-Local-MacOS';
const ORIGINS=new Set([
 'https://github.com/'+REPO,
 'https://github.com/'+REPO+'.git',
 'git@github.com:'+REPO+'.git'
]);
const SHA=/^[0-9a-f]{40}$/;
const MAX_OUTPUT=128*1024;
const TIMEOUT={git:45000,archive:45000,tests:200000};

function emit(message,code=0){
 process.stdout.write(JSON.stringify({audit:AUDIT,schemaVersion:1,...message})+'\n');
 process.exitCode=code;
}
function cleanText(value){
 return String(value??'').trim().replaceAll('\r','');
}

async function command(bin,args,{cwd=ROOT,timeout=TIMEOUT.git,outputLimit=MAX_OUTPUT,env=process.env}={}){
 return new Promise(resolveDone=>{
  let finished=false,stdout='',timedOut=false;
  const complete=value=>{if(finished)return;finished=true;resolveDone(value)};
  const child=spawn(bin,args,{cwd,env,shell:false,stdio:['ignore','pipe','pipe']});
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM')},timeout);
  child.stdout.on('data',chunk=>{stdout=(stdout+chunk.toString('utf8')).slice(-outputLimit)});
  // Consume but never expose stderr: git errors may include private URLs.
  child.stderr.resume();
  child.once('error',()=>{clearTimeout(timer);complete({ok:false,stdout:'',code:'spawn_error'})});
  child.once('close',exit=>{clearTimeout(timer);complete({ok:!timedOut&&exit===0,stdout:stdout.slice(0,outputLimit),
    code:timedOut?'timeout':exit===0?'ok':'nonzero'})});
 });
}
const git=(...args)=>command('git',args);
async function requireGit(...args){
 const r=await git(...args);
 if(!r.ok)throw Error('git_command_failed');
 return cleanText(r.stdout);
}
function assertSha(s){
 if(!SHA.test(s))throw Error('invalid_git_oid');
 return s;
}
async function requireCleanMain(){
 const branch=await requireGit('symbolic-ref','--quiet','--short','HEAD');
 if(branch!=='main')throw Error('not_main');
 const origin=await requireGit('remote','get-url','origin');
 if(!ORIGINS.has(origin))throw Error('unexpected_origin');
 const worktree=await requireGit('status','--porcelain=v1','--untracked-files=all');
 if(worktree)throw Error('dirty_worktree');
 return assertSha(await requireGit('rev-parse','--verify','HEAD'));
}

async function archiveCandidate(sha,folder){
 // Only Git-tree contents from verified origin/main; no remote shell or
 // arbitrary archive source. tar never receives user-provided filenames.
 return new Promise(done=>{
  const gitChild=spawn('git',['archive','--format=tar',sha],{cwd:ROOT,shell:false,stdio:['ignore','pipe','pipe']});
  const tarChild=spawn('tar',['-xf','-','-C',folder],{cwd:ROOT,shell:false,stdio:['pipe','ignore','pipe']});
  gitChild.stdout.pipe(tarChild.stdin);
  let a=null,b=null,closed=false;
  const finish=()=>{if(closed||a===null||b===null)return;closed=true;done(a===0&&b===0)};
  const timer=setTimeout(()=>{gitChild.kill('SIGTERM');tarChild.kill('SIGTERM')},TIMEOUT.archive);
  gitChild.stderr.resume();
  tarChild.stderr.resume();
  gitChild.once('error',()=>{a=-1;finish()});
  tarChild.once('error',()=>{b=-1;finish()});
  gitChild.once('close',x=>{a=x??-1;finish()});
  tarChild.once('close',x=>{b=x??-1;clearTimeout(timer);finish()});
 });
}
export function validateTreeListing(raw){
 if(typeof raw!=='string'||raw.length>MAX_OUTPUT)throw Error('unsafe_candidate_tree');
 const lines=raw.split('\0').filter(Boolean);
 if(lines.length<1||lines.length>3000)throw Error('unsafe_candidate_tree');
 let total=0;
 for(const line of lines){
  const m=line.match(/^(100644|100755) blob [0-9a-f]{40} +([0-9]+)\t(.+)$/s);
  if(!m)throw Error('unsafe_candidate_tree'); // Reject symlinks/submodules.
  const size=Number(m[2]),path=m[3];
  if(!Number.isSafeInteger(size)||size<0||size>12*1024*1024||
     !path||path.startsWith('/')||path.split('/').some(p=>p==='.'||p==='..'||!p)||
     /[\u0000-\u001f\u007f]/.test(path))throw Error('unsafe_candidate_tree');
  total+=size;
  if(total>40*1024*1024)throw Error('unsafe_candidate_tree');
 }
 return {files:lines.length,bytes:total};
}
export function summarizeTests(raw){
 const tests=Number(raw.match(/(?:^|\n)[^\n]*tests\s+([0-9]+)/)?.[1]);
 const pass=Number(raw.match(/(?:^|\n)[^\n]*pass\s+([0-9]+)/)?.[1]);
 const fail=Number(raw.match(/(?:^|\n)[^\n]*fail\s+([0-9]+)/)?.[1]);
 if(!Number.isSafeInteger(tests)||tests<1||
    !Number.isSafeInteger(pass)||pass!==tests||fail!==0)
  throw Error('test_summary_unverified');
 return {total:tests,passed:pass,failed:0};
}
function privateTestEnv(){
 const env={...process.env};
 for(const key of Object.keys(env)){
  if(/TOKEN|PASSWORD|API_KEY|CREDENTIAL|SECRET|AUTHORIZATION|COOKIE/i.test(key))delete env[key];
 }
 delete env.NODE_TEST_CONTEXT;
 return env;
}
export async function verifyProjectUpdate({cache=process.env.PROJECT_DEV_CACHE,volume=process.env.IOANT_DEV_VOLUME}={}){
 if(!cache||!volume||!resolve(cache).startsWith(resolve(volume)+sep+'DeveloperCache'+sep))
  throw Error('invalid_private_cache');
 if(process.platform!=='darwin'&&process.env.IOANT_SELF_UPDATE_TEST_PLATFORM!=='mock')
  throw Error('macos_only');
 const original=await requireCleanMain();
 const fetched=await git('fetch','--no-tags','origin','main');
 if(!fetched.ok)throw Error('fetch_failed');
 const sha=assertSha(await requireGit('rev-parse','--verify','FETCH_HEAD'));
 const branchHead=assertSha(await requireGit('rev-parse','--verify','refs/remotes/origin/main'));
 if(branchHead!==sha)throw Error('fetched_ref_mismatch');
 const ancestor=await git('merge-base','--is-ancestor',original,sha);
 if(!ancestor.ok)throw Error('non_fast_forward');
 const inventory=await git('ls-tree','-r','-l','-z',sha);
 if(!inventory.ok)throw Error('candidate_inventory_failed');
 validateTreeListing(inventory.stdout);
 if(sha===original)return {status:'up_to_date',from:original,to:sha,updated:false,reloadRequired:false,tests:null};
 const workDir=join(resolve(cache),'self-update');
 await mkdir(workDir,{mode:0o700,recursive:true});
 const st=await lstat(workDir);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||
    (typeof process.getuid==='function'&&st.uid!==process.getuid()))
  throw Error('unsafe_private_staging');
 const temp=await mkdtemp(join(workDir,'candidate-'));
 try{
  if(!await archiveCandidate(sha,temp))throw Error('candidate_archive_failed');
  const test=await command(process.execPath,['--test'],{
   cwd:temp,timeout:TIMEOUT.tests,env:privateTestEnv()});
  if(!test.ok)throw Object.assign(Error('candidate_tests_failed'),{
   testEvidence:summarizeTestEvidence(test.stdout)
  });
  const summary=summarizeTests(test.stdout);
  const still=await requireCleanMain();
  if(still!==original)throw Error('local_head_changed_during_testing');
  const ref=assertSha(await requireGit('rev-parse','--verify','refs/remotes/origin/main'));
  if(ref!==sha)throw Error('remote_ref_changed_during_testing');
  // Pull is restricted to literal origin/main and fast-forward mode.
  // Verify afterward that it applied ONLY the pretested object ID.
  const pull=await git('pull','--ff-only','origin','main');
  if(!pull.ok)throw Error('fast_forward_pull_failed');
  const applied=assertSha(await requireGit('rev-parse','--verify','HEAD'));
  if(applied!==sha)throw Error('unexpected_post_pull_head');
  return {status:'updated',from:original,to:sha,updated:true,reloadRequired:true,tests:summary};
 }finally{
  // Remove only our own fresh isolated test archive, never a Git worktree,
  // user files, chat state, lab markers or privileged Mint files.
  await rm(temp,{recursive:true,force:true});
 }
}
async function main(){
 try{
  const result=await verifyProjectUpdate();
  emit({state:result.status,...result});
 }catch(e){
  const reason=e?.message;
  const allowed=new Set(['invalid_private_cache','macos_only','not_main','unexpected_origin','dirty_worktree',
   'invalid_git_oid','git_command_failed','fetch_failed','fetched_ref_mismatch','non_fast_forward',
   'unsafe_private_staging','unsafe_candidate_tree','candidate_inventory_failed',
   'candidate_archive_failed','candidate_tests_failed','test_summary_unverified',
   'local_head_changed_during_testing','remote_ref_changed_during_testing',
   'fast_forward_pull_failed','unexpected_post_pull_head']);
  emit({state:'blocked',reason:allowed.has(reason)?reason:'unexpected',
   ...(reason==='candidate_tests_failed'&&validTestEvidence(e?.testEvidence)?
     {testEvidence:e.testEvidence}:{})},1);
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==2)emit({state:'blocked',reason:'arguments_not_allowed'},2);
 else await main();
}
