import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, stat, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultReportDir, privateReportDir, reportPath, desktopReportExists, copyLegacyReports } from '../src/report-storage.mjs';

const NAME = '2026-10-23T15-27-58-766Z-b6fc7a9f.md';
const ID = NAME.slice(0, -3);

test('default human-readable output lives on Desktop', () => {
  assert.equal(defaultReportDir('/Users/test'), '/Users/test/Desktop/Ioant-AI-Agent-Reports');
});

test('reports are 0600 in dedicated private directories; state stays separate', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'ioant-report-'));
  try {
    const output = join(temp, 'Desktop', 'Ioant-AI-Agent-Reports');
    const file = await reportPath(output, 'example', NAME);
    await writeFile(file, '# one private report', {flag:'wx',mode:0o600});
    assert.equal((await stat(output)).mode & 0o077, 0);
    assert.equal((await stat(join(output, 'example'))).mode & 0o077, 0);
    assert.equal((await stat(file)).mode & 0o077, 0);
    assert.equal(await desktopReportExists(output, 'example', ID), true);
    assert.equal(await desktopReportExists(output, 'example', 'does-not-exist'), false);
    await assert.rejects(() => reportPath(output, '../outside', NAME), /Invalid/);
    await assert.rejects(() => reportPath(output, 'example', '../unsafe.md'), /Invalid/);
  } finally { await rm(temp,{recursive:true,force:true}); }
});

test('legacy migration copies Markdown only, preserves originals, and does not overwrite', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'ioant-migrate-'));
  try {
    const oldDir = join(temp,'LunaDrive','audits','example');
    const newDir = join(temp,'Desktop','Ioant-AI-Agent-Reports');
    await mkdir(oldDir,{recursive:true});
    await writeFile(join(oldDir,NAME),'# original',{mode:0o600});
    await writeFile(join(oldDir,'state.json'),'state secret',{mode:0o600});
    await writeFile(join(oldDir,'events.jsonl'),'log private',{mode:0o600});
    const first=await copyLegacyReports(join(temp,'LunaDrive','audits'),newDir);
    assert.equal(first.copied,1);
    assert.equal(first.already,0);
    assert.equal(await readFile(join(newDir,'example',NAME),'utf8'),'# original');
    assert.equal(await readFile(join(oldDir,NAME),'utf8'),'# original');
    await writeFile(join(newDir,'example',NAME),'# manually edited',{mode:0o600});
    const second=await copyLegacyReports(join(temp,'LunaDrive','audits'),newDir);
    assert.equal(second.copied,0);
    assert.equal(second.already,1);
    assert.equal(await readFile(join(newDir,'example',NAME),'utf8'),'# manually edited');
    await assert.rejects(() => readFile(join(newDir,'example','state.json')), {code:'ENOENT'});
  } finally { await rm(temp,{recursive:true,force:true}); }
});

test('reject symlinked and world-readable application report destinations', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'ioant-private-'));
  try {
    const real=join(temp,'real');
    await mkdir(real,{mode:0o700});
    const link=join(temp,'linked');
    await symlink(real,link);
    await assert.rejects(()=>privateReportDir(link),/real directory/);
    const publicDir=join(temp,'public');
    await mkdir(publicDir,{mode:0o755});
    await assert.rejects(()=>privateReportDir(publicDir),/not private/);
  } finally { await rm(temp,{recursive:true,force:true}); }
});
