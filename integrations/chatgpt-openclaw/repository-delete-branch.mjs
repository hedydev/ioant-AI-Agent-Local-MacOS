// Fixed Git argv, exact remote commit lease. No model or local branch mutation.
export const branchName=x=>typeof x==='string'&&x.length<=160&&!x.startsWith('-')&&!x.endsWith('.')&&!x.endsWith('/')&&!/[\s\x00-\x1f~^:?*\[\\]/.test(x)&&!x.includes('..')&&!x.includes('@{')&&!x.includes('//')&&x.split('/').every(p=>p&&!p.startsWith('.')&&!p.endsWith('.lock'));
export async function deleteRemoteBranch(input,policy,before,{git}){
 if(!branchName(input.branch)||input.expected_branch_commit!==undefined&&!/^[a-f0-9]{40}$/.test(input.expected_branch_commit))throw Error('invalid_branch_delete_input');
 const ref='refs/heads/'+input.branch;
 const remote=await git('branch_delete_preflight',['ls-remote','--symref','origin','HEAD',ref]);
 const defaultRef=remote.stdout.match(/^ref: (refs\/heads\/[^\s]+)\s+HEAD$/m)?.[1];
 if(remote.truncated||!defaultRef)throw Error('remote_default_branch_unverified');
 if(ref===defaultRef||input.branch===before.branch)throw Error('default_or_current_branch_delete_blocked');
 const sha=remote.stdout.split('\n').find(l=>l.split(/\s+/)[1]===ref)?.split(/\s+/)[0];
 if(!sha)return {deleted:false,alreadyAbsent:true,branch:input.branch};
 if(!/^[a-f0-9]{40}$/.test(sha))throw Error('remote_branch_commit_unverified');
 if(input.expected_branch_commit!==undefined&&sha!==input.expected_branch_commit)throw Error('remote_branch_commit_changed');
 await git('delete_remote_branch',['push','--porcelain','--force-with-lease='+ref+':'+sha,'origin',':'+ref],{timeout:60000});
 const verify=await git('verify_remote_branch_absent',['ls-remote','--heads','origin',ref]);
 if(verify.truncated||verify.stdout.trim())throw Error('remote_branch_delete_not_verified');
 return {deleted:true,branch:input.branch,deletedCommit:sha,remoteAbsenceVerified:true};
}
