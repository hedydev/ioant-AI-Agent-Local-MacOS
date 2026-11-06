// Optional owner-configured build profile, applied only to repository task steps.
// Git/health/transport/native model environments remain separately sanitized.
import {lstat,realpath,readFile,stat} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {executionEnvironment} from './project-execution-command.mjs';
export const BUILD_PROFILE=join(homedir(),'Library/Application Support/ioant-openclaw-ops/repository-build-environment.json');
const fields=['schemaVersion','volumeRoot','cargoHome','rustupHome','targetRoot'];
const absolute=p=>typeof p==='string'&&p.startsWith('/')&&!/[\x00-\x1f\x7f:]/.test(p)&&p.split('/').slice(1).every(s=>s&&s!=='.'&&s!=='..');
export function validateBuildProfile(p){
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).sort().join(',')!==[...fields].sort().join(',')||p.schemaVersion!==1||
  !fields.slice(1).every(k=>absolute(p[k]))||!['cargoHome','rustupHome','targetRoot'].every(k=>p[k].startsWith(p.volumeRoot+'/'))||new Set(fields.slice(1).map(k=>p[k])).size!==4)throw Error('invalid_repository_build_profile');
 return p;
}
export async function verifyBuildProfile(p,{mounted=async root=>(await stat(root)).dev!==(await stat(dirname(root))).dev}={}){
 validateBuildProfile(p);
 if(!await mounted(p.volumeRoot))throw Error('build_volume_not_mounted');
 for(const path of [p.volumeRoot,p.cargoHome,p.rustupHome,p.targetRoot,join(p.cargoHome,'bin')]){
  const s=await lstat(path);
  if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&(path===p.volumeRoot?0o002:0o022))!==0||await realpath(path)!==path)throw Error('build_directory_unverified');
 }
 for(const name of ['cargo','rustc','rustup']){
  const path=join(p.cargoHome,'bin',name),real=await realpath(path),s=await stat(real);
  if(!real.startsWith(p.cargoHome+'/bin/')||!s.isFile()||s.uid!==process.getuid()||(s.mode&0o022)!==0||!(s.mode&0o111))throw Error('rust_proxy_unverified');
 }
 return p;
}
export async function readBuildProfile(path=BUILD_PROFILE){
 let s;try{s=await lstat(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}
 const parent=await lstat(dirname(path));
 if(!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077)!==0||s.size>4096||await realpath(path)!==path||
  !parent.isDirectory()||parent.isSymbolicLink()||parent.uid!==process.getuid()||(parent.mode&0o077)!==0)throw Error('private_build_profile_required');
 return validateBuildProfile(JSON.parse(await readFile(path,'utf8')));
}
export function rustBuildEnvironment(base,profile,repo){
 validateBuildProfile(profile);
 const slug=basename(repo).toLowerCase().replace(/[^a-z0-9._-]/g,'-');
 if(!slug||slug==='.'||slug==='..')throw Error('invalid_build_project_slug');
 return {...base,PATH:join(profile.cargoHome,'bin')+':'+base.PATH,CARGO_HOME:profile.cargoHome,RUSTUP_HOME:profile.rustupHome,
  CARGO_TARGET_DIR:join(profile.targetRoot,slug),RUSTUP_AUTO_INSTALL:'0'};
}
export async function repositoryBuildEnvironment(policy,{load=readBuildProfile,verify=verifyBuildProfile}={}){
 const base=executionEnvironment(),profile=await load();
 if(!profile)return base;
 await verify(profile);return rustBuildEnvironment(base,profile,policy.repo);
}
