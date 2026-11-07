import {t,time,number,dateTime,duration} from './i18n.js';
import {taskBucket,taskTitle,elapsedMs,reviewCategory} from './task-model.js';
export function node(tag,attrs={},...children){const e=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(v===undefined||v===null)continue;if(k==='class')e.className=v;else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else if(k==='disabled'||k==='hidden')e[k]=v;else e.setAttribute(k,String(v));}for(const c of children.flat()){if(c===null||c===undefined)continue;e.append(c instanceof Node?c:document.createTextNode(String(c)));}return e;}
export function helpButton(title,paragraphs,key){
 return node('button',{class:'help-button',type:'button','aria-label':t('help.about',{title}),'data-focus':'help:'+key,onclick:e=>{
  const dialog=document.getElementById('help-dialog'),source=e.currentTarget,focus=source.dataset.focus;
  document.getElementById('help-title').textContent=title;
  document.getElementById('help-content').replaceChildren(...paragraphs.map(p=>node('p',{},p)));
  const restore=()=>{([...document.querySelectorAll('[data-focus]')].find(n=>n.dataset.focus===focus)??source).focus?.({preventScroll:true});};
  dialog.onclose=restore;document.getElementById('help-close').onclick=()=>dialog.close();dialog.showModal();document.getElementById('help-close').focus();
 }},'?');
}
const empty=(key,hint)=>node('div',{class:'empty'},t(key),hint?node('small',{},t(hint)):null);
const tone=s=>['failed','blocked','error'].includes(s)?'danger':['inconclusive','degraded','stale','running','accepted','started','starting'].includes(s)?'warn':['passed','ready','returned','connected','finished'].includes(s)?'':'neutral';
export function badge(state){return node('span',{class:'badge '+tone(state)},t('state.'+state)===('state.'+state)?state:t('state.'+state));}
export function renderStatus(snapshot,handlers,pending){
 const h=snapshot.tunnel,state=h.state??'stopped',running=Boolean(h.url);
 const label=state==='ready'?'ready':['stale','starting','stopped'].includes(state)?state:'degraded';
 const title=node('div',{class:'status-title'},node('h2',{},t('status.'+label)),helpButton(t('help.tunnel'),[t(running?'status.description':'status.stoppedDescription'),t('status.keyMemory')],'tunnel'),node('span',{class:'badge '+tone(state)},t(h.managed?'status.managed':'status.external')));
 const meta=node('div',{class:'status-meta'},node('span',{},h.pid?t('status.pid',{pid:h.pid}):t('common.unknown')),node('span',{},h.version??'Tunnel client'),node('span',{},h.url??'127.0.0.1'));
 const left=node('div',{class:'status-main'},node('div',{class:'status-orb '+(state==='ready'?'':running?'warn':'off')},state==='ready'?'✓':running?'↻':'○'),node('div',{},title,meta));
 const actions=node('div',{class:'button-row'},node('button',{class:'button secondary',onclick:handlers.logs},t('action.openLogs')),
  running?node('button',{class:'button secondary',disabled:Boolean(pending)||h.busy||!h.canStop,onclick:()=>handlers.control('restart')},t('action.restart')):null,
  node('button',{class:'button '+(running?'danger':'primary'),disabled:Boolean(pending)||h.busy||running&&!h.canStop,'data-focus':'lifecycle',onclick:()=>handlers.control(running?'stop':'start')},pending?t(pending==='start'?'control.starting':pending==='restart'?'control.restarting':'control.stopping'):t(running?'action.stop':'action.start')));
 document.getElementById('tunnel-status').replaceChildren(left,actions);
 const metrics=[['poll',h.lastPollAgeSeconds,t('common.seconds')],['commands',h.metrics?.polled,''],['queue',h.metrics?.queue,'/ '+number(h.metrics?.queueCapacity)]];
 document.getElementById('metrics').replaceChildren(...metrics.map(([key,value,unit])=>node('div',{class:'metric'},node('div',{class:'metric-label with-help'},t('metric.'+key),helpButton(t('metric.'+key),[t('metric.'+key+'Hint')],'metric:'+key)),node('div',{class:'metric-value'},number(value),node('span',{class:'metric-unit'},unit)))));
 const names=[['chat','✳'],['openai','↗'],['tunnel','⇄'],['mcp','⌘'],['executor','>_']],flow=[];
 for(const [i,[key,symbol]] of names.entries()){if(i)flow.push(node('div',{class:'flow-line '+(state==='ready'?'live':'')}));flow.push(node('div',{class:'flow-node'},node('div',{class:'flow-icon'},symbol),node('strong',{},t('flow.'+key)),node('small',{},t('flow.'+key+'Hint'))));}
 document.getElementById('connection-flow').replaceChildren(...flow);
}
function timing(row,live){
 let {submittedAt,startedAt,finishedAt}=row;
 // A running console can serve newer assets before its receipt reader reloads.
 if(!Object.hasOwn(row,'submittedAt')&&row.kind==='computer'&&(row.asynchronous||row.orphanedLease)){
  submittedAt=startedAt;startedAt=null;
 }
 if(!Object.hasOwn(row,'submittedAt')&&row.kind==='execution'&&
  (row.state==='accepted'||['project_execution_busy','project_runner_not_started','project_action_not_enabled'].includes(row.reason))){
  submittedAt=startedAt;startedAt=null;
 }
 const items=[
  ...(submittedAt?[['submitted',submittedAt]]:[]),['started',startedAt],['finished',finishedAt]
 ];
 const total=elapsedMs(submittedAt??startedAt,finishedAt,live);
 return node('div',{class:'task-timing'},...items.map(([label,value])=>node('span',{},t('timing.'+label),' ',
  node('time',{datetime:Number.isFinite(Date.parse(value))?value:undefined},dateTime(value)))),
  node('span',{},t(live&&!finishedAt?'timing.live':submittedAt?'timing.total':'timing.execution'),' ',duration(total)));
}
function executionStep(step,live){
 return node('div',{class:'execution-step'},badge(step.state),
  node('code',{},[step.name,step.runtime,step.script].filter(Boolean).join(' · ')),
  Number.isInteger(step.exitCode)?node('small',{},'exit '+step.exitCode):null,
  timing(step,live&&step.state==='running'));
}
export function renderReportTiming(target,row){
 const live=taskBucket(row)==='running';
 target.replaceChildren(timing(row,live),...(row.steps??[]).map(step=>executionStep(step,live)));
}
export function renderActivities(target,rows,onReport){
 const expanded=new Set([...target.querySelectorAll('details[open]')].map(e=>e.dataset.operation));
 target.replaceChildren(...(rows.length?rows.map(r=>{
  const bucket=taskBucket(r),label=taskTitle(r);
  const titleText=label?(!r.taskFile&&['repository_task','repository_fetch','repository_sync'].includes(label)?t('queue.action.'+label):label):t('activity.'+r.kind);
  const title=node('div',{class:'activity-top'},node('span',{class:'activity-name'},titleText),r.archived?node('span',{class:'badge neutral'},t('history.archived')):null,badge(bucket==='queued'?'queued':bucket==='attention'?'issue_'+reviewCategory(r):r.state),bucket==='attention'?helpButton(t('queue.tab.attention'),[t('review.meaning'),t('review.reason.'+reviewCategory(r)),r.reason??t('review.reason.legacy'),t('review.next')],r.id):null);
  const actions=node('div',{class:'activity-footer'},node('code',{title:r.operationId},r.operationId),r.kind==='execution'&&r.artifacts?.length?node('button',{class:'text-button','data-focus':r.id,onclick:()=>onReport(r)},t('activity.report')):null);
  const used=node('div',{class:'capability-list'},node('span',{},t('capabilities.used')),
  ...(r.toolsUsed?.successful?.length?r.toolsUsed.successful.map(x=>node('code',{},x)):[node('span',{},t(r.toolsUsed?.evidence==='unavailable'?'capabilities.unknown':'capabilities.none'))]));
  const steps=r.steps?.length?node('details',{class:'execution-steps','data-operation':r.id,open:expanded.has(r.id)?true:undefined},node('summary',{'data-focus':r.id+':steps'},t('capabilities.steps')),...r.steps.map(s=>executionStep(s,bucket==='running'))):null;
  const detail=r.steps?.length?t('activity.steps',{done:r.steps.filter(s=>s.state==='passed').length,total:r.steps.length}):r.reason??'';
  const usage=node('div',{class:'task-usage'},
   node('span',{},t(r.kind==='computer'?'queue.localLane':r.kind==='execution'?'queue.fixedLane':'queue.connectionLane')),
   Number.isFinite(r.agentDurationMs)?node('span',{},t('queue.agentDuration',{seconds:Math.round(r.agentDurationMs/1000)})):null,
   node('span',{},t(r.modelInferenceInvoked===true?'queue.modelUsed':r.modelInferenceInvoked===false?'queue.modelNotUsed':'queue.modelUnknown')),
   r.queuePosition?node('span',{class:'badge warn'},t('queue.position',{position:r.queuePosition})):null,
   r.inferenceLaneHeld||r.orphanedLease?node('span',{class:'badge warn'},t('queue.held')):null,
   r.schedulerObserved&&bucket==='attention'&&r.kind==='computer'&&!r.reservationHeld&&!r.activeReservation?node('span',{},t('queue.noCurrentSlot')):null,
   r.kind==='computer'?node('span',{},t('queue.tokensUnknown')):null);
  return node('div',{class:'activity-row','data-operation-id':r.operationId},node('span',{class:'activity-icon'},r.kind==='execution'?'>_':r.kind==='connect'?'↗':r.kind==='remove'?'−':'⌖'),node('div',{class:'activity-content'},title,node('p',{class:'activity-project',title:r.project},r.projectName??r.project),node('small',{class:'task-project-key'},r.project),node('div',{class:'activity-footer'},node('span',{},detail),r.commit?node('span',{},r.commit.slice(0,8)):null),timing(r,bucket==='running'||bucket==='queued'),usage,used,steps,actions));
 }):[empty('activity.empty')]));
}
export function renderCommunications(rows){
 const target=document.getElementById('recent-communications');const completed=rows.filter(x=>x.event==='mcp_call_finished').slice(0,6);
 target.replaceChildren(...(completed.length?completed.map(r=>node('div',{class:'communication-row'},node('span',{class:'communication-dot'}),node('div',{},node('p',{},r.tool??r.event),node('small',{},[time(r.ts),r.project??'GLOBAL',r.durationMs!==undefined?r.durationMs+' ms':'',r.state??''].filter(Boolean).join(' · '))))):[empty('communications.empty','communications.hint')]));
}
export function renderLogs(rows){
 document.getElementById('log-feed').replaceChildren(...(rows.length?rows.map(r=>node('div',{class:'log-row'},node('time',{},time(r.ts)),node('span',{class:'log-level '+r.level},r.level.toUpperCase()),node('div',{class:'log-message'},[r.tool??r.event,r.state,r.reason,r.project,r.operationId,r.message].filter(Boolean).join(' · ')))):[empty('logs.noEvents')]));
}

