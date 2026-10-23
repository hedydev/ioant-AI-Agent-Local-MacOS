import { mkdir, lstat, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

const SITE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const REPORT = /^[0-9TZ._-]+-[a-z0-9]{8}\.md$/;

export function defaultReportDir(home = homedir()) {
  return join(home, 'Desktop', 'Ioant-AI-Agent-Reports');
}

export async function privateReportDir(dir) {
  const target = resolve(dir);
  await mkdir(target, { recursive: true, mode: 0o700 });
  const st = await lstat(target);
  if (!st.isDirectory() || st.isSymbolicLink()) throw new Error('Report directory must be a real directory: ' + target);
  if ((st.mode & 0o077) !== 0) throw new Error('Report directory is not private (chmod 700 needed): ' + target);
  return target;
}

export async function reportPath(base, site, filename) {
  if (!SITE.test(site) || !REPORT.test(filename)) throw new Error('Invalid report destination name');
  const root = await privateReportDir(base);
  const folder = await privateReportDir(join(root, site));
  return join(folder, filename);
}

export async function desktopReportExists(base, site, runId) {
  if (!SITE.test(site) || !REPORT.test(runId + '.md')) return false;
  try {
    const st = await lstat(join(base, site, runId + '.md'));
    return st.isFile() && !st.isSymbolicLink();
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

// Export only legacy human-facing Markdown reports, never state.json or events.jsonl.
// Exclusive creation preserves existing desktop files; originals remain as a backup.
export async function copyLegacyReports(dataDir, reportDir) {
  const root = await privateReportDir(reportDir);
  let copied = 0, already = 0, ignored = 0;
  let sites;
  try { sites = await readdir(dataDir, { withFileTypes: true }); }
  catch (err) { if (err.code === 'ENOENT') return { root, copied, already, ignored }; throw err; }
  for (const site of sites) {
    if (!site.isDirectory() || !SITE.test(site.name)) { ignored++; continue; }
    const items = await readdir(join(dataDir, site.name), { withFileTypes: true });
    for (const item of items) {
      if (!item.isFile() || !REPORT.test(item.name)) { ignored++; continue; }
      const destination = await reportPath(root, site.name, item.name);
      try {
        const data = await readFile(join(dataDir, site.name, item.name));
        await writeFile(destination, data, { flag: 'wx', mode: 0o600 });
        copied++;
      } catch (err) {
        if (err.code === 'EEXIST') already++;
        else throw err;
      }
    }
  }
  return { root, copied, already, ignored };
}
