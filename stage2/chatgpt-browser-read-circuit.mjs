// Browser-read circuit breaker for one already-authorized ChatGPT watcher.
// Pure logic only: never calls browser, controls Chrome or reads chat content.
// A transient failure gets at most three ordinary retries; after that,
// browser calls are separated by 5/10/15-minute cooldowns. A successful
// exact-chat read clears the breaker. Access-policy denial is fail-closed.
const MAX_WAIT=15*60_000;
const MIN_WAIT=5*60_000;
const number=x=>Number.isFinite(x)&&x>=0;
export function classifyBrowserReadFailure(error){
 const code=typeof error?.code==='string'?error.code:'';
 if(code==='CHROME_RELAY_ZERO_TABS')return 'relay_zero_tabs';
 const message=typeof error?.message==='string'?error.message.slice(0,4000):'';
 if(/\b(?:host browser access denied|browser host access blocked|browser tool access denied|policy blocks browser access)\b/i.test(message))
  return 'host_access_denied';
 if(/Authorization denied|approval required|permission denied|not authorized/i.test(message))
  return 'permission_denied';
 if(/No matching|Authorized ChatGPT tab unavailable|different_chat_visible|no.*safe exact target/i.test(message))
  return 'exact_tab_missing';
 if(/invalid JSON|tab list not available/i.test(message))return 'invalid_tab_metadata';
 if(/timeout|timed out|deadline exceeded/i.test(message))return 'timeout';
 if(/browser|openclaw.*command failed|Command failed|ECONN|GatewayClientRequestError|CLI command failed|relay/i.test(message))
  return 'browser_command_failed';
 return 'unclassified';
}
export class BrowserReadCircuit{
 constructor({threshold=3,baseCooldownMs=MIN_WAIT,maxCooldownMs=MAX_WAIT}={}){
  if(!Number.isInteger(threshold)||threshold<1||threshold>8||
     !number(baseCooldownMs)||baseCooldownMs<1000||
     !number(maxCooldownMs)||maxCooldownMs<baseCooldownMs)
   throw Error('invalid_browser_circuit_policy');
  this.threshold=threshold;
  this.baseCooldownMs=baseCooldownMs;
  this.maxCooldownMs=maxCooldownMs;
  this.failures=0;this.level=0;this.nextProbeAt=0;this.halted=false;
 }
 remaining(now=Date.now()){
  if(!number(now))throw Error('invalid_clock');
  return this.halted?Infinity:Math.max(0,this.nextProbeAt-now);
 }
 recordSuccess(){
  const recovered=this.level>0||this.failures>0;
  this.failures=0;this.level=0;this.nextProbeAt=0;this.halted=false;
  return {recovered};
 }
 recordFailure(error,now=Date.now()){
  if(!number(now))throw Error('invalid_clock');
  const code=classifyBrowserReadFailure(error);
  if(this.halted)return {state:'halted',code,waitMs:Infinity,opened:false};
  if(code==='host_access_denied'||code==='permission_denied'){
   this.halted=true;this.nextProbeAt=Infinity;
   return {state:'halted',code,waitMs:Infinity,opened:true};
  }
  // After the initial threshold, perform only one browser read at each
  // cooldown boundary. No burst of repeated CLI invocations.
  this.failures++;
  if(this.level>0||this.failures>=this.threshold){
   this.level++;
   const delay=Math.min(this.maxCooldownMs,this.baseCooldownMs*this.level);
   this.nextProbeAt=now+delay;
   this.failures=0;
   return {state:'cooldown',code,waitMs:delay,opened:true,level:this.level};
  }
  return {state:'retry',code,waitMs:0,opened:false};
 }
}
export async function waitBrowserCircuit(circuit,shouldStop,{
 now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
 quantumMs=1000
}={}){
 if(typeof shouldStop!=='function'||!number(quantumMs)||quantumMs<10||
    quantumMs>10_000)throw Error('invalid_circuit_wait');
 // Permissions denied: do not make a new browser request until the worker
 // is explicitly stopped. The supervisor can be SIGTERM/SIGINT interrupted.
 while(!shouldStop()){
  const remaining=circuit.remaining(now());
  if(remaining===0)return true;
  await sleep(Number.isFinite(remaining)?Math.min(quantumMs,remaining):quantumMs);
 }
 return false;
}
