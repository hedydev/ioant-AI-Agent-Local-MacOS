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
if [[ " $* " == *" --enable-self-update "* ]]; then
  echo '[loop] Project self-update enabled: fixed origin/main, clean tree, candidate tests before fast-forward; no arbitrary commands.'
fi
if [[ " $* " == *" --enable-openclaw-provision "* ]]; then
  echo '[loop] OpenClaw Ollama provisioning opt-in: fixed local provider only; private backup, revisioned Gateway config.patch, no main model or Agent writes.'
fi
if [[ " $* " == *" --enable-mint-diagnostics "* ]]; then
  [[ -n "${ALICE_SSH_TARGET:-}" ]] || { echo '[loop] Set ALICE_SSH_TARGET before enabling Mint read-only diagnostics' >&2; exit 2; }
  echo '[loop] Mint diagnostic identity only: no PID/command args from chat, no process termination, no sudo password automation.'
fi
if [[ " $* " == *" --enable-alice-lab-startup-probe "* ]]; then
  [[ -n "${ALICE_SSH_TARGET:-}" ]] || { echo '[loop] Set ALICE_SSH_TARGET locally before explicitly enabling 17880 lab startup.' >&2; exit 2; }
  echo '[loop] Explicit 17880-only LAB authorization enabled: guarded Alice sync, readiness check, single startup probe.'
  echo '[loop] No production 17879 BDS restart, world mutation, pack install or probe retry authorized.'
  echo '[loop] If Mint sudo is interactive, stop safely; never automate sudo passwords.'
fi
source "$ROOT/scripts/dev-env.sh"
command -v node >/dev/null || { echo '[loop] Existing Node 20+ required' >&2; exit 1; }
node -e 'if(Number(process.versions.node.split(".")[0])<20)process.exit(1)'
OPENCLAW_BIN="$HOME/.openclaw/bin/openclaw"
[[ -x "$OPENCLAW_BIN" ]] || { echo '[loop] OpenClaw is not at expected ~/.openclaw/bin; use existing isolated installation, no automatic install' >&2; exit 1; }
export IOANT_OPENCLAW_BIN="$OPENCLAW_BIN"
# Explicit browser scope: managed or existing signed-in Chrome. Never attach to
# an arbitrary profile name or silently switch from isolated to personal Chrome.
BROWSER_PROFILE="${IOANT_CHATGPT_BROWSER_PROFILE:-openclaw}"
case "$BROWSER_PROFILE" in
  openclaw|user|chrome) ;;
  *) echo "[loop] Unsupported browser profile: $BROWSER_PROFILE (choose openclaw, user, or chrome)." >&2; exit 2;;
esac
export IOANT_CHATGPT_BROWSER_PROFILE="$BROWSER_PROFILE"
# Privacy-first per-run log: local LunaDrive only, no browser DOM or command output.
# Initialization fails closed if log storage is unsafe or unavailable.
LOG_DIR="$PROJECT_DEV_CACHE/logs/chatgpt-loop"
export IOANT_LOOP_LOG_FILE
IOANT_LOOP_LOG_FILE="$(node "$ROOT/stage2/diagnostic-log.mjs" init "$LOG_DIR")"
echo "[loop] Diagnostic log: $IOANT_LOOP_LOG_FILE"
log_event() {
  node "$ROOT/stage2/diagnostic-log.mjs" event "$1" "${2:-}" "${3:-}" || {
    echo '[loop] WARNING: unable to append private diagnostic event' >&2
    return 1
  }
}
log_event launcher_start
GATEWAY_PID=''
cleanup() {
  local rc=$?
  trap - EXIT
  if [[ -n "$GATEWAY_PID" ]] && kill -0 "$GATEWAY_PID" 2>/dev/null; then
    echo '[loop] Stopping only our temporary local Gateway'
    kill "$GATEWAY_PID" 2>/dev/null || true
    wait "$GATEWAY_PID" 2>/dev/null || true
    log_event gateway_stopped || true
  fi
  log_event launcher_exit exitCode "$rc" || true
  exit "$rc"
}
trap cleanup EXIT
# A pre-existing Gateway may require a client token/password that this
# isolated CLI does not have. Ask the Mac operator instead of replacing the
# server, disabling auth, or touching browser profiles.
GATEWAY_HEALTHY=0
if "$OPENCLAW_BIN" gateway health >/dev/null 2>&1; then GATEWAY_HEALTHY=1; log_event gateway_existing; fi
if (( GATEWAY_HEALTHY == 0 )) && lsof -nP -iTCP:18789 -sTCP:LISTEN 2>/dev/null | grep -q LISTEN; then
  GATEWAY_ERROR="$("$OPENCLAW_BIN" gateway health 2>&1 || true)"
  if [[ "$GATEWAY_ERROR" != *"requires credentials before opening a websocket"* ]]; then
    echo '[loop] Existing listener on Gateway port is unhealthy or not authorized; it has NOT been stopped.' >&2
    exit 1
  fi
  if [[ ! -t 0 ]]; then
    echo '[loop] Gateway needs credentials. Run this script in an interactive Mac terminal. Never paste token/password into ChatGPT.' >&2
    exit 1
  fi
  AUTH_KIND="$(node - "$HOME/.openclaw/openclaw.json" <<'JS'
