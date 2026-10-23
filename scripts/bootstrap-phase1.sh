#!/usr/bin/env bash
# Stage 1 one-command setup and read-only audit on the user's Mac.
# Only the isolated OpenClaw CLI is installed if missing; no global Node or daemon changes.
set -Eeuo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OPENCLAW_PREFIX="${IOANT_OPENCLAW_PREFIX:-$HOME/.openclaw}"
GATEWAY_PID=''
GATEWAY_LOG=''

info() { printf '\n[phase1] %s\n' "$*"; }
fail() { printf '[phase1] ERROR: %s\n' "$*" >&2; exit 1; }
cleanup() {
  local rc=$?
  trap - EXIT
  if [[ -n "$GATEWAY_PID" ]] && kill -0 "$GATEWAY_PID" 2>/dev/null; then
    info 'Stopping only the temporary Gateway started by this script'
    kill "$GATEWAY_PID" 2>/dev/null || true
    wait "$GATEWAY_PID" 2>/dev/null || true
  fi
  if (( rc != 0 )); then
    printf '[phase1] Failed with exit code %d\n' "$rc" >&2
    if [[ -n "$GATEWAY_LOG" && -f "$GATEWAY_LOG" ]]; then
      printf '[phase1] Gateway diagnostic log is private: %s\n' "$GATEWAY_LOG" >&2
    fi
  fi
  exit "$rc"
}
trap cleanup EXIT

[[ "$(uname -s)" == Darwin ]] || fail 'Requires macOS; nothing changed.'
[[ -d "$ROOT/.git" ]] || fail "Not a Git checkout: $ROOT"
[[ "$OPENCLAW_PREFIX" == "$HOME/.openclaw" ]] || fail 'Phase 1 only installs to ~/.openclaw; existing alternative installations are left untouched.'
source "$ROOT/scripts/dev-env.sh" || fail 'LunaDrive environment validation failed.'
command -v node >/dev/null 2>&1 || fail 'Node 20+ needed for local project tests; first inspect your existing fnm installation.'
node -e 'if (Number(process.versions.node.split(".")[0]) < 20) process.exit(1)' || fail 'Stage-1 project scripts require existing Node >=20.'
command -v curl >/dev/null 2>&1 || fail 'curl is required.'
command -v openssl >/dev/null 2>&1 || fail 'openssl is required for a temporary gateway token.'

info 'Checking existing OpenClaw executable (no global Node changes)'
if [[ -x "$OPENCLAW_PREFIX/bin/openclaw" ]]; then
  OPENCLAW_BIN="$OPENCLAW_PREFIX/bin/openclaw"
elif command -v openclaw >/dev/null 2>&1; then
  OPENCLAW_BIN="$(command -v openclaw)"
else
  info 'Installing only the missing isolated OpenClaw CLI under ~/.openclaw'
  mkdir -p "$PROJECT_DEV_CACHE/tmp"
  INSTALLER="$(mktemp "$PROJECT_DEV_CACHE/tmp/openclaw-install.XXXXXX")"
  curl --fail --show-error --silent --location --proto '=https' --tlsv1.2 \
    'https://openclaw.ai/install-cli.sh' -o "$INSTALLER" || fail 'Failed to fetch official installer.'
  bash -n "$INSTALLER" || fail 'Official installer failed shell syntax check; not executed.'
  info 'Official installer downloaded; invoking --runtime-only --no-onboard (no daemon)'
  bash "$INSTALLER" --prefix "$OPENCLAW_PREFIX" --runtime-only --no-onboard || fail 'Isolated OpenClaw CLI installation failed.'
  rm -f "$INSTALLER"
  [[ -x "$OPENCLAW_PREFIX/bin/openclaw" ]] || fail 'Installer returned but CLI wrapper was not found.'
  OPENCLAW_BIN="$OPENCLAW_PREFIX/bin/openclaw"
fi
export PATH="$(dirname "$OPENCLAW_BIN"):$PATH"
export IOANT_OPENCLAW_BIN="$OPENCLAW_BIN"
info 'Installed OpenClaw version:'
"$OPENCLAW_BIN" --version || fail 'OpenClaw CLI could not start with a compatible Node. Check its private runtime.'

info 'Running project tests before browser activity'
(cd "$ROOT" && node --test) || fail 'Project tests failed; no browser audit attempted.'

info 'Copying existing Markdown reports to the Desktop (no overwrite or deletion)'
(cd "$ROOT" && node scripts/export-reports.mjs) || fail 'Could not copy existing reports to Desktop.'

