// Startup attestation for this loaded module, not a source-file version check.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {EXECUTION_PARENT} from './project-execution-policy.mjs';
import {privateDirectory,privateRead,privateWrite} from '../../console/private-files.mjs';
const exec=promisify(execFile);
const entry=fileURLToPath(new URL('./server.mjs',import.meta.url));
export async function archiveReaderProcesses(command=exec){
 const {stdout}=await command('/bin/ps',['-axo','uid=,pid=,lstart=,command='],{env:{PATH:'/usr/bin:/bin',LC_ALL:'C'},timeout:3000,maxBuffer:2*1024*1024});
 return stdout.split('\n').flatMap(line=>{
  const m=line.trim().match(/^(\d+)\s+(\d+)\s+(.{24})\s+(.+)$/);
  const argv=m?.[4].split(/\s+/)??[],node=argv[0]==='node'||argv[0]?.endsWith('/node');
  return m&&node&&Number(m[1])===process.getuid()&&argv.includes(entry)?[{pid:Number(m[2]),start:m[3]}]:[];
 });
}
export async function attestArchiveReader({parent=EXECUTION_PARENT,processes=archiveReaderProcesses}={}){
 const current=(await processes()).find(p=>p.pid===process.pid);if(!current)throw Error('archive_reader_identity_unavailable');
 const root=join(parent,'archive-readers');await privateDirectory(root,{create:true});
 await privateWrite(join(root,process.pid+'.json'),{...current,archiveLookupVersion:1});
}
export async function archiveReadersReady({parent=EXECUTION_PARENT,processes=archiveReaderProcesses}={}){
 try{
  const readers=await processes();if(!readers.length)return false;
  for(const p of readers){const marker=JSON.parse(await privateRead(join(parent,'archive-readers',p.pid+'.json')));
   if(marker.pid!==p.pid||marker.start!==p.start||marker.archiveLookupVersion!==1)return false;
  }
  return true;
 }catch{return false;}
}
