#!/usr/bin/env node
// Read-only local capability inventory; no installers, shell interpolation or external network.
import { access, readdir, mkdir, writeFile, stat, rename, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir, platform, arch } from 'node:os';
import { resolve, join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const KNOWN_TOOLS = Object.freeze(['node','npm','git','brew','openclaw','ollama','adb','scrcpy','python3','swift','xcodebuild','tailscale']);
const SERVICE_PORTS = Object.freeze([11435,11434]);

export function displayPath(value, home = homedir()) {
  return value === home ? '~' : value.startsWith(home + '/') ? '~/' + value.slice(home.length + 1) : value;
}
function unique(values) { return [...new Set(values.filter(Boolean))]; }

export function candidatePaths(name, { home = homedir(), envPath = process.env.PATH ?? '', downloads = [] } = {}) {
  const pathDirs = envPath.split(':').filter(Boolean).filter(d => isAbsolute(d));
  const common = ['/opt/homebrew/bin', '/usr/local/bin', join(home,'.local','bin'), join(home,'.openclaw','bin'), join(home,'.npm-global','bin'), join(home,'.volta','bin')];
  const special = name === 'adb'
    ? downloads.filter(n => !n.startsWith('.') && n.length < 180).map(n => join(home,'Downloads',n,'platform-tools','adb'))
    : [];
  return unique([...pathDirs, ...common].map(d => join(d,name)).concat(special));
}
async function isExecutable(file) {
  try { await access(file, constants.X_OK); return (await stat(file)).isFile(); } catch { return false; }
}
async function discoverDownloads(home) {
  try {
    const entries = await readdir(join(home,'Downloads'),{ withFileTypes: true });
    // Bounded shallow inspection; never recursively search private files.
    return entries.filter(e => e.isDirectory() && e.name.length < 180).slice(0,200).map(e => e.name);
  } catch { return []; }
}
export async function detectTool(name, options = {}) {
  if (!KNOWN_TOOLS.includes(name)) throw new Error('Unsupported tool: ' + name);
  const home = options.home ?? homedir();
  const envPath = options.envPath ?? process.env.PATH ?? '';
  const pathDirs = new Set(envPath.split(':').filter(Boolean).map(d => resolve(d)));
  const candidates = candidatePaths(name,{ home, envPath, downloads: options.downloads ?? [] });
  const found = [];
  for (const file of candidates) {
    if (await isExecutable(file)) found.push({ file, onPath: pathDirs.has(dirname(file)) });
  }
  const preferred = found.find(x => x.onPath) ?? found[0];
  return {
    name,
    status: preferred ? (preferred.onPath ? 'on_path' : 'found_off_path') : 'not_detected',
    executable: preferred ? displayPath(preferred.file,home) : null,
    additional_locations: found.filter(x => x !== preferred).slice(0,3).map(x => displayPath(x.file,home))
  };
}
export async function checkOllama({ fetchImpl = fetch, ports = SERVICE_PORTS } = {}) {
  const endpoints = [];
  for (const port of ports) {
    const endpoint = 'http://127.0.0.1:' + port;
    try {
      const response = await fetchImpl(endpoint + '/api/tags',{ signal: AbortSignal.timeout(1700), redirect: 'manual' });
      if (!response.ok) { endpoints.push({endpoint,status:'http_error',http_status:response.status}); continue; }
      const raw = await response.text();
      if (raw.length > 1024 * 1024) throw new Error('Too-large response');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.models)) throw new Error('Unexpected model response');
      const models = unique(parsed.models.map(m => typeof m.name === 'string' ? m.name : '')
        .filter(s => /^[\w.:-]{1,100}$/.test(s)));
      endpoints.push({endpoint,status:'reachable',models});
    } catch { endpoints.push({endpoint,status:'unreachable_or_invalid'}); }
  }
  return endpoints;
}
export async function scanEnvironment({ home = homedir(), envPath = process.env.PATH ?? '', platformName = platform(), archName = arch(), fetchImpl = fetch } = {}) {
  const downloads = await discoverDownloads(home);
  const tools = [];
  for (const name of KNOWN_TOOLS) tools.push(await detectTool(name,{ home,envPath,downloads }));
  return {
    schema_version: 1,
    checked_at: new Date().toISOString(),
    platform: platformName,
    architecture: archName,
    scope: 'read_only_local_detection',
    caveat: 'not_detected is not proof of absence; discovery does not verify versions, configuration or gateways',
    tools,
    services: { ollama: await checkOllama({ fetchImpl }) }
  };
}
export function evaluateRequirements(snapshot, { tools = [], ollama = false, model = null } = {}) {
  const results = [];
  for (const name of tools) {
    const entry = snapshot.tools.find(t => t.name === name);
    if (!entry) throw new Error('Unsupported required tool: ' + name);
    const status = entry.status === 'on_path' ? 'ready' : entry.status === 'found_off_path' ? 'needs_path' : 'not_detected';
    results.push({requirement:'tool:' + name,status});
  }
  if (ollama || model) {
    const ready = snapshot.services.ollama.filter(s => s.status === 'reachable');
    results.push({requirement:'service:ollama',status:ready.length ? 'ready' : 'not_ready'});
    if (model) results.push({requirement:'model:' + model,status:ready.some(s => s.models.includes(model)) ? 'ready' : 'not_detected'});
  }
  return results;
}
export function formatSummary(snapshot) {
  const lines = ['Local environment: ' + snapshot.platform + '/' + snapshot.architecture + ' at ' + snapshot.checked_at, 'TOOLS (found != configured/running):'];
  for (const t of snapshot.tools) lines.push('  ' + t.status.padEnd(15) + ' ' + t.name.padEnd(12) + ' ' + (t.executable ?? '(not found in checked locations)'));
  lines.push('OLLAMA (local probes only):');
  for (const ep of snapshot.services.ollama) lines.push('  ' + ep.endpoint + ': ' + ep.status + (ep.models ? ' | models: ' + ep.models.join(', ') : ''));
  lines.push('No installs, settings changes or external requests performed.');
  return lines.join('\n');
}
async function main(args) {
  const mode = args[0] ?? 'scan';
  if (!['scan','save','check'].includes(mode) || args.length > 1) throw new Error('Usage: node src/environment.mjs scan|save|check');
  const snapshot = await scanEnvironment();
  if (mode === 'scan') { console.log(formatSummary(snapshot)); return; }
  if (mode === 'check') {
    console.log(formatSummary(snapshot));
    const requirements = evaluateRequirements(snapshot,{
      tools:['node','openclaw'],ollama:true,model:process.env.IOANT_OLLAMA_MODEL ?? 'gpt-oss:20b'
    });
    for (const result of requirements) console.log(result.status + ': ' + result.requirement);
    if (requirements.some(x => x.status !== 'ready')) process.exitCode = 1;
    return;
  }
  const base = process.env.PROJECT_DEV_CACHE;
  if (!base || !isAbsolute(base)) throw new Error('Saving requires scripts/dev-env.sh exec (PROJECT_DEV_CACHE)');
  const outDir = join(base,'environment');
  await mkdir(outDir,{recursive:true,mode:0o700});
  const output = join(outDir,'latest.json');
  const temp = join(outDir,'.snapshot-' + process.pid + '-' + Date.now() + '.tmp');
  try {
    await writeFile(temp,JSON.stringify(snapshot,null,2) + '\n',{mode:0o600,flag:'wx'});
    await rename(temp,output);
  } catch (error) { await rm(temp,{force:true}); throw error; }
  console.log(formatSummary(snapshot));
  console.log('Local private snapshot: ' + displayPath(output));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    console.error('Environment scan error: ' + error.message);
    process.exitCode = 1;
  });
}
