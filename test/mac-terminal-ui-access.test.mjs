import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {actionFromJson,extractAction,responseForTask} from '../stage2/protocol.mjs';
import {actionPlan,runAction} from '../stage2/runner.mjs';
import {runMacTerminal} from '../stage2/mac-terminal-access.mjs';
import {windowTextScript,focusedEditorKeysScript,runWindowText,runNativeAX,NATIVE_AX_HELPER,OPENCLAW_NATIVE_BUNDLE} from '../stage2/mac-window-text.mjs';

const CHAT='https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/6adf6584-1a40-83ec-a4ab-c59ac7e28cf7';
const CONVERSATION='6adf6584-1a40-83ec-a4ab-c59ac7e28cf7';
const task=(id,action,more={})=>({protocol:'ioant-mac-ops-v1',id,action,...more});

test('terminal task allows only registered cwd aliases and bounded structured commands',()=>{
 const p=actionFromJson(JSON.stringify(task('mac-terminal-1001','mac-terminal',{
  cwd:'workspace',command:'git status --short'
 })));
 assert.equal(p.known,true);
 assert.equal(p.authorized,false); // grant checked at execution, never broad automatic permit
 assert.equal(p.cwd,'workspace');
 assert.equal(p.command,'git status --short');
 for(const cwd of ['/','~','/Users/ted/Desktop','../Desktop','workspace/other']){
  assert.throws(()=>actionFromJson(JSON.stringify(task('mac-terminal-1002','mac-terminal',
   {cwd,command:'pwd'}))),/Malformed/);
 }
 for(const bad of [{cmd:'touch /tmp/FAKE'}, {cwd:'workspace',command:' '},
  {cwd:'desktop',command:'a'.repeat(2200)},
  {cwd:'desktop',command:'pwd',auth:'grant'}]){
  assert.throws(()=>actionFromJson(JSON.stringify(task('mac-terminal-1003','mac-terminal',bad))),/Malformed/);
 }
 assert.equal(actionPlan('mac-terminal','/repo'),null);
});

test('GUI task requires registered alias, text and explicit submit boolean',()=>{
 const t=actionFromJson(JSON.stringify(task('mac-gui-1001','mac-window-text',{
  app:'openclaw',text:'请列出当前状态',submit:false
 })));
 assert.equal(t.known,true);assert.equal(t.authorized,false);
 assert.deepEqual([t.app,t.text,t.submit],['openclaw','请列出当前状态',false]);
 for(const extra of [{app:'openclaw',text:'ok'},
  {app:'Finder',text:'ok',submit:true},
  {app:'openclaw',text:'bad\nnext',submit:true},
  {app:'openclaw',text:'ok',submit:'yes'},
  {app:'openclaw',text:'ok',submit:true,bundleId:'com.bad'}]){
  assert.throws(()=>actionFromJson(JSON.stringify(task('mac-gui-1002',
   'mac-window-text',extra))),/Malformed/);
 }
 assert.equal(actionPlan('mac-window-text','/repo'),null);
});

test('protocol uses latest assistant message and only one executable task',()=>{
 const t=task('terminal-in-chat-001','mac-terminal',{cwd:'downloads',command:'ls'});
 const msg={url:CHAT,generating:false,messages:[{codes:[JSON.stringify(t)]}]};
 assert.equal(extractAction(msg).task.command,'ls');
 assert.equal(extractAction({...msg,messages:[{codes:[]},{codes:[JSON.stringify(t)]}]}).status,'task');
 assert.equal(extractAction({...msg,messages:[{codes:[JSON.stringify(t)]},{codes:[]}]}).status,'idle');
});

test('terminal denied without grant before spawning any process',async()=>{
 let called=0;
 const x=await runMacTerminal({action:'mac-terminal',cwd:'desktop',command:'pwd'},
  {conversationUrl:CHAT,authorize:async()=>({state:'disabled',reason:'operator_grant_required'}),
   execute:()=>{called++;throw Error('spawn forbidden')}});
 assert.equal(x.status,'approval_required');
 assert.equal(called,0);
});

