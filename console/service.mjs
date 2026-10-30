import {join} from 'node:path';
import {Diagnostics,vendorEvent} from './diagnostics.mjs';
import {CONSOLE_ROOT,HEALTH_FILE,LEGACY_HEALTH_FILE} from './config.mjs';
import {discoverHealth} from './health.mjs';
import {TunnelController} from './process-control.mjs';
import {loadActivity,recentMcpEvents} from './activity.mjs';

export class ConsoleService{
 constructor({diagnostics,controller,health=()=>discoverHealth([HEALTH_FILE,LEGACY_HEALTH_FILE]),activity=loadActivity,audit=recentMcpEvents}={}){
  Object.assign(this,{diagnostics,controller,health,activity,audit});this.seen=new Set();this.listeners=new Set();this.refreshing=false;this.snapshot=null;this.timer=null;
 }
 static async create(){const diagnostics=await new Diagnostics(join(CONSOLE_ROOT,'sessions')).init();return new ConsoleService({diagnostics,controller:new TunnelController(diagnostics)});}
 async refresh(){
  if(this.refreshing)return this.snapshot;this.refreshing=true;
  try{
   const h=await this.health(),control=await this.controller.observe(h);
   for(const row of h.vendorEvents??[]){const key=h.instanceId+':'+row.seq;if(this.seen.has(key))continue;this.seen.add(key);this.diagnostics.record('tunnel_log',vendorEvent(row));}
   if(this.seen.size>5000)this.seen=new Set([...this.seen].slice(-2000));
   const prior=this.snapshot?.tunnel?.state;
   if(prior!==h.state)this.diagnostics.record('tunnel_state_changed',{state:h.state,source:'monitor'});
   let activity={projects:[],activities:[]},mcpEvents=[];
   try{activity=await this.activity();}catch{this.diagnostics.record('activity_read_failed',{level:'warn',reason:'activity_unavailable'});}
   try{mcpEvents=await this.audit();}catch{}
   const {vendorEvents,...tunnel}=h;
   this.snapshot={at:new Date().toISOString(),tunnel:{...tunnel,...control},...activity,
    events:this.diagnostics.rows.slice(-150).reverse(),mcpEvents,diagnostics:this.diagnostics.summary()};
   for(const listener of this.listeners)listener(this.snapshot);
   return this.snapshot;
  }finally{this.refreshing=false;}
 }
 async startMonitoring(){this.diagnostics.record('console_started',{source:'console',pid:process.pid});await this.refresh();this.timer=setInterval(()=>this.refresh().catch(()=>this.diagnostics.record('monitor_failed',{level:'error',reason:'monitor_refresh_failed'})),3000);return this;}
 async close(){
  clearInterval(this.timer);
  // A supervisor owns only the child it launched. Adopted external Tunnels survive.
  if(this.controller.child&&!this.controller.lastExit){
   try{const h=await this.health(),p=await this.controller.observe(h);if(p.managed)await this.controller.stop(h);}catch{this.diagnostics.record('managed_shutdown_unconfirmed',{level:'warn',reason:'managed_shutdown_unconfirmed'});}
  }
  this.controller.forgetKey();await this.diagnostics.close();
 }
}
