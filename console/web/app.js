import {api,subscribe} from './api-client.js';
import {t,errorText,time,setLocale,localePreference} from './i18n.js';
import {node,renderStatus,renderActivities,renderCommunications,renderLogs} from './render.js';

const $=id=>document.getElementById(id);
const state={snapshot:null,view:'overview',pending:null,project:'all',status:'all',search:'',logLevel:'all',logSearch:'',paused:false,logRows:[],stream:false};
let toastTimer,controlAction,focusBeforeDialog,reportRow,reportOffset=0,reportNext=null,lastProjectKeys='';
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
function fail(code){$('persistent-error').textContent=errorText(code);$('persistent-error').hidden=false;}
function options(select,rows,current){select.replaceChildren(...rows.map(([value,text])=>node('option',{value},text)));select.value=current;}
function changeView(view){state.view=view;for(const name of ['overview','activity','logs'])$('view-'+name).hidden=name!==view;for(const b of $('navigation').children)b.classList.toggle('active',b.dataset.view===view);$('view-title').textContent=t('nav.'+view);}
function applyLocale(){
 setLocale(localePreference());document.querySelectorAll('[data-i18n]').forEach(e=>e.textContent=t(e.dataset.i18n));document.querySelectorAll('[data-placeholder]').forEach(e=>e.placeholder=t(e.dataset.placeholder));
 const buttons=[['overview','◫'],['activity','≡'],['logs','⇄']];
 $('navigation').replaceChildren(...buttons.map(([view,icon])=>node('button',{class:'nav-button','data-view':view,onclick:()=>changeView(view)},node('span',{class:'nav-symbol','aria-hidden':'true'},icon),t('nav.'+view))));
 const theme=localStorage.getItem('openclaw-console.theme')??'system';options($('theme'),['system','light','dark'].map(x=>[x,t('theme.'+x)]),theme);
 options($('locale'),[['system',t('locale.system')],['zh-CN','简体中文'],['en-US','English']],localePreference());
 options($('state-filter'),[['all',t('common.allStates')],...['running','accepted','passed','failed','blocked','inconclusive','connected','returned'].map(x=>[x,t('state.'+x)])],state.status);
 options($('log-filter'),[['all',t('common.allLevels')],['info','INFO'],['warn','WARN'],['error','ERROR']],state.logLevel);
 for(const id of ['dialog-cancel','report-close'])$(id).setAttribute('aria-label',t('action.cancel'));
 $('project-filter').setAttribute('aria-label',t('nav.projects'));$('state-filter').setAttribute('aria-label',t('common.allStates'));$('log-filter').setAttribute('aria-label',t('common.allLevels'));
 lastProjectKeys='';changeView(state.view);render();
}
function theme(value){if(value==='system')document.documentElement.removeAttribute('data-theme');else document.documentElement.dataset.theme=value;localStorage.setItem('openclaw-console.theme',value);}
function render(){
 const snapshot=state.snapshot;if(!snapshot)return;
 const focus=document.activeElement?.dataset?.focus;
 renderStatus(snapshot,{logs:()=>changeView('logs'),control:openControl},state.pending);
 const projectKeys=JSON.stringify(snapshot.projects.map(p=>p.key));
 if(projectKeys!==lastProjectKeys){
  const label=p=>(p.kind==='test'?t('project.test')+' · ':'')+(p.name??p.key);
  options($('project-filter'),[['all',t('common.allProjects')],...snapshot.projects.map(p=>[p.key,label(p)])],state.project);
  $('project-nav').replaceChildren(...snapshot.projects.map(p=>node('button',{class:'project-button',title:label(p)+'\n'+p.key,onclick:()=>{state.project=p.key;$('project-filter').value=p.key;changeView('activity');render();}},node('span',{class:'project-bullet'}),node('span',{},label(p)))));lastProjectKeys=projectKeys;
 }
 const activities=snapshot.activities.filter(r=>(state.project==='all'||r.project===state.project)&&(state.status==='all'||r.state===state.status)&&JSON.stringify([r.operationId,r.project,r.action,r.reason]).toLowerCase().includes(state.search.toLowerCase()));
 renderActivities($('recent-activity'),snapshot.activities.slice(0,5),openReport);renderActivities($('all-activity'),activities,openReport);renderCommunications(snapshot.mcpEvents);
 if(!state.paused)state.logRows=[...snapshot.events,...snapshot.mcpEvents].sort((a,b)=>Date.parse(b.ts)-Date.parse(a.ts));
 renderLogs(state.logRows.filter(r=>(state.logLevel==='all'||r.level===state.logLevel)&&JSON.stringify(r).toLowerCase().includes(state.logSearch.toLowerCase())).slice(0,250));
 $('log-location').textContent=t('logs.path',{path:snapshot.diagnostics.path});
 if(snapshot.diagnostics.dropped)$('log-location').textContent+=' · '+t('logs.capacity',{count:snapshot.diagnostics.dropped});
 $('last-update').textContent=t('footer.updated',{time:time(snapshot.at)});
 $('stream-status').textContent=t(state.stream?'common.connected':'common.disconnected');$('stream-status').classList.toggle('offline',!state.stream);
 if(snapshot.tunnel.rawHttpLoggingEnabled)fail('raw_http_capture_enabled');
 if(focus){const e=[...document.querySelectorAll('[data-focus]')].find(e=>e.dataset.focus===focus);e?.focus({preventScroll:true});}
}
function openControl(action){
 if(state.pending)return;
 if(action==='start'&&state.snapshot?.tunnel.hasRuntimeKey){runControl(action,{});return;}
 controlAction=action;focusBeforeDialog=document.activeElement;
 $('dialog-title').textContent=t('control.'+action+'Title');$('dialog-description').textContent=t('control.'+action+'Description');
 $('key-label').hidden=action==='stop'||state.snapshot?.tunnel.hasRuntimeKey;$('runtime-key').value='';$('dialog-error').hidden=true;
 $('dialog-submit').textContent=t('action.'+action);$('dialog-submit').className='button '+(action==='stop'?'danger':'primary');
 $('control-dialog').showModal();if(!$('key-label').hidden)$('runtime-key').focus();else $('dialog-back').focus();
}
function closeControl(){$('runtime-key').value='';$('control-dialog').close();focusBeforeDialog?.focus();}
async function runControl(action,body){
 state.pending=action;state.pendingAccepted=false;$('dialog-submit').disabled=true;$('persistent-error').hidden=true;render();
 try{const result=await api('/api/control/'+action,{method:'POST',body});state.pendingAccepted=true;state.expectedPid=result.pid;closeControl();toast(t('control.accepted'));
  // Status polling is read-only; effectful lifecycle requests are never retried.
  setTimeout(()=>{if(state.pending===action){state.pending=null;render();}},90000);
 }catch(e){state.pending=null;if($('control-dialog').open){$('dialog-error').textContent=errorText(e.code);$('dialog-error').hidden=false;}else fail(e.code);render();}
 finally{$('dialog-submit').disabled=false;$('runtime-key').value='';}
}
$('control-form').addEventListener('submit',e=>{e.preventDefault();const body=controlAction!=='stop'?{runtimeKey:$('runtime-key').value}:{};runControl(controlAction,body);});
for(const id of ['dialog-cancel','dialog-back'])$(id).onclick=closeControl;
$('control-dialog').addEventListener('cancel',()=>$('runtime-key').value='');
async function loadReport(){
 $('report-content').textContent=t('common.loading');$('report-next').disabled=true;
 const artifact=$('report-artifact').value;
 try{const r=await api('/api/report?'+new URLSearchParams({project:reportRow.project,operationId:reportRow.operationId,artifact,offset:reportOffset}));
  $('report-content').textContent=r.logText??t('report.unavailable');$('report-meta').textContent=t('report.meta',{count:r.totalCharacters??0,offset:r.offset??0,hash:r.sha256??'—'});reportNext=r.nextOffset;$('report-next').disabled=!Number.isInteger(reportNext);
 }catch(e){$('report-content').textContent=t('report.error',{code:e.code});}
}
function openReport(row){reportRow=row;reportOffset=0;$('report-title').textContent=row.operationId;options($('report-artifact'),row.artifacts.map(a=>[a.id,a.id]),'execution_log');$('report-dialog').showModal();loadReport();}
$('report-close').onclick=()=>$('report-dialog').close();$('report-artifact').onchange=()=>{reportOffset=0;loadReport();};$('report-next').onclick=()=>{if(Number.isInteger(reportNext)){reportOffset=reportNext;loadReport();}};
$('project-filter').onchange=e=>{state.project=e.target.value;render();};$('state-filter').onchange=e=>{state.status=e.target.value;render();};$('activity-search').oninput=e=>{state.search=e.target.value;render();};
$('log-filter').onchange=e=>{state.logLevel=e.target.value;render();};$('log-search').oninput=e=>{state.logSearch=e.target.value;render();};
$('pause-logs').onclick=()=>{state.paused=!state.paused;$('pause-logs').textContent=t(state.paused?'action.resume':'action.pause');render();};
$('info-logs').onclick=async()=>{const button=$('info-logs');button.disabled=true;try{await api('/api/log-level',{method:'POST',body:{level:'info'}});toast(t('control.levelUpdated'));}catch(e){fail(e.code);}finally{button.disabled=false;}};
$('export').onclick=async()=>{try{const data=await api('/api/export');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=node('a',{href:url,download:'openclaw-console-diagnostics.json'});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){fail(e.code);}};
$('locale').onchange=e=>{setLocale(e.target.value);applyLocale();};$('theme').onchange=e=>theme(e.target.value);
document.querySelectorAll('[data-go]').forEach(e=>e.onclick=()=>changeView(e.dataset.go));
window.addEventListener('error',e=>{api('/api/frontend-error',{method:'POST',body:{message:String(e.message??'frontend_failure').slice(0,1000)}}).catch(()=>{});});
window.addEventListener('unhandledrejection',()=>{api('/api/frontend-error',{method:'POST',body:{message:'unhandled_promise_rejection'}}).catch(()=>{});});
theme(localStorage.getItem('openclaw-console.theme')??'system');applyLocale();
try{state.snapshot=await api('/api/snapshot');render();}catch(e){fail(e.code);}
subscribe(snapshot=>{state.snapshot=snapshot;
 if(state.pendingAccepted&&(['start','restart'].includes(state.pending)&&(snapshot.tunnel.state==='ready'&&snapshot.tunnel.pid===state.expectedPid||snapshot.tunnel.lastExit)||state.pending==='stop'&&snapshot.tunnel.state==='stopped'))state.pending=null;
 render();},connected=>{state.stream=connected;render();});