function permissionBadge(key,value){
 const state=value===true?'enabled':value===false?'disabled':'unverified';
 return node('span',{class:'badge '+(value===true?'':value===false?'neutral':'warn')},
  node('span',{'aria-hidden':'true'},value===true?'✓':value===false?'○':'?'),
  t('permissions.status',{name:t('permissions.'+key),state:t('permissions.'+state)}));
}
export function renderPermissions(projects){
 const target=document.getElementById('project-access');
 target.replaceChildren(node('div',{class:'section-heading'},node('div',{},node('h2',{},t('permissions.title')),node('p',{},t('permissions.description')))),
 ...projects.map(p=>{
  const full=p.permissions?.toolAccess==='full';
  const native=full?true:['advisor','computer'].includes(p.permissions?.toolAccess)?false:null;
  return node('div',{class:'permission-row'},node('div',{},node('strong',{},p.name??p.key),node('small',{class:'permission-identity'},p.key+' · '+p.agent)),
   node('div',{class:'button-row'},permissionBadge('full',full?true:native===false?false:null),
    permissionBadge('computer',p.permissions?.computer),
    ...['runtime','files','browser'].map(k=>permissionBadge(k,native)),
    permissionBadge('repository',p.permissions?.repositoryTask)));
 }));
}

export function renderHistory(project,onArchive,onBrowse,pending=false){
 const h=project.history,target=document.getElementById('project-history');
 if(h?.state!=='observed'){
  target.replaceChildren(node('div',{class:'section-heading'},node('div',{},node('h2',{},t('history.title')),node('p',{},t('history.unavailable')))));return;
 }
 const stats=[[t('history.total'),number(h.hotCount+h.archivedCount)],
  [t('history.archived'),number(h.archivedCount)],[t('history.active'),number(h.activeCount)],
  [t('history.uncertain'),number(h.uncertainCount)],[t('history.bytes'),(h.trackedBytes/1048576).toFixed(2)+' MiB']];
 const heading=node('div',{class:'section-heading'},
  node('div',{},node('h2',{},t('history.title')),node('p',{},t('history.description'))),
  node('div',{class:'button-row'},node('button',{class:'button secondary',onclick:onBrowse},t('history.browse')),
   node('button',{class:'button secondary',disabled:pending||!h.archiveAllowed||h.settledCount<=100,onclick:onArchive},t('history.archive'))));
 const capacity=node('div',{class:'history-capacity'},
  node('strong',{},t('history.hotCount',{count:h.hotCount,limit:h.limit})),
  node('span',{class:h.remaining===0?'badge danger':'badge neutral'},t(h.remaining===0?'history.full':'history.remaining',{count:h.remaining})));
 const body=node('div',{class:'history-body'},capacity,
  node('progress',{max:h.limit,value:h.hotCount,'aria-label':t('history.title')}),
  node('div',{class:'history-stats'},...stats.map(([k,v])=>node('div',{},node('small',{},k),node('strong',{},v)))));
 target.replaceChildren(heading,body,node('p',{class:'panel-footer'},t(!h.archiveAllowed?'history.busy':'history.preserve')));
}
