// Local operator-selected development Agent route. Never use agentId from ChatGPT page.
import {isDeepStrictEqual} from 'node:util';
import {lstat,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {rpcEnvelope} from './openclaw-ollama-provision.mjs';
import {fixedPatch} from './openclaw-alice-create.mjs';

export const DEV_AGENT_IDS=Object.freeze(['alice-ai','openclaw-dev']);
const BASE='/Volumes/LunaDrive/DeveloperCache/openclaw-agents';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function validDevAgent(agentId){return DEV_AGENT_IDS.includes(agentId);}
export function isBoundDevDiscussion(action,agentId){
 return validDevAgent(agentId)&&(
  action==='openclaw-agent-dev-discuss'||
  (action==='openclaw-alice-dev-discuss'&&agentId==='alice-ai'));
}
export function agentPolicy(agentId){
 if(!validDevAgent(agentId))throw Error('agent_not_allowlisted');
 const src=fixedPatch().agents.entries['alice-ai'];
 return {...structuredClone(src),name:agentId==='alice-ai'?'AliceAI':'OpenClaw Dev',
  workspace:join(BASE,agentId)};
}
// Verify every registered allowlisted advisor, not just the selected target.
// Otherwise checking safe Alice could silently ignore a newly privileged Dev.
function matchesPolicy(agent,id,strict){
 const expected=agentPolicy(id);
 if(!object(agent)||agent.model!==expected.model||agent.workspace!==expected.workspace||
    !isDeepStrictEqual(agent.modelPolicy,expected.modelPolicy)||
    !object(agent.tools)||agent.tools.profile!=='minimal'||
    !Array.isArray(agent.tools.deny)||!agent.tools.deny.includes('*')||
    agent.tools.codeMode!==false||agent.tools.exec?.mode!=='deny'||
    agent.tools.elevated?.enabled!==false||agent.tools.fs?.workspaceOnly!==true||
    !isDeepStrictEqual(agent.tools.agentToAgent?.send,[])||
    !isDeepStrictEqual(agent.subagents?.allowAgents,[])||
    !isDeepStrictEqual(agent.skills,[]))return false;
 // The authored and active views cannot hide extra tool policy fields.
 if(strict&&(!isDeepStrictEqual(agent.tools,expected.tools)||
    !isDeepStrictEqual(agent.modelPolicy,expected.modelPolicy)))return false;
 return true;
}
// Fail closed on any new Agent, changed policy, unexpected routing or roster
// disagreement across the four Gateway views. The selected target is pinned
// on the Mac, never selected by an untrusted ChatGPT model turn.
export function verifyBoundAgentConfig(snapshot,agentId){
 if(!validDevAgent(agentId))return false;
 const doc=rpcEnvelope(snapshot);
 if(!object(doc)||doc.valid!==true||doc.exists===false)return false;
 let baselineRoster=null;
 for(const layer of ['sourceConfig','config','parsed','resolved']){
  const root=doc[layer];
  if(!object(root)||!object(root.agents)||root.agents.ownership!=='explicit'||
     root.agents.defaults?.systemAgent?.agentId!=='main'||
     !object(root.agents.entries)||!object(root.agents.entries.main))return false;
  const entries=root.agents.entries;
  const names=Object.keys(entries).sort();
  if(names.some(id=>!['main',...DEV_AGENT_IDS].includes(id))||
     !Object.hasOwn(entries,agentId))return false;
  const roster=names.join(',');
  if(baselineRoster===null)baselineRoster=roster;
  else if(roster!==baselineRoster)return false;
  for(const id of DEV_AGENT_IDS){
   if(Object.hasOwn(entries,id)&&
      !matchesPolicy(entries[id],id,layer==='sourceConfig'||layer==='config'))
    return false;
  }
  // Neither Alice nor Dev may be attached to an external channel, even when
  // evaluating the other Agent or while the second Agent is not yet present.
  if(root.bindings!==undefined&&
     (!Array.isArray(root.bindings)||
      root.bindings.some(b=>DEV_AGENT_IDS.includes(b?.agentId))))return false;
 }
 return true;
}
const isPrivateDir=st=>st.isDirectory()&&!st.isSymbolicLink()&&
 (st.mode&0o077)===0&&(typeof process.getuid!=='function'||st.uid===process.getuid());
const isPrivateFile=st=>st.isFile()&&!st.isSymbolicLink()&&
 (st.mode&0o077)===0&&st.size<=512*1024&&
 (typeof process.getuid!=='function'||st.uid===process.getuid());
export async function inspectBoundWorkspace(agentId,{stat=lstat,canonical=realpath}={}){
 if(!validDevAgent(agentId))return 'invalid_agent';
 const dir=join(BASE,agentId);
 try{
  if(await canonical(BASE)!==BASE||!isPrivateDir(await stat(BASE))||
     await canonical(dir)!==dir||!isPrivateDir(await stat(dir))||
     !isPrivateFile(await stat(join(dir,'AGENTS.md'))))
   return 'unsafe_or_missing';
  return 'present_private';
 }catch{return 'unavailable';}
}
