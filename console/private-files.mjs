import {mkdir,lstat,realpath,open,readFile,readdir,rename,writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';

export async function privateDirectory(path,{create=false}={}){
 if(create)await mkdir(path,{recursive:true,mode:0o700});
 const s=await lstat(path);
 if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077)!==0||await realpath(path)!==path)throw Error('private_directory_required');
 return s;
}
export async function privateRead(path,limit=65536){
 await privateDirectory(dirname(path));
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const s=await file.stat();if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)!==0||s.size>limit)throw Error('private_file_required');return await file.readFile('utf8');}
 finally{await file.close();}
}
export async function privateWrite(path,value){
 await privateDirectory(dirname(path),{create:true});const temp=path+'.'+randomUUID()+'.tmp';
 await writeFile(temp,JSON.stringify(value)+'\n',{mode:0o600,flag:'wx'});await rename(temp,path);
}
export async function privateJsonFiles(dir,limit=200){
 try{await privateDirectory(dir);const names=(await readdir(dir)).filter(x=>/^[A-Za-z0-9_-]+\.json$/.test(x));
  const rows=await Promise.all(names.map(async name=>{try{const p=join(dir,name),s=await lstat(p);return s.isFile()&&!s.isSymbolicLink()?{path:p,mtime:s.mtimeMs}:null;}catch{return null;}}));
  return rows.filter(Boolean).sort((a,b)=>b.mtime-a.mtime).slice(0,limit);
 }catch(e){if(e.code==='ENOENT')return [];throw e;}
}
