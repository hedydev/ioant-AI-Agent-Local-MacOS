#!/usr/bin/env node
import {ConsoleService} from '../console/service.mjs';
import {createConsoleServer} from '../console/http-server.mjs';
import {PORT} from '../console/config.mjs';

if(process.argv.length!==2){console.error('Usage: node scripts/tunnel-console.mjs');process.exit(1);}
const service=await ConsoleService.create();await service.startMonitoring();
const {server,origin}=createConsoleServer(service,{port:PORT});
server.on('error',async e=>{console.error(e.code==='EADDRINUSE'?'Console port 18489 is already in use.':'Console server failed.');await service.close();process.exitCode=1;});
await new Promise((ok,bad)=>{server.once('error',bad);server.listen(PORT,'127.0.0.1',ok);});
console.log('OpenClaw Console: '+origin);
console.log('Private diagnostic logs: '+service.diagnostics.dir);
console.log('The existing Tunnel is monitored without restart. Runtime keys stay in memory only.');
let closing=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{
 if(closing)return;closing=true;server.closeAllConnections();server.close();await service.close();process.exit(0);
});