const fs=require('node:fs');
try {
  const cfg=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  const mode=cfg?.gateway?.auth?.mode;
  process.stdout.write(mode==='password'?'password':mode==='token'?'token':'unknown');
} catch {process.stdout.write('unknown')}
JS
)"
  if [[ "$AUTH_KIND" == unknown ]]; then
    echo '[loop] Config does not reveal Gateway auth mode. Specify the existing mode (not the secret).'
    printf '[loop] Auth mode [token/password]: '
    IFS= read -r AUTH_KIND || exit 1
    [[ "$AUTH_KIND" == token || "$AUTH_KIND" == password ]] || { echo '[loop] Unsupported auth mode.' >&2; exit 1; }
  fi
  echo '[loop] Use the existing Gateway credential. In token mode, a second Terminal can run: openclaw gateway auth-token --show (NEVER share output).'
  printf '[loop] Existing Gateway %s (hidden input): ' "$AUTH_KIND"
  IFS= read -rs GATEWAY_CREDENTIAL || { printf '\n'; echo '[loop] Credential input aborted.' >&2; exit 1; }
  printf '\n'
  [[ -n "$GATEWAY_CREDENTIAL" ]] || { echo '[loop] Empty credential rejected.' >&2; exit 1; }
  if [[ "$AUTH_KIND" == token ]]; then
    export OPENCLAW_GATEWAY_TOKEN="$GATEWAY_CREDENTIAL"
  else
    export OPENCLAW_GATEWAY_PASSWORD="$GATEWAY_CREDENTIAL"
  fi
  unset GATEWAY_CREDENTIAL
  if "$OPENCLAW_BIN" gateway health >/dev/null 2>&1; then
    GATEWAY_HEALTHY=1
    echo '[loop] Gateway credential accepted; reusing the existing service.'
    log_event gateway_existing
  else
    log_event gateway_error || true
    echo '[loop] Existing Gateway still rejected authentication. No restart, retry or config overwrite performed.' >&2
    exit 1
  fi
fi
if (( GATEWAY_HEALTHY == 0 )); then
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
  (( ready == 1 )) || { log_event gateway_error || true; echo "[loop] Temporary Gateway not ready; private log: $GATEWAY_LOG" >&2; exit 1; }
  log_event gateway_temporary
fi
log_event browser_profile profile "$BROWSER_PROFILE"
# Managed Chrome is launched by OpenClaw; user attaches to already-running
# Chrome (may require a local consent prompt); chrome uses extension relay.
case "$BROWSER_PROFILE" in
  openclaw|user) "$OPENCLAW_BIN" browser --browser-profile "$BROWSER_PROFILE" start ;;
  chrome) echo '[loop] Using already-paired Chrome extension profile; not launching managed Chromium.' ;;