test('terminal uses /bin/zsh without shell:true, strips injected credentials and has bounds',async()=>{
 const vars={OPENCLAW_GATEWAY_TOKEN:'SUPER_SECRET_TOKEN',MY_API_KEY:'SUPERSENSITIVE',PATH:'/usr/bin'};
 const saved={};
 for(const [k,v] of Object.entries(vars)){saved[k]=process.env[k];process.env[k]=v;}
 let opts,argv,bin;
 try{
  const result=await runMacTerminal({action:'mac-terminal',cwd:'workspace',command:'pwd'},
   {conversationUrl:CHAT,authorize:async()=>({state:'enabled'}),
    rootResolve:async()=>'/Users/ted/Documents/workspace',
    execute:(program,args,options)=>{
     bin=program;argv=args;opts=options;
     const child=new EventEmitter();
     child.pid=21877;
     child.stdout=new EventEmitter();child.stderr=new EventEmitter();
     queueMicrotask(()=>{
      child.stdout.emit('data',Buffer.from('a'.repeat(4000)));
      child.emit('close',0);
     });
     return child;
    }});
  assert.equal(result.status,'passed');
  assert.equal(result.exitCode,0);
  assert.equal(result.output.length,2400);
  assert.equal(bin,'/bin/zsh');
  assert.deepEqual(argv,['-f','-c','pwd']);
  assert.equal(opts.shell,false);
  assert.equal(opts.detached,true);
  assert.equal(opts.cwd,'/Users/ted/Documents/workspace');
  assert.equal(opts.env.OPENCLAW_GATEWAY_TOKEN,undefined);
  assert.equal(opts.env.MY_API_KEY,undefined);
 }finally{for(const [k,v] of Object.entries(saved))if(v===undefined)delete process.env[k];else process.env[k]=v;}
});

test('GUI script demands app identity, frontmost window and focused text field',()=>{
 const app={name:'OpenClaw',bundleId:'com.ioant.openclaw'};
 const src=windowTextScript(app,'Hello "OpenClaw" \\ do not run shell',true);
 assert.match(src,/first application process whose frontmost is true/);
 assert.match(src,/bundle identifier of focusedApp/);
 assert.match(src,/AXFocusedUIElement/);
 assert.match(src,/AXTextArea/);
 assert.match(src,/key code 36/);
 assert.match(src,/Hello \\"OpenClaw\\" \\\\ do not run shell/);
 assert.doesNotMatch(src,/do shell script/); // script has quoted literal, not AppleScript command
 assert.doesNotMatch(windowTextScript(app,'hello',false),/key code 36/);
 assert.throws(()=>windowTextScript({...app,name:'Bad"\nName'},'hello',true),/invalid_window_task/);
});

test('GUI denied without registered app and before AppleScript is run',async()=>{
 let ran=0;
 const opts={conversationUrl:CHAT,context:async()=>({conversationId:CONVERSATION}),
  readGrant:async()=>({state:'enabled',conversationId:CONVERSATION,
   apps:[{alias:'openclaw',name:'OpenClaw',bundleId:'com.ioant.openclaw'}]}),
  run:async()=>{ran++;return {ok:true,value:'IOANT_UI_KEYS_SENT'}}};
 const t={action:'mac-window-text',app:'finder',text:'hi',submit:false};
 assert.equal((await runWindowText(t,opts)).status,'approval_required');
 assert.equal(ran,0);
 assert.equal((await runWindowText({...t,app:'openclaw'},{
  ...opts,readGrant:async()=>({state:'enabled',conversationId:'00000000-0000-0000-0000-000000000000',
  apps:[{alias:'openclaw',name:'OpenClaw',bundleId:'com.ioant.openclaw'}]})
 })).status,'approval_required');
 assert.equal(ran,0);
});

