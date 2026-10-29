import test from 'node:test';
import assert from 'node:assert/strict';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sharedTunnelProfile} from '../scripts/configure-direct-shared-tunnel.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const command=join(homedir(),'.openclaw/tools/node/bin/node')+' '+join(root,'integrations/chatgpt-openclaw/server.mjs');
const profile=()=>({control_plane:{api_key:'env:CONTROL_PLANE_API_KEY',tunnel_id:'private-tunnel-reference'},
 mcp:{commands:[{channel:'main',command}]},health:{listen_addr:'127.0.0.1:0'}});
test('shared profile preparation changes only the fixed command args and preserves credential references',()=>{
 const c=profile(),before=structuredClone(c),p=sharedTunnelProfile(c);
 assert.deepEqual(c,before);
 assert.equal(p.mcp.commands[0].command,command+' --shared-projects openclaw-workflow,alice-ai');
 p.mcp.commands[0].command=command;assert.deepEqual(p,before);
 assert.deepEqual(sharedTunnelProfile(sharedTunnelProfile(c)),sharedTunnelProfile(c));
});
test('unexpected commands, literal credentials and extra channels require review',()=>{
 for(const change of [c=>c.control_plane.api_key='literal-sensitive-value',
  c=>c.mcp.commands[0].command='arbitrary-command',c=>c.mcp.commands[0].channel='other',
  c=>c.mcp.commands.push({channel:'other',command})]){
  const c=profile();change(c);assert.throws(()=>sharedTunnelProfile(c),/requires_review/);
 }
});