esac
CHAT_URL=''
for ((i=1; i<=$#; i++)); do
  if [[ "${!i}" == '--chat-url' ]]; then
    j=$((i+1))
    CHAT_URL="${!j-}"
    break
  fi
done
if [[ -n "$CHAT_URL" ]]; then
  validated="$(cd "$ROOT" && node --input-type=module -e 'import {validateChatUrl} from "./stage2/protocol.mjs";console.log(validateChatUrl(process.argv[1]))' "$CHAT_URL")"
  # List only extension-authorized tab URL metadata; never print browser titles or URLs.
  # A freshly attached Chrome relay can briefly expose zero tabs after Gateway
  # startup even though the extension is connected. Retry *only* that case.
  # No navigation, automatic grouping, auth changes or browser restarts.
  read_authorized_tab_counts() {
    printf '%s' "$1" | EXPECTED_CHAT_URL="$validated" node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const t=Array.isArray(j)?j:(j.tabs??j.result?.tabs);if(!Array.isArray(t))process.exit(2);const u=new URL(process.env.EXPECTED_CHAT_URL);const id=u.pathname.split("/").at(-1);const chat=t.filter(x=>typeof x.url==="string"&&x.url.startsWith("https://chatgpt.com/"));const same=chat.filter(x=>{try{return new URL(x.url).pathname.split("/").at(-1)===id}catch{return false}});process.stdout.write([t.filter(x=>x.url===u.href).length,t.length,chat.length,same.length].join(" "))})'
  }
  tabs="$("$OPENCLAW_BIN" browser --browser-profile "$BROWSER_PROFILE" --json tabs)"
  TAB_COUNTS="$(read_authorized_tab_counts "$tabs")" || {
    echo '[loop] Could not safely inspect ChatGPT tabs in selected browser profile; stopping.' >&2; exit 1;
  }
  read -r TAB_COUNT TAB_VISIBLE TAB_CHATGPT TAB_SAME_ID <<<"$TAB_COUNTS"
  if [[ "$BROWSER_PROFILE" == chrome ]] && (( TAB_VISIBLE == 0 )); then
    echo '[loop] Chrome profile currently exposes 0 tabs; rechecking relay access 8 times at 2-second intervals (no permissions changed).'
    log_event tab_retry_started || true
    RETRY_QUERIES_OK=0
    for (( retry=1; retry<=8; retry++ )); do
      sleep 2
      # A CLI failure is not proof of zero tabs; never convert it into an
      # authorization success or claim that the conversation was found.
      if ! tabs="$("$OPENCLAW_BIN" browser --browser-profile "$BROWSER_PROFILE" --json tabs 2>/dev/null)"; then
        continue
      fi
      TAB_COUNTS="$(read_authorized_tab_counts "$tabs")" || {
        log_event tab_retry_error || true
        echo '[loop] Chrome relay returned malformed tab metadata during retry; stopping.' >&2
        exit 1
      }
      RETRY_QUERIES_OK=1
      read -r TAB_COUNT TAB_VISIBLE TAB_CHATGPT TAB_SAME_ID <<<"$TAB_COUNTS"
      if (( TAB_VISIBLE > 0 )); then
        log_event tab_retry_recovered || true
        echo "[loop] Chrome relay now exposes $TAB_VISIBLE authorized tab(s) after retry $retry."
        break
      fi
    done
    if (( TAB_VISIBLE == 0 )); then
      if (( RETRY_QUERIES_OK == 0 )); then
        log_event tab_retry_error || true
        echo '[loop] Chrome browser relay tab queries failed on every retry; check extension relay and Gateway while the launcher is active.' >&2
        exit 1
      fi
      log_event tab_retry_timeout || true
    fi
  fi
  case "$TAB_COUNT" in
    1) echo "[loop] Reusing exactly one matching ChatGPT tab in browser profile: $BROWSER_PROFILE"; log_event tab_found ;;
    0)
      if [[ "$BROWSER_PROFILE" == openclaw ]]; then
        echo '[loop] Opening only the selected conversation in isolated managed browser.'
        "$OPENCLAW_BIN" browser --browser-profile "$BROWSER_PROFILE" open "$validated"
      else
        if (( TAB_SAME_ID > 0 )); then
          echo '[loop] An authorized tab has this conversation ID but a DIFFERENT project URL. Reopen the selected exact URL in that same authorized tab.' >&2
        elif (( TAB_VISIBLE == 0 )); then
          echo '[loop] Chrome profile exposes 0 eligible tabs. This does not prove the relay is connected. In the extension popup, check whether it says Relay unavailable WHILE this launcher is running. If Access=All tabs, no tab group is needed. If Access=Selected tabs, authorize the target tab in the OpenClaw group; ensure it is not paused.' >&2
        else
          echo "[loop] No exact target tab among $TAB_VISIBLE authorized tabs ($TAB_CHATGPT on ChatGPT). Check the current tab URL and extension Selected tabs grant." >&2
        fi
        log_event tab_missing || true
        exit 1
      fi
      ;;
    *) log_event tab_missing || true; echo "[loop] Found $TAB_COUNT copies of the target ChatGPT tab; close duplicates before automation." >&2; exit 1 ;;
  esac
fi
# Reload only on worker exit code 75, which can be set solely after
# a pretested fast-forward AND confirmed ChatGPT feedback. The existing
# Gateway, exact tab and launcher scope remain unchanged.
# Count *progress*, not total lifetime updates: repeated legitimate canaries
# must not make the launcher stop on the fourth success.
source "$ROOT/scripts/self-update-reload-guard.sh"
while :; do
  before_head="$(git -C "$ROOT" rev-parse --verify HEAD 2>/dev/null)" || {
    echo '[loop] STOP: cannot establish starting Git HEAD for reload.' >&2
    exit 1
  }
  worker_rc=0
  (cd "$ROOT" && node stage2/chatgpt-loop.mjs "$@") || worker_rc=$?
  if (( worker_rc != 75 )); then
    exit "$worker_rc"
  fi
  after_head="$(git -C "$ROOT" rev-parse --verify HEAD 2>/dev/null)" || {
    echo '[loop] STOP: cannot establish updated Git HEAD after exit 75.' >&2
    exit 1
  }
  if ! ioant_validated_reload_progress "$ROOT" "$before_head" "$after_head"; then
    echo '[loop] STOP: exit 75 without a validated main fast-forward; refusing reload.' >&2
    exit 1
  fi
  echo '[loop] Verified a new fast-forward revision; starting updated worker in this same foreground session.'
done
