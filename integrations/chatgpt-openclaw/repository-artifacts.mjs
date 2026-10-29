// Only declared files inside this operation's private output directory are read.
import {lstat,realpath,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {executionCommand,redactExecutionOutput} from './project-execution-command.mjs';
import {repositoryPath} from './repository-task.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const sensitive=/(?:password|passwd|secret|token|authorization|cookie|api.?key|private.?key|credential)/i;
function cleanJson(value,depth=0,budget={nodes:0}){
 if(depth>12||++budget.nodes>10000)throw Error('artifact_json_too_complex');
 if(Array.isArray(value))return value.map(v=>cleanJson(v,depth+1,budget));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>
  [k,sensitive.test(k)?'[REDACTED]':cleanJson(v,depth+1,budget)]));
 return typeof value==='string'?redactExecutionOutput(value):value;
}
export async function readDeclaredArtifact(outputDir,artifact,{command=executionCommand}={}){
 if(!repositoryPath(artifact.file))throw Error('invalid_artifact_path');
 if(await realpath(outputDir)!==outputDir)throw Error('artifact_output_unverified');
 let path=outputDir;
 const parts=artifact.file.split('/');
 for(let i=0;i<parts.length;i++){
  path=join(path,parts[i]);const s=await lstat(path);
  if(s.isSymbolicLink()||s.uid!==process.getuid()||await realpath(path)!==path||
   (i<parts.length-1?!s.isDirectory():!s.isFile()))throw Error('artifact_path_unverified');
 }
 const zip=artifact.format.startsWith('zip_'),st=await lstat(path);
 if(st.size>(zip?8388608:262144))throw Error('artifact_too_large');
 const raw=await readFile(path);
 let text;
 if(zip){
  if(!repositoryPath(artifact.member))throw Error('invalid_artifact_member');
  const helper=fileURLToPath(new URL('./zip-artifact.py',import.meta.url));
  const r=await command('/usr/bin/python3',['-I','-S',helper,path,artifact.member],{cwd:outputDir,timeout:10000});
  if(!r.ok||r.truncated)throw Error('zip_artifact_unverified');text=r.stdout;
  // The helper must have read the same source bytes we hashed.
  if(hash(await readFile(path))!==hash(raw))throw Error('artifact_changed_during_read');
 }else text=new TextDecoder('utf-8',{fatal:true}).decode(raw);
 if(Buffer.byteLength(text)>262144)throw Error('artifact_too_large');
 const cleaned=artifact.format.endsWith('json')?JSON.stringify(cleanJson(JSON.parse(text)),null,2):redactExecutionOutput(text);
 if(Buffer.byteLength(cleaned)>262144)throw Error('artifact_too_large');
 return {text:cleaned,format:artifact.format,sourceSha256:hash(raw),redactionApplied:cleaned!==text};
}
export async function collectRepositoryArtifacts(plan,outputDir,store,operationId){
 const artifacts=[];
 for(const definition of plan.artifacts){
  const result=await readDeclaredArtifact(outputDir,definition);
  artifacts.push(await store.writeArtifact(operationId,definition.id,result));
 }
 return artifacts;
}
