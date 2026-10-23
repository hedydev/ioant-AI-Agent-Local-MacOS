#!/usr/bin/env bash
# Opt-in Stage 2 foreground worker: one exact ChatGPT conversation, no background install.
set -Eeuo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ "$(uname -s)" == Darwin ]] || { echo '[loop] macOS required' >&2; exit 1; }
if [[ " $* " == *" --enable-alice-preflight " ]]; then
  [[ -n "${ALICE_SSH_TARGET:-}" ]] || { echo '[loop] Set ALICE_SSH_TARGET before enabling Alice preflight' >&2; exit 2; }
  echo '[loop] Alice workflow explicitly enabled: fetch/ff-only pull + non-destructive Mint sync + read-only witness preflight.'
  echo '[loop] No BDS restart or world-pack install actions are authorized.'
fi
source "$ROOT/scripts/dev-env.sh"
command -v node >/dev/null || { echo '[loop] Existing Node 20+ required' >&2; exit 1; }
node -e 'if(Number(process.versions.node.split(".")[0])<20)process.exit(1)'
OPENCLAW_BIN="$HOME/.openclaw/bin/openclaw"
[[ -x "$OPENCLAW_BIN" ]] || { echo '[loop] OpenClaw is not at expected ~/.openclaw/bin; use existing isolated installation, no automatic install' >&2; exit 1; }
export IOANT_OPENCLAW_BIN="$OPENCLAW_BIN"
GATEWAY_PID=''
cleanup() {
  local rc=$?
  trap - EXIT
  if [[ -n "$GATEWAY_PID" ]] && kill -0 "$GATEWAY_PID" 2>/dev/null; then
    echo '[loop] Stopping only our temporary local Gateway'
    kill "$GATEWAY_PID" 2>/dev/null || true
    wait "$GATEWAY_PID" 2>/dev/null || true
  fi
  exit "$rc"
}
trap cleanup EXIT
if ! "$OPENCLAW_BIN" gateway health >/dev/null 2>&1; then
  if lsof -nP -iTCP:18789 -sTCP:LISTEN 2>/dev/null | grep -q LISTEN; then
    echo '[loop] Unknown listener owns OpenClaw Gateway port; refusing to disturb it' >&2; exit 1
  fi
  command -v openssl >/dev/null || { echo '[loop] openssl missing' >&2; exit 1; }
  export OPENCLAW_GATEWAY_TOKEN
  OPENCLAW_GATEWAY_TOKEN="$(openssl rand -hex 32)"
  mkdir -p "$PROJECT_DEV_CACHE/logs"
  GATEWAY_LOG="$PROJECT_DEV_CACHE/logs/chatgpt-gateway-$(date -u +%Y%m%dT%H%M%SZ)-$$.log"
  "$OPENCLAW_BIN" gateway run --allow-unconfigured --bind loopback --auth token --tailscale off >"$GATEWAY_LOG" 2>&1 &
  GATEWAY_PID=$!
  ready=0
  for _ in {1..25}; do
    if "$OPENCLAW_BIN" gateway health >/dev/null 2>&1; then ready=1; break; fi
    if ! kill -0 "$GATEWAY_PID" 2>/dev/null; then break; fi
    sleep 1
  done
  (( ready == 1 )) || { echo "[loop] Temporary Gateway not ready; private log: $GATEWAY_LOG" >&2; exit 1; }
fi
"$OPENCLAW_BIN" browser --browser-profile openclaw start
CHAT_URL=''
for ((i=1; i<=$#; i++)); do
  if [[ "${!i}" == '--chat-url' ]]; then
    j=$((i+1))
    CHAT_URL="${!j-}"
    break
  fi
done
if [[ -n "$CHAT_URL" ]]; then
  # Validate exact ChatGPT conversation origin before opening a URL with an authenticated browser.
  validated="$(cd "$ROOT" && node --input-type=module -e 'import {validateChatUrl} from "./stage2/protocol.mjs";console.log(validateChatUrl(process.argv[1]))' "$CHAT_URL")"
  tabs="$("$OPENCLAW_BIN" browser --browser-profile openclaw --json tabs)"
  if ! printf '%s' "$tabs" | EXPECTED_CHAT_URL="$validated" node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const t=Array.isArray(j)?j:(j.tabs??j.result?.tabs);if(!Array.isArray(t))process.exit(2);process.exit(t.some(x=>x.url===process.env.EXPECTED_CHAT_URL)?0:1)})' 2>/dev/null; then
    echo '[loop] Opening only the explicitly selected ChatGPT conversation in isolated OpenClaw browser'
    "$OPENCLAW_BIN" browser --browser-profile openclaw open "$validated"
  fi
fi
(cd "$ROOT" && node stage2/chatgpt-loop.mjs "$@")
