import {node,helpButton} from './render.js';
import {t,number} from './i18n.js';
import {TASK_TABS,taskBucket,taskCounts,projectName,reviewSummary} from './task-model.js';
function reviewHelp(rows){
 const s=reviewSummary(rows);
 return [t('review.meaning'),t('review.count',{total:s.total,held:s.held}),...Object.entries(s.reasons).map(([reason,count])=>t('review.breakdown',{reason:t('review.reason.'+reason),count})),t('review.next')];
}
export function renderTaskTabs(target,rows,selected,onSelect){
 const counts=taskCounts(rows);
 const strip=node('div',{role:'tablist','aria-label':t('queue.title'),class:'task-tab-strip'});
 strip.append(...TASK_TABS.map((key,index)=>node('button',{
  class:'task-tab'+(selected===key?' active':''),role:'tab','aria-selected':selected===key,
  tabindex:selected===key?'0':'-1','data-focus':target.id+':'+key,
  onclick:()=>onSelect(key),onkeydown:e=>{
   const next=e.key==='ArrowRight'?(index+1)%4:e.key==='ArrowLeft'?(index+3)%4:e.key==='Home'?0:e.key==='End'?3:null;
   if(next!==null){e.preventDefault();onSelect(TASK_TABS[next]);target.querySelector('[role=tablist]')?.children[next]?.focus();}
  }
 },t('queue.tab.'+key),node('span',{},counts[key]))));
 target.replaceChildren(strip,helpButton(t('queue.tab.attention'),reviewHelp(rows),target.id+':review'));
}
export function renderQueueSummary(target,snapshot){
 const n=snapshot.scheduler?.native,known=n?.state==='observed',rows=snapshot.activities;
 const names=new Map(snapshot.projects.map(p=>[p.key,projectName(p)]));
 const held=known?n.reservations.length:null;
 const waiting=known?n.reservations.filter(r=>r.project!==n.active?.project||r.operationId!==n.active?.operationId).length:null;
 const activeRow=n?.active?rows.find(r=>r.kind==='computer'&&r.project===n.active.project&&r.operationId===n.active.operationId):null;
 const laneState=!known?'—':!n.active?t('queue.idle'):activeRow&&taskBucket(activeRow)==='attention'?t('queue.blocked'):t('queue.running');
 const residency=snapshot.scheduler?.modelResidency,models=residency?.models??[],bytes=models.reduce((sum,m)=>sum+(m.residentBytes??0),0);
 const memory=residency?.state==='observed'&&models.every(m=>Number.isFinite(m.residentBytes))?(bytes/1073741824).toFixed(1)+' GiB':'—';
 const stats=[['occupied',laneState],['waiting',number(waiting)],['free',known?held+' / '+n.capacity:'—'],['scripts',number(rows.filter(r=>r.kind==='execution'&&taskBucket(r)==='running').length)],['memory',memory]];
 let waitingIndex=0;
 const slots=known?n.reservations.map(r=>{
  const active=r.project===n.active?.project&&r.operationId===n.active?.operationId;
  const row=r&&rows.find(x=>x.project===r.project&&x.operationId===r.operationId&&x.kind==='computer');
  return node('div',{class:'queue-slot '+(r?(active?'occupied':'waiting'):'free')},node('small',{},active?t('queue.currentComputer'):t('queue.position',{position:++waitingIndex})),
   node('strong',{},r?(names.get(r.project)??r.project):t('queue.available')),
   node('span',{},r?t(row&&taskBucket(row)==='attention'?'queue.held':active?'queue.occupied':'queue.waiting'):t('queue.noReservation')),
   r?node('code',{title:r.operationId},r.operationId):null);
 }):[];
 const explanations=[t('queue.subtitle'),t('queue.nativePolicy',{wait:n?.queueWaitSeconds??'—',run:n?.runBudgetSeconds??'—'}),t('queue.scriptPolicy'),t('queue.memoryHint',{models:residency?.state==='observed'?(models.map(m=>m.name).join(', ')||t('queue.noModel')):t('common.unknown')}),t('queue.costPolicy')];
 if(known&&rows.some(r=>r.activeReservation&&taskBucket(r)==='attention'))explanations.push(t('queue.laneBlocked'));
 target.replaceChildren(node('div',{class:'section-heading'},node('div',{class:'with-help'},node('h2',{},t('queue.title')),helpButton(t('queue.title'),explanations,target.id)),node('span',{class:'badge '+(known?'':'warn')},t(known?'queue.readOnly':'queue.upgrade'))),
  node('div',{class:'queue-metrics'},...stats.map(([key,value])=>node('div',{},node('small',{},t('queue.'+key)),node('strong',{},value)))),
  node('div',{class:'queue-slots'},...slots));
}
