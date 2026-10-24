import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {mintBdsProcessIdentity,parseBdsSockets} from '../stage2/mint-diagnostics.mjs';
import {actionFromJson,isSafeAction} from '../stage2/protocol.mjs';

const owner=(p,pid)=>`UNCONN 0 0 0.0.0.0:${p} 0.0.0.0:* users:(("bedrock_server",pid=${pid},fd=5))`;
const socket=owner(17879,100)+'\n'+owner(17880,1712655)+'\n';
const process='1712655 1 bedrock_server Sat Oct 24 08:03:01 2026\n';
function fake(answers){
 const calls=[];
 return {calls,execute:async plan=>{
   calls.push(plan);
   return {status:'passed',output:answers[calls.length-1]};
 }};
}
test('read-only identity from fresh ports, fixed SSH, double PID check, no remote path in feedback',async()=>{
 const mock=fake([socket,process,'/home/tedz/minecraft-bedrock-alice-lab\n','/home/tedz/minecraft-bedrock-alice-lab/bedrock_server\n',process,socket]);
 const r=await mintBdsProcessIdentity({execute:mock.execute,sshTarget:'tedz@192.168.0.104'});
 assert.equal(r.status,'passed');
 const j=JSON.parse(r.output);
 assert.equal(j.pid,1712655);
 assert.equal(j.classification,'isolated_lab_directory');
 assert.equal(j.sharesProductionPort,false);
 assert.ok(j.birthTag);
 assert.ok(mock.calls.every(p=>p.bin==='ssh' && p.args[0]==='-T' && p.args[7]==='tedz@192.168.0.104' && p.timeout<=20000));
 assert.equal(mock.calls.filter(p=>p.args.at(-1).includes('ss -H')).length,2);
 assert.ok(!r.output.includes('/home/tedz/'));
});
test('production-owner comparison takes precedence over lab hypothesis',async()=>{
 const both=owner(17879,1712655)+'\n'+owner(17880,1712655);
 const mock=fake([both,process,'/home/tedz/minecraft-bedrock\n','/home/tedz/minecraft-bedrock/bedrock_server\n',process,both]);
 const r=await mintBdsProcessIdentity({execute:mock.execute,sshTarget:'tedz@192.168.0.104'});
 assert.equal(JSON.parse(r.output).classification,'production_port_owner');
});
test('invalid remote target never reaches SSH',async()=>{
 const mock=fake([]);
 const r=await mintBdsProcessIdentity({execute:mock.execute,sshTarget:'-oProxyCommand=evil'});
 assert.equal(r.status,'approval_required');
 assert.equal(mock.calls.length,0);
});
test('hidden owner remains inconclusive, not a free port',async()=>{
 const mock=fake(['UNCONN 0 0 0.0.0.0:17880 0.0.0.0:*']);
 const r=await mintBdsProcessIdentity({execute:mock.execute,sshTarget:'tedz@192.168.0.104'});
 assert.equal(r.status,'inconclusive');
 assert.equal(mock.calls.length,1);
});
test('sudo rejection never forwards a password prompt, and never launches a probe',async()=>{
 const calls=[];
 const r=await mintBdsProcessIdentity({execute:async p=>{calls.push(p);return {status:'failed',output:'sudo: a password is required'}},sshTarget:'tedz@192.168.0.104'});
 assert.equal(r.status,'approval_required');
 assert.equal(calls.length,1);
 assert.ok(!JSON.stringify(r).includes('sudo: a password'));
 assert.ok(!JSON.stringify(calls).includes('startup-probe'));
});
test('PID replacement during audit is refused without stale provenance',async()=>{
 const mock=fake([socket,process,'/home/tedz/minecraft-bedrock-alice-lab\n','/home/tedz/minecraft-bedrock-alice-lab/bedrock_server\n','1712655 1 bedrock_server Sat Oct 24 08:05:01 2026\n',socket]);
 const r=await mintBdsProcessIdentity({execute:mock.execute,sshTarget:'tedz@192.168.0.104'});
 assert.equal(r.status,'inconclusive');
 assert.equal(JSON.parse(r.output).reason,'process_or_socket_changed_during_audit');
});
test('ss parser strictly excludes other port evidence',()=>{
 assert.deepEqual(parseBdsSockets(owner(17880,1712655)),[{port:17880,owners:[{pid:1712655,process:'bedrock_server'}]}]);
 assert.throws(()=>parseBdsSockets(owner(18789,42)));
});
test('protocol is known but requires separately enabled Mint read-only flag',()=>{
 const task=actionFromJson(JSON.stringify({protocol:'ioant-mac-ops-v1',id:'mint-read-0001',action:'mint-bds-process-identity'}));
 assert.equal(task.known,true);
 assert.equal(task.authorized,false);
 assert.equal(isSafeAction(task.action),false);
 const root=resolve(import.meta.dirname,'..');
 const launcher=readFileSync(resolve(root,'scripts/chatgpt-loop.sh'),'utf8');
 const worker=readFileSync(resolve(root,'stage2/chatgpt-loop.mjs'),'utf8');
 const runner=readFileSync(resolve(root,'stage2/runner.mjs'),'utf8');
 assert.match(launcher,/--enable-mint-diagnostics/);
 assert.match(worker,/opts\.enableMintDiagnostics/);
 assert.match(worker,/Mint read-only diagnostics ioant-mac-ops-v1/);
 assert.match(runner,/options\.enableMintDiagnostics!==true/);
});
