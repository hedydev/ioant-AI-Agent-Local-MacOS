import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,chmod,realpath,readFile,readdir,rm,writeFile,symlink} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Diagnostics,safeEvent,vendorEvent} from '../console/diagnostics.mjs';
import {privateRead} from '../console/private-files.mjs';
import {observeMcpCall} from '../integrations/chatgpt-openclaw/observability.mjs';
import {outputCollector} from '../console/external-output.mjs';
async function temp(t){const p=await realpath(await mkdtemp(join(tmpdir(),'console-logs-')));await chmod(p,0o700);t.after(()=>rm(p,{recursive:true,force:true}));return p;}
test('console diagnostics persist redacted event metadata and omit arbitrary fields',async t=>{
 const root=await temp(t),d=await new Diagnostics(root).init();
 d.record('test_event',{message:'password=private-fixture-value Bearer abcdefghijklmnopqrstuvwxyz',runtimeKey:'private',project:'valid-project',env:{SECRET:'not allowed'}});await d.flush();
 const text=await readFile(join(d.dir,'events.jsonl'),'utf8');assert.equal(text.includes('private-fixture-value'),false);assert.equal(text.includes('abcdefghijklmnopqrstuvwxyz'),false);assert.equal(text.includes('SECRET'),false);assert.match(text,/valid-project/);await d.close();
 assert.ok((await readdir(d.dir)).includes('closed.json'));
 const v=vendorEvent({message:'ok',attrs:{authorization:'secret',headers:{token:'secret'},tunnel_request_id:'req-123'}});assert.equal(v.requestId,'req-123');assert.equal(v.authorization,undefined);
});
test('private log/report readers reject symbolic links and public permissions',async t=>{
 const root=await temp(t),p=join(root,'public.json');await writeFile(p,'{}',{mode:0o644});await chmod(p,0o644);await assert.rejects(privateRead(p),/private_file/);
 await chmod(p,0o600);await symlink(p,join(root,'link.json'));await assert.rejects(privateRead(join(root,'link.json')));
});
test('MCP observability logs identifiers and outcomes without arguments or report bodies',async()=>{
 const events=[],log={record:(event,fields)=>events.push(safeEvent(event,fields)),flush:async()=>{}};
 const args={project_key:'project',operation_id:'operation_123',message:'private-chat-body',runtimeKey:'private-runtime'};
 const reply={content:[{type:'text',text:JSON.stringify({state:'report',logText:'private-report-body',password:'private'})}]};
 assert.equal(await observeMcpCall('openclaw_project_report',args,async()=>reply,{log}),reply);
 assert.equal(events.length,2);assert.equal(events[0].requestId,events[1].requestId);assert.equal(events[1].state,'report');
 for(const s of ['private-chat-body','private-report-body','private-runtime'])assert.equal(JSON.stringify(events).includes(s),false);
 await assert.rejects(observeMcpCall('tool',{},async()=>{throw Error('secret error');},{log}),/secret error/);assert.equal(events.at(-1).reason,'tool_exception');assert.equal(JSON.stringify(events).includes('secret error'),false);
});
test('external output does not leak split private-key blocks or overlong line suffixes',()=>{
 const rows=[],c=outputCollector(x=>rows.push(x));c.write(Buffer.from('-----BEGIN OPENSSH PRIVATE KEY-----\nprivate material\n'));c.write(Buffer.from('more private\n-----END OPENSSH PRIVATE KEY-----\n'));
 c.write(Buffer.from('x'.repeat(9000)));c.write(Buffer.from('must-never-appear\n'));c.write(Buffer.from('visible\n'));c.end();
 assert.equal(rows.join('\n').includes('private material'),false);assert.equal(rows.join('\n').includes('more private'),false);assert.equal(rows.join('\n').includes('must-never-appear'),false);assert.match(rows.join('\n'),/visible/);
});
