// A refs-pinned fast-forward may preserve local changes only outside changed paths.
// No stash, cleanup, resets, external diff, user content output or model inference.
import {lstat,readFile,readlink} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {GIT_ARGS,executionEnvironment} from './project-execution-command.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const key=x=>x.normalize('NFD').toLowerCase();
const overlap=(a,b)=>a===b||a.startsWith(b+'/')||b.startsWith(a+'/');
export async function preservationSnapshot(policy,{command}){
 const git=async args=>{
  const r=await command('/usr/bin/git',[...GIT_ARGS,...args],{cwd:policy.repo,
   env:{...executionEnvironment(),GIT_OPTIONAL_LOCKS:'0'},limit:262144});
  if(!r.ok||r.truncated)throw Error('preservation_inspection_failed');return r.stdout;
 };
 const tracked=await git(['ls-files','-v','-z']);
 if(tracked.split('\0').filter(Boolean).some(s=>!s.startsWith('H ')))throw Error('index_flags_require_review');
 const paths=new Set();
 for(const args of [['diff','--no-ext-diff','--no-renames','--name-only','-z','--'],
  ['diff','--no-ext-diff','--no-renames','--cached','--name-only','-z','--'],
  ['ls-files','--others','--exclude-standard','-z']]){
  for(const p of (await git(args)).split('\0').filter(Boolean)){
   if(p.startsWith('/')||p.split('/').some(s=>!s||s==='.'||s==='..')||p.includes('\ufffd'))throw Error('preservation_path_unverified');
   paths.add(p);
  }
 }
 if(paths.size>2048)throw Error('preservation_file_limit');
 const files=[];let bytes=0;
 for(const p of [...paths].sort()){
  let s;try{s=await lstat(join(policy.repo,p));}catch(e){if(e.code!=='ENOENT')throw e;}
  let content='absent';
  if(s){
   if(!s.isFile()&&!s.isSymbolicLink())throw Error('preservation_file_type_unverified');
   bytes+=s.size;if(bytes>33554432)throw Error('preservation_byte_limit');
   content=s.isSymbolicLink()?'link:'+await readlink(join(policy.repo,p)):'file:'+hash(await readFile(join(policy.repo,p)));
  }
  files.push([p,s?.mode??null,content]);
 }
 // Include both stage content and the unstaged diff: staged edits may cancel out
 // in a plain diff against HEAD. Contents remain private hashes, never log text.
 const index=paths.size?await git(['ls-files','--stage','-z','--',...paths]):'';
 return {paths:[...paths],digest:hash(JSON.stringify([files,index])),fileCount:files.length,bytes};
}
export async function assertNonoverlappingUpdate(policy,before,target,{command}){
 const r=await command('/usr/bin/git',[...GIT_ARGS,'diff','--no-ext-diff','--no-renames','--name-only','-z',before,target,'--'],{cwd:policy.repo,limit:262144});
 if(!r.ok||r.truncated)throw Error('update_paths_unverified');
 const changes=r.stdout.split('\0').filter(Boolean).map(key);
 const local=(await preservationSnapshot(policy,{command}));
 if(local.paths.some(p=>changes.some(c=>overlap(key(p),c))))throw Error('local_changes_overlap_update');
 return local;
}
export async function verifyPreservation(policy,prior,{command}){
 const current=await preservationSnapshot(policy,{command});
 if(current.digest!==prior.digest)throw Error('local_changes_changed_during_sync');
 return {verified:true,fileCount:prior.fileCount,bytes:prior.bytes,digest:prior.digest};
}
