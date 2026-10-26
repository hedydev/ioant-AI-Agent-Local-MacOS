// Privacy-bounded diagnostics for Node's built-in test runner.
// Output contains only counters and sanitized relative test/ source locations.
// Never forward assertion operands, test stdout, stack locals or raw stderr.
const LOCATION=/^test at (test\/[A-Za-z0-9_./-]+\.(?:mjs|cjs|js)):(\d{1,7}):(\d{1,7})\s*$/;
const COUNTER=/^\s*(?:ℹ|#)\s+(tests|pass|fail)\s+(\d{1,7})\s*$/;
export function summarizeTestEvidence(raw) {
 const rows=String(raw??'').slice(-128*1024).split(/\r?\n/);
 const metrics={total:null,passed:null,failed:null};
 const files=[];
 for(const line of rows){
  const m=line.match(COUNTER);
  if(m){
   const value=Number(m[2]);
   if(Number.isSafeInteger(value)){
    if(m[1]==='tests')metrics.total=value;
    if(m[1]==='pass')metrics.passed=value;
    if(m[1]==='fail')metrics.failed=value;
   }
  }
  const match=line.match(LOCATION);
  if(match && files.length<10 &&
    !match[1].split('/').some(segment=>!segment||segment==='.'||segment==='..')){
   const path=match[1];
   const entry={file:path,line:Number(match[2]),column:Number(match[3])};
   if(!files.some(v=>v.file===entry.file&&v.line===entry.line&&v.column===entry.column))
    files.push(entry);
  }
 }
 return {audit:'IOANT_TEST_EVIDENCE',schemaVersion:1,
   tests:metrics.total,pass:metrics.passed,fail:metrics.failed,
   failingLocations:files,
   note:'node_test_relative_locations_only_no_assertion_data'};
}
export function validTestEvidence(data){
 if(!data||data.audit!=='IOANT_TEST_EVIDENCE'||data.schemaVersion!==1)return false;
 const ctr=n=>n===null||Number.isSafeInteger(n)&&n>=0&&n<=1000000;
 if(!ctr(data.tests)||!ctr(data.pass)||!ctr(data.fail)||
    !Array.isArray(data.failingLocations)||data.failingLocations.length>10)return false;
 return data.failingLocations.every(x=>x&&
   LOCATION.test('test at '+x.file+':'+x.line+':'+x.column)&&
   x.file.split('/').every(segment=>segment&&segment!=='.'&&segment!=='..')&&
   Number.isSafeInteger(x.line)&&x.line>=0&&
   Number.isSafeInteger(x.column)&&x.column>=0);
}

// Reject an exit-zero test run whose complete counts were never observed.
// The summary is independently validated; no raw child stdout is disclosed.
export function passingTestSummary(data){
 return validTestEvidence(data)&&Number.isSafeInteger(data.tests)&&data.tests>0&&
   Number.isSafeInteger(data.pass)&&data.pass===data.tests&&data.fail===0;
}
