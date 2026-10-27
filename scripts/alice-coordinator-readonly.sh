#!/usr/bin/env bash
# Operator-approved AliceAI foreground coordinator only. NO process daemon installation.
set -Eeuo pipefail
umask 077
[[ "${1:-}" == '--once' || "${1:-}" == '--watch' ]] && (( $# == 1 )) || {
  echo 'Usage: alice-coordinator-readonly.sh --once | --watch' >&2; exit 64;
}
MODE="$1"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/scripts/dev-env.sh"
export IOANT_CHATGPT_BROWSER_PROFILE=chrome
[[ -x "$HOME/.openclaw/bin/openclaw" ]] || { echo 'OpenClaw CLI unavailable' >&2; exit 1; }
"$HOME/.openclaw/bin/openclaw" gateway health >/dev/null || {
  echo 'Existing Gateway unavailable, no restart attempted' >&2; exit 1;
}
CHAT_URL="$(node - "$ROOT/config/chat-projects.json" <<'JS'
const fs=require('node:fs');
const file=process.argv[2],doc=JSON.parse(fs.readFileSync(file,'utf8'));
const alice=doc.projects.find(x=>x.key==='alice-ai');
if(!alice||alice.agentId!=='alice-ai'||alice.repo!=='hedydev/ioant-AI-Minecraft-Alice')process.exit(1);
process.stdout.write(alice.chatUrl);
JS
)"
[[ "$CHAT_URL" == https://chatgpt.com/g/g-p-*/c/* ]] || exit 1
# Match the existing Stage-2 launcher: the background watcher may not have
# Terminal's LunaDrive/Desktop permissions. Never force the background process
# to create a diagnostic log on the external volume.
if [[ "${IOANT_BACKGROUND_SAFE_REPORTS:-0}" == 1 ]]; then
  LOGDIR="$HOME/Library/Application Support/ioant-openclaw-ops/logs/chatgpt-loop"
else
  LOGDIR="$PROJECT_DEV_CACHE/logs/chatgpt-loop"
fi
export IOANT_LOOP_LOG_FILE
IOANT_LOOP_LOG_FILE="$(node "$ROOT/stage2/diagnostic-log.mjs" init "$LOGDIR")"
echo '[alice-coordinator] Isolated read-only worker; no Mint/BDS, host commands, Git writes or Chrome navigation.'
exec node "$ROOT/stage2/chatgpt-loop.mjs" --project-key alice-ai --chat-url "$CHAT_URL" "$MODE" --enable-gui-readonly