test('GUI success proves keystroke simulation only, not actual app message delivery',async()=>{
 let script='';
 const t={action:'mac-window-text',app:'openclaw',text:'你好，OpenClaw',submit:true};
 const opts={conversationUrl:CHAT,context:async()=>({conversationId:CONVERSATION}),
  readGrant:async()=>({state:'enabled',conversationId:CONVERSATION,
   apps:[{alias:'openclaw',name:'OpenClaw',bundleId:'com.ioant.openclaw'}]}),
  run:async s=>{script=s;return {ok:true,value:'IOANT_UI_KEYS_SENT'}}};
 const r=await runWindowText(t,opts);
 assert.equal(r.status,'passed');
 const report=JSON.parse(r.output);
 assert.equal(report.deliveryConfirmed,false);
 assert.equal(report.submitRequested,true);
 assert.doesNotMatch(r.output,/你好/);
 assert.match(script,/keystroke "你好，OpenClaw"/);
 const inconclusive=await runWindowText(t,{...opts,run:async()=>({ok:false,reason:'ui_permission_or_focus_failure'})});
 assert.equal(inconclusive.status,'inconclusive');
});

test('unknown or blocked requests cannot bypass the runner with freeform shell',async()=>{
 const r=await runAction('shell','/repo',{terminalTask:{command:'pwd',cwd:'workspace'}});
 assert.equal(r.status,'approval_required');
 const l=responseForTask({id:'terminal-test-01',action:'mac-terminal'},
  {status:'approval_required',reason:'terminal_grant_required'},'abc12345');
 assert.match(l,/terminal_grant_required/);
});

test('terminal failed child exits promptly with a bounded error receipt, without leaking timer',async()=>{
 const result=await runMacTerminal({action:'mac-terminal',cwd:'downloads',command:'false'},{
  conversationUrl:CHAT,
  authorize:async()=>({state:'enabled'}),
  rootResolve:async()=>'/Users/ted/Downloads',
  execute:()=>{
   const child=new EventEmitter();child.pid=22001;
   child.stdout=new EventEmitter();child.stderr=new EventEmitter();
   queueMicrotask(()=>{
    child.stderr.emit('data',Buffer.from('expected test error'));
    child.emit('close',12);
   });
   return child;
  }
 });
 assert.equal(result.status,'failed');
 assert.equal(result.exitCode,12);
 assert.equal(result.output,'expected test error');
 assert.ok(Number.isInteger(result.elapsedMs)&&result.elapsedMs>=0);
});

