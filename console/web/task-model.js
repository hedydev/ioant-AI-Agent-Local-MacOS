// Shared presentation rules. A retained reservation is not proof of a live process.
export const TASK_TABS=['running','queued','attention','history'];
export function taskBucket(row){
 if(row.inferenceLaneHeld||row.state==='inconclusive'||row.orphanedLease)return 'attention';
 if(row.kind==='computer'&&row.asynchronous===false&&['started','accepted','running'].includes(row.state))return 'attention';
 if(row.kind==='computer'&&['accepted','started','running'].includes(row.state)&&row.phase==='queued')return 'queued';
 if(['accepted','started','running'].includes(row.state))return 'running';
 return 'history';
}
export function taskCounts(rows){return Object.fromEntries(TASK_TABS.map(k=>[k,rows.filter(r=>taskBucket(r)===k).length]));}
export function reviewCategory(row){
 if(row.reason==='agent_run_timeout')return 'timeout';
 if(/receipt|record_unavailable/.test(row.reason??''))return 'receipt';
 if(row.reason==='agent_cli_failed')return 'channel';
 if(row.reason==='login_not_yet_verified')return 'login';
 if(row.kind==='computer'&&row.asynchronous===false&&['started','accepted','running'].includes(row.state))return 'legacy';
 return 'unknown';
}
export function reviewSummary(rows){
 const review=rows.filter(r=>taskBucket(r)==='attention');
 return {total:review.length,held:review.filter(r=>r.activeReservation||r.projectLeaseHeld).length,
  reasons:review.reduce((out,r)=>{const key=reviewCategory(r);out[key]=(out[key]??0)+1;return out;},{})};
}
export function projectName(project){
 const name=project?.name??project?.key??'—';
 return name.replace(/^ioant[-_]/i,'').replace(/[-_]MacOS$/i,' · macOS').replace(/[-_]/g,' ');
}
export function taskTitle(row){
 if(row.taskFile)return row.taskFile.split('/').at(-1).replace(/\.json$/,'').replace(/[_-]/g,' ');
 return row.action??null;
}
export function elapsedSeconds(row,now=Date.now()){
 const start=Date.parse(row.startedAt),end=row.finishedAt?Date.parse(row.finishedAt):now;
 return Number.isFinite(start)&&Number.isFinite(end)&&end>=start?Math.floor((end-start)/1000):null;
}
