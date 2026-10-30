import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,realpath,writeFile,readFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {inspectProjectRepository} from '../integrations/chatgpt-openclaw/project-inspection.mjs';
async function fixture(t){
 const repo=await realpath(await mkdtemp(join(tmpdir(),'project-inspect-')));t.after(()=>rm(repo,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('/usr/bin/git',['-c','core.hooksPath=/dev/null',...args],{cwd:repo,encoding:'utf8',env:{...process.env,GIT_AUTHOR_NAME:'Fixture',GIT_AUTHOR_EMAIL:'fixture@example.invalid',GIT_COMMITTER_NAME:'Fixture',GIT_COMMITTER_EMAIL:'fixture@example.invalid'}});
 git('init','--quiet','--initial-branch=main');git('remote','add','origin','https://example.invalid/fixture/repo.git');await writeFile(join(repo,'file.txt'),'original\n');git('add','file.txt');git('commit','--quiet','-m','fixture');
 return {repo,git,binding:{projectKey:'project',agentId:'agent'},policy:async()=>({repo,branch:'main',repository:'fixture/repo',origins:['https://example.invalid/fixture/repo.git']})};
}
test('dirty inspection returns staged/working diffs with no network, source, index or HEAD mutation',async t=>{
 const f=await fixture(t);await writeFile(join(f.repo,'file.txt'),'staged\n');f.git('add','file.txt');await writeFile(join(f.repo,'file.txt'),'working\n');await writeFile(join(f.repo,'untracked.txt'),'must not read this');
 const index=await readFile(join(f.repo,'.git/index')),head=f.git('rev-parse','HEAD');
 const x=await inspectProjectRepository({details:'diff'},f);assert.equal(x.state,'repository_inspection');assert.equal(x.worktreeClean,false);assert.match(x.diffText,/staged/);assert.match(x.diffText,/working/);assert.equal(x.diffText.includes('must not read this'),false);assert.equal(x.networkInvoked,false);
 assert.deepEqual(await readFile(join(f.repo,'.git/index')),index);assert.equal(f.git('rev-parse','HEAD'),head);assert.equal(await readFile(join(f.repo,'file.txt'),'utf8'),'working\n');
});
test('pagination is bounded and a changed snapshot is detected without silently mixing pages',async t=>{
 const f=await fixture(t);await writeFile(join(f.repo,'file.txt'),'long diff line\n'.repeat(600));
 const a=await inspectProjectRepository({details:'diff'},f);assert.equal(a.diffText.length,4000);assert.ok(a.nextOffset>0);
 const b=await inspectProjectRepository({details:'diff',offset:a.nextOffset,snapshot_sha256:a.snapshotSha256},f);assert.equal(b.state,'repository_inspection');
 await writeFile(join(f.repo,'file.txt'),'changed again\n');assert.equal((await inspectProjectRepository({details:'diff',offset:a.nextOffset,snapshot_sha256:a.snapshotSha256},f)).state,'changed');
});
test('invalid/free-form requests and wrong origin/branch never become arbitrary shell or source writes',async t=>{
 const f=await fixture(t);
 for(const input of [{command:'run'},{path:'/etc/passwd'},{details:'diff',offset:4000},{details:'summary',offset:0}])assert.equal((await inspectProjectRepository(input,f)).reason,'invalid_inspection_input');
 f.git('remote','set-url','origin','https://example.invalid/other/repo.git');assert.equal((await inspectProjectRepository({},f)).reason,'unexpected_origin');
});

test('diff redaction happens before pagination and oversized captures are omitted',async t=>{
 const f=await fixture(t);await writeFile(join(f.repo,'file.txt'),'password=fixture-private-value\n');
 const r=await inspectProjectRepository({details:'diff'},f);assert.equal(r.state,'repository_inspection');assert.equal(r.diffText.includes('fixture-private-value'),false);
 await writeFile(join(f.repo,'file.txt'),'long text line\n'.repeat(18000));
 const large=await inspectProjectRepository({details:'diff'},f);assert.equal(large.reason,'inspection_output_limit');assert.equal(large.diffText,undefined);
});