info 'Verifying the existing Ollama service and chosen model (no downloads)'
OLLAMA_MODEL="${IOANT_OLLAMA_MODEL:-gpt-oss:20b}"
export IOANT_OLLAMA_MODEL="$OLLAMA_MODEL"
response="$(curl --fail --silent --show-error --max-time 6 'http://127.0.0.1:11435/api/tags')" || fail 'Existing Ollama 11435 not reachable.'
printf '%s' "$response" | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    const names=(JSON.parse(s).models??[]).map(m=>m.name);
    const model=process.env.IOANT_OLLAMA_MODEL;
    if(!names.includes(model)){console.error("Required local model not found: "+model);process.exitCode=1}
    else console.log("Local Ollama ready; model: "+model)
  })
' || fail 'Requested Ollama model absent; use an already installed model or adjust IOANT_OLLAMA_MODEL.'

info 'Checking Gateway: reuse an existing healthy Gateway or start temporary loopback-only one'
if "$OPENCLAW_BIN" gateway health >/dev/null 2>&1; then
  info 'Existing Gateway detected; preserving it unchanged.'
else
  if lsof -nP -iTCP:18789 -sTCP:LISTEN 2>/dev/null | grep -q LISTEN; then
    fail 'Port 18789 already occupied but OpenClaw Gateway was not healthy; not touching unknown service.'
  fi
  export OPENCLAW_GATEWAY_TOKEN
  OPENCLAW_GATEWAY_TOKEN="$(openssl rand -hex 32)" || fail 'Could not create local token.'
  mkdir -p "$PROJECT_DEV_CACHE/logs"
  GATEWAY_LOG="$PROJECT_DEV_CACHE/logs/gateway-$(date -u +%Y%m%dT%H%M%SZ)-$$.log"
  "$OPENCLAW_BIN" gateway run --allow-unconfigured --bind loopback --auth token --tailscale off \
    > "$GATEWAY_LOG" 2>&1 &
  GATEWAY_PID=$!
  ready=0
  for _ in {1..25}; do
    if "$OPENCLAW_BIN" gateway health >/dev/null 2>&1; then ready=1; break; fi
    if ! kill -0 "$GATEWAY_PID" 2>/dev/null; then break; fi
    sleep 1
  done
  (( ready == 1 )) || fail 'Temporary Gateway did not become healthy; see private Gateway log.'
  info 'Temporary authenticated Gateway is available on localhost only.'
fi

info 'Starting isolated OpenClaw browser; reuse a unique existing example.com tab'
"$OPENCLAW_BIN" browser --browser-profile openclaw start || fail 'OpenClaw browser start failed.'
TAB_COUNT="$("$OPENCLAW_BIN" browser --browser-profile openclaw --json tabs | node -e '
  let s="";
  process.stdin.on("data", d => s+=d).on("end", () => {
    const json=JSON.parse(s);
    const tabs=Array.isArray(json)?json:(json.tabs??json.result?.tabs);
    if(!Array.isArray(tabs)) throw new Error("Invalid browser tab list");
    const count=tabs.filter(t => {
      try {return new URL(t.url).href==="https://example.com/"} catch{return false}
    }).length;
    process.stdout.write(String(count));
  });
')" || fail 'Could not inspect existing OpenClaw tabs.'
case "$TAB_COUNT" in
  0) "$OPENCLAW_BIN" browser --browser-profile openclaw open https://example.com/ || fail 'Failed to open example page.' ;;
  1) info 'Reusing the already-open example.com tab; no duplicate created.' ;;
  *) fail "Found $TAB_COUNT example.com tabs; close duplicates manually before auditing." ;;
esac

info 'Running one real read-only website audit with local Ollama'
(cd "$ROOT" && node src/audit.mjs --once --id example) || fail 'Audit failed. Review local report/event logs; no external actions were taken.'
info 'Checking an unchanged second capture does not request another model analysis'
SECOND_PASS="$(cd "$ROOT" && node src/audit.mjs --once --id example)" || fail 'Second capture failed.'
printf '%s\n' "$SECOND_PASS"
[[ "$SECOND_PASS" == *"UNCHANGED example sha256="* ]] || fail 'Repeat capture was not unchanged; investigate snapshot stability and do not claim deduplication passed.'
info 'Success. OpenClaw, local analysis and unchanged-snapshot deduplication passed.'
info 'Temporary Gateway (if started here) will be shut down. No daemon installed.'
