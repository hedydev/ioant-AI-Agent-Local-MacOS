#!/usr/bin/env node
// Prepare exactly the existing stdio profile. Does not read a runtime key or restart anything.
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {lstat,realpath,readFile,writeFile,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const parent=join(homedir(),'Library/Application Support/ioant-openclaw-ops/direct-tunnel');
const file=join(parent,'ioant-openclaw-direct.yaml');
const base=join(homedir(),'.openclaw/tools/node/bin/node')+' '+join(root,'integrations/chatgpt-openclaw/server.mjs');
const previous=base+' --shared-projects openclaw-workflow,alice-ai';
const next=base+' --shared-projects registered';
async function privatePath(path,directory=false){
 const st=await lstat(path);
 if((directory?!st.isDirectory():!st.isFile())||st.isSymbolicLink()||st.uid!==process.getuid()||
  (st.mode&0o077)!==0||await realpath(path)!==path)throw Error('private_profile_required');
}
export function sharedTunnelProfile(c){
 if(c?.control_plane?.api_key!=='env:CONTROL_PLANE_API_KEY'||
  !Array.isArray(c?.mcp?.commands)||c.mcp.commands.length!==1||
  c.mcp.commands[0].channel!=='main'||![base,previous,next].includes(c.mcp.commands[0].command))
  throw Error('existing_profile_requires_review');
 const out=structuredClone(c);out.mcp.commands[0].command=next;return out;
}
export async function configureSharedTunnel(mode){
 try{
  if(!['--dry-run','--apply'].includes(mode))throw Error('explicit_mode_required');
  await privatePath(parent,true);await privatePath(file);
  const require=createRequire(join(homedir(),'.openclaw/tools/node-v24.22.1/lib/node_modules/openclaw/package.json'));
  const YAML=require('yaml'),before=await readFile(file,'utf8'),c=YAML.parse(before),expected=sharedTunnelProfile(c);
  if(isDeepStrictEqual(c,expected))return {state:'already_prepared',restartPerformed:false};
  if(mode==='--dry-run')return {state:'validated',projectRouting:'dynamic_registered',restartPerformed:false};
  const backup=join(parent,'profile-before-shared-'+randomUUID()+'.yaml');
  await writeFile(backup,before,{mode:0o600,flag:'wx'});
  if(await readFile(file,'utf8')!==before)throw Error('profile_changed_before_write');
  const temporary=join(parent,'.shared-profile-'+randomUUID()+'.tmp');
  await writeFile(temporary,YAML.stringify(expected),{mode:0o600,flag:'wx'});
  await rename(temporary,file);
  if(!isDeepStrictEqual(YAML.parse(await readFile(file,'utf8')),expected))throw Error('profile_readback_requires_review');
  return {state:'prepared',projectRouting:'dynamic_registered',backupSaved:true,
   runtimeKeyRead:false,restartPerformed:false,foregroundRestartRequired:true};
 }catch(e){return {state:'blocked',reason:/^[a-z_]+$/.test(e.message)?e.message:'profile_requires_review'};}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const r=await configureSharedTunnel(process.argv.length===3?process.argv[2]:'');console.log(JSON.stringify(r));
 if(!['validated','prepared','already_prepared'].includes(r.state))process.exitCode=1;
}
