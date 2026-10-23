#!/usr/bin/env bash
# Read-only checks. Does not install, configure, launch or restart services.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$SCRIPT_DIR/dev-env.sh" check
command -v node >/dev/null || { echo '[preflight] Node is not available on PATH (it may already be installed elsewhere)' >&2; exit 1; }
# Discover and persist sanitized local facts BEFORE suggesting installations.
bash "$SCRIPT_DIR/dev-env.sh" exec node "$SCRIPT_DIR/../src/environment.mjs" save
node -e 'if(Number(process.versions.node.split(".")[0])<20){console.error("Stage-1 Node scripts require Node 20 or newer");process.exitCode=1}'
node -e 'const [major,minor,patch]=process.versions.node.split(".").map(Number);const ok=(major===24&&(minor>22||(minor===22&&patch>=1)))||(major===26&&(minor>12||(minor===12&&patch>=1)))||major>26;if(!ok)console.warn("[preflight] Current shell Node "+process.version+" does not meet latest OpenClaw CLI requirements. OpenClaw might use its own compatible Node; inspect the existing installation before upgrading.")'
command -v openclaw >/dev/null || { echo '[preflight] OpenClaw not available on PATH; check the environment inventory for an off-PATH binary before installing' >&2; exit 1; }
command -v curl >/dev/null || { echo '[preflight] curl missing' >&2; exit 1; }
printf '[preflight] OpenClaw: '
openclaw --version
echo '[preflight] Gateway (read-only status)'
openclaw gateway status
echo '[preflight] Browser tabs (read-only)'
openclaw browser --browser-profile openclaw --json tabs
echo '[preflight] Local Ollama model listing'
curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:11435/api/tags" | node -e 'let b="";process.stdin.on("data",c=>b+=c).on("end",()=>{const j=JSON.parse(b);for(const m of j.models??[])console.log(m.name);if(!(j.models??[]).length)process.exitCode=1})'
echo '[preflight] No services or settings changed'
