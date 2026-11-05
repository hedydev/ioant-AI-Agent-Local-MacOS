import {node} from './render.js';
import {t,number} from './i18n.js';
import {TASK_TABS,taskBucket,taskCounts,projectName} from './task-model.js';
export function renderTaskTabs(target,rows,selected,onSelect){
 const counts=taskCounts(rows);
 target.setAttribute('role','tablist');target.setAttribute('aria-label',t('queue.title'));
 target.replaceChildren(...TASK_TABS.map((key,index)=>node('button',{
  class:'task-tab'+(selected===key?' active':''),role:'tab','aria-selected':selected===key,
  tabindex:selected===key?'0':'-1','data-focus':target.id+':'+key,
  onclick:()=>onSelect(key),onkeydown:e=>{
   const next=e.key==='ArrowRight'?(index+1)%4:e.key==='ArrowLeft'?(index+3)%4:e.key==='Home'?0:e.key==='End'?3:null;
   if(next!==null){e.preventDefault();onSelect(TASK_TABS[next]);target.children[next]?.focus();}
  }
 },t('queue.tab.'+key),node('span',{},counts[key]))));
}
export function renderQueueSummary(target,snapshot){
 const n=snapshot.scheduler?.native,known=n?.state==='observed',rows=snapshot.activities;
 const names=new Map(snapshot.projects.map(p=>[p.key,projectName(p)]));
 const count=taskCounts(rows),occupied=known?Number(Boolean(n.active)):null;
 const held=known?n.reservations.length:null;
 const waiting=known?n.reservations.filter(r=>r.project!==n.active?.project||r.operationId!==n.active?.operationId).length:null;
 const free=known&&(!n.active||n.reservations.some(r=>r.project===n.active.project&&r.operationId===n.active.operationId))?Math.max(0,n.capacity-held):null;
 const residency=snapshot.scheduler?.modelResidency,models=residency?.models??[],bytes=models.reduce((sum,m)=>sum+(m.residentBytes??0),0);
 const memory=residency?.state==='observed'&&models.every(m=>Number.isFinite(m.residentBytes))?(bytes/1073741824).toFixed(1)+' GiB':'—';
 const stats=[['occupied',occupied===null?'—':occupied+' / '+n.maxRunning],['waiting',number(waiting)],['free',free===null?'—':free+' / '+n.capacity],['scripts',number(rows.filter(r=>r.kind==='execution'&&taskBucket(r)==='running').length)],['memory',memory]];
 const slots=known?Array.from({length:n.capacity},(_,i)=>{
  const r=n.reservations[i],active=r&&r.project===n.active?.project&&r.operationId===n.active?.operationId;
  const row=r&&rows.find(x=>x.project===r.project&&x.operationId===r.operationId&&x.kind==='computer');
  return node('div',{class:'queue-slot '+(r?(active?'occupied':'waiting'):'free')},node('small',{},t('queue.slot',{number:i+1})),
   node('strong',{},r?(names.get(r.project)??r.project):t('queue.available')),
   node('span',{},r?t(row&&taskBucket(row)==='attention'?'queue.held':active?'queue.occupied':'queue.waiting'):t('queue.noReservation')),
   r?node('code',{title:r.operationId},r.operationId):null);
 }):[];
 target.replaceChildren(node('div',{class:'section-heading'},node('div',{},node('h2',{},t('queue.title')),node('p',{},t('queue.subtitle'))),node('span',{class:'badge '+(known?'':'warn')},t(known?'queue.readOnly':'queue.upgrade'))),
  node('div',{class:'queue-metrics'},...stats.map(([key,value])=>node('div',{},node('small',{},t('queue.'+key)),node('strong',{},value)))),
  node('div',{class:'queue-slots'},...slots),
  known&&rows.some(r=>r.activeReservation&&taskBucket(r)==='attention')?node('p',{class:'queue-alert'},t('queue.laneBlocked')):null,
  node('div',{class:'queue-policy'},node('p',{},t('queue.nativePolicy',{wait:n?.queueWaitSeconds??'—',run:n?.runBudgetSeconds??'—'})),node('p',{},t('queue.scriptPolicy')),node('p',{},t('queue.memoryHint',{models:models.map(m=>m.name).join(', ')||t('queue.noModel')})),node('p',{},t('queue.costPolicy'))),
  count.attention?node('p',{class:'queue-alert'},t('queue.reviewHint',{count:count.attention})):null);
}
