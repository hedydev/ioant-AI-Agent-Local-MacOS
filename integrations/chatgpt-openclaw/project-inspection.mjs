// Deterministic, local-only Git reads; no LLM, fetch, checkout or source mutation.
import {createHash} from 'node:crypto';
import {executionPolicy} from './project-execution-policy.mjs';
import {inspectExecutionRepository} from './execution-repository.mjs';
import {executionCommand,executionEnvironment,GIT_ARGS,redactExecutionOutput} from './project-execution-command.mjs';
const readCommand=(file,args,options)=>executionCommand(file,args,{...options,env:{...executionEnvironment(),GIT_OPTIONAL_LOCKS:'0'}});
export const inspectionTool={name:'openclaw_project_inspect',
 description:'Inspect this registered local repository without a model or computer tools: branch, HEAD, dirty status and optional redacted staged/working-tree Git diff. Works with local edits; never fetches, clones, cleans or modifies files. Use before deciding whether/how to synchronize a dirty checkout. Untracked file contents are not read. details=diff pages 4000 characters; subsequent pages require snapshot_sha256 from the first response so changed data cannot silently mix. This is not remote-HEAD verification or permission to discard local changes.',
 inputSchema:{type:'object',properties:{details:{type:'string',enum:['summary','diff']},offset:{type:'integer',minimum:0,maximum:262144},snapshot_sha256:{type:'string',pattern:'^[a-f0-9]{64}$'}},additionalProperties:false},
 annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}};
export async function inspectProjectRepository(input,{binding,policy=executionPolicy,command=readCommand}={}){
 const base={project:binding.projectKey,readOnly:true,modelInferenceInvoked:false,computerOperationInvoked:false,networkInvoked:false,sourceCheckoutUpdated:false};
 try{
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['details','offset','snapshot_sha256'].includes(k))||
   input.details!==undefined&&!['summary','diff'].includes(input.details)||input.offset!==undefined&&(!Number.isSafeInteger(input.offset)||input.offset<0||input.offset>262144)||
   input.snapshot_sha256!==undefined&&!/^[a-f0-9]{64}$/.test(input.snapshot_sha256)||
   (input.offset??0)>0&&!input.snapshot_sha256||(input.offset!==undefined||input.snapshot_sha256!==undefined)&&input.details!=='diff')throw Error('invalid_inspection_input');
  const p=await policy(binding,{action:'repository_task'})??await policy(binding);if(!p)throw Error('project_repository_not_enabled');
  const before=await inspectExecutionRepository(p,{command,allowDirty:true});
  const git=async args=>{const r=await command('/usr/bin/git',[...GIT_ARGS,...args],{cwd:p.repo,timeout:15000,limit:131072});if(!r.ok||r.truncated)throw Error(r.truncated?'inspection_output_limit':r.timedOut?'inspection_git_timeout':'inspection_git_failed');return r.stdout;};
  const status=await git(['status','--porcelain=v1','--untracked-files=normal']);
  const out={...base,state:'repository_inspection',repository:p.repository,branch:before.branch,head:before.head,worktreeClean:!before.dirty,statusText:redactExecutionOutput(status),untrackedContentsRead:false};
  if(input.details!=='diff')return out;
  const staged=await git(['diff','--no-ext-diff','--no-textconv','--cached','--']),working=await git(['diff','--no-ext-diff','--no-textconv','--']);
  const head=(await git(['rev-parse','--verify','HEAD'])).trim();if(head!==before.head)throw Error('repository_changed_during_inspection');
  const snapshotSha256=createHash('sha256').update(JSON.stringify([head,status,staged,working])).digest('hex');
  if(input.snapshot_sha256&&input.snapshot_sha256!==snapshotSha256)return {...base,state:'changed',reason:'inspection_snapshot_changed',snapshotSha256};
  const text=redactExecutionOutput('[staged diff]\n'+staged+'\n[working tree diff]\n'+working),offset=input.offset??0;
  if(offset>text.length)throw Error('invalid_inspection_offset');
  const diffText=text.slice(offset,offset+4000),next=offset+diffText.length;
  return {...out,snapshotSha256,diffText,offset,totalCharacters:text.length,nextOffset:next<text.length?next:null,contentIsUntrusted:true};
 }catch(e){return {...base,state:'blocked',reason:/^[a-z_]+$/.test(e.message)?e.message:'inspection_unavailable'};}
}