test('GUI auto-activates only enrolled app, validates exact frontmost ID and focused editor',()=>{
 const app={name:'OpenClaw',bundleId:'org.example.openclaw'};
 const script=windowTextScript(app,'测试自动激活',false);
 const identityAt=script.indexOf('if (bundle identifier of targetApp) is not');
 const activateAt=script.indexOf('tell application id "org.example.openclaw" to activate');
 const checkAt=script.indexOf('set finalApp to (first application process whose frontmost is true)');
 const typingAt=script.indexOf('keystroke "测试自动激活"');
 assert.ok(identityAt>=0&&identityAt<activateAt&&activateAt<checkAt&&checkAt<typingAt);
 assert.match(script,/set targetApps to \(every application process whose name is "OpenClaw"\)/);
 assert.match(script,/if \(count of targetApps\) is not 1 then error number 9030/);
 assert.match(script,/if \(count of editableItems\) is not 1 then error number 9034/);
 assert.match(script,/set focused of focusedItem to true/);
 assert.match(script,/if \(count of uiItems\) > 1200 then error number 9035/);
 assert.match(script,/return "IOANT_UI_ERR_INPUT_AMBIGUOUS"/);
 assert.match(script,/repeat 12 times/);
 assert.doesNotMatch(script,/click at|do shell script|set the clipboard|System Events" to activate/);
 assert.doesNotMatch(script,/key code 36/);
});

test('GUI returns a specific bounded focus failure and never reports delivery',async()=>{
 const t={action:'mac-window-text',app:'openclaw',text:'中文测试',submit:false};
 const opts={conversationUrl:CHAT,context:async()=>({conversationId:CONVERSATION}),
  readGrant:async()=>({state:'enabled',conversationId:CONVERSATION,
   apps:[{alias:'openclaw',name:'OpenClaw',bundleId:'org.example.openclaw'}]}),
  run:async()=>({ok:true,value:'IOANT_UI_ERR_INPUT_AMBIGUOUS',reason:'ok'})};
 const r=await runWindowText(t,opts);
 assert.equal(r.status,'inconclusive');
 assert.equal(r.reason,'target_input_unfocused_or_ambiguous');
 assert.equal(r.output,undefined);
 const a=await runWindowText(t,{...opts,
  run:async()=>({ok:true,value:'IOANT_UI_ERR_TARGET_NOT_FRONTMOST',reason:'ok'})});
 assert.equal(a.reason,'target_not_frontmost_after_activation');
});

test('native OpenClaw path always validates AX focus before generating keystrokes',async()=>{
 const t={action:'mac-window-text',app:'openclaw',text:'原生AX验证',submit:false};
 let typed=0,axCalled=0,jsScript='';
 const opts={conversationUrl:CHAT,context:async()=>({conversationId:CONVERSATION}),
  readGrant:async()=>({state:'enabled',conversationId:CONVERSATION,
   apps:[{alias:'openclaw',name:'OpenClaw',bundleId:'ai.openclaw.mac'}]}),
  axRun:async(mode,bundle)=>{axCalled++;assert.equal(mode,'focus');
   assert.equal(bundle,'ai.openclaw.mac');return {ok:true,value:'AX_FOCUS_READY'}},
  run:async script=>{jsScript=script;typed++;return {ok:true,value:'IOANT_UI_KEYS_SENT'}}};
 const r=await runWindowText(t,opts);
 assert.equal(r.status,'passed');
 assert.equal(axCalled,1);
 assert.equal(typed,1);
 assert.match(jsScript,/AXFocusedUIElement/);
 assert.match(jsScript,/keystroke "原生AX验证"/);
 assert.doesNotMatch(jsScript,/entire contents|key code 36|activate/);
 const failed=await runWindowText(t,{...opts,axRun:async()=>({ok:false,reason:'ax_editor_not_found'}),
  run:async()=>{throw Error('must not type after native failure')}});
 assert.equal(failed.status,'inconclusive');
 assert.equal(failed.reason,'ax_editor_not_found');
});

test('native AX rejects other app IDs before spawning external code',async()=>{
 let executed=false;
 const r=await runNativeAX('focus','com.example.not-openclaw',{execute:()=>{
   executed=true;throw Error('spawn should not happen')}});
 assert.equal(executed,false);
 assert.equal(r.ok,false);
 assert.equal(OPENCLAW_NATIVE_BUNDLE,'ai.openclaw.mac');
 const s=focusedEditorKeysScript({name:'OpenClaw',bundleId:'ai.openclaw.mac'},'hello',false);
 assert.match(s,/keystroke "hello"/);
 assert.doesNotMatch(s,/key code 36|entire contents|do shell script/);
});

test('native AX Swift source stays bounded and compiles on macOS',()=>{
 const source=readFileSync(NATIVE_AX_HELPER,'utf8');
 assert.match(source,/kAXWindowsAttribute/);
 assert.match(source,/kAXChildrenAttribute/);
 assert.match(source,/AXTextArea/);
 assert.match(source,/AX_EDITOR_AMBIGUOUS/);
 assert.match(source,/AX_EDITOR_NOT_EMPTY/);
 assert.match(source,/AXIsProcessTrusted/);
 assert.match(source,/CFGetTypeID\(focus\) == AXUIElementGetTypeID\(\)/);
 assert.doesNotMatch(source,/as\? AXUIElement/);
 assert.match(source,/nodes\.count >= 400/);
 assert.doesNotMatch(source,/print\(.*(?:kAXValueAttribute|existingValue)|CGEventPost|write\(to:/);
 if(process.platform==='darwin'){
  const r=spawnSync('/usr/bin/swiftc',['-typecheck',NATIVE_AX_HELPER],
   {timeout:85000,encoding:'utf8',maxBuffer:1024*1024});
  assert.equal(r.status,0,
   'Swift helper must type-check on macOS; first error: '+(r.stderr||'').slice(0,2800));
 }
});
