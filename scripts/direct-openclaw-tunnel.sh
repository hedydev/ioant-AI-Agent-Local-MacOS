#!/usr/bin/env bash
# Run the already-configured private tunnel in the foreground. No key on argv.
set +x
set -euo pipefail
umask 077
client='/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos/tools/tunnel-client/v0.0.18/tunnel-client'
profile_dir="$HOME/Library/Application Support/ioant-openclaw-ops/direct-tunnel"
profile='ioant-openclaw-direct'
if [[ $# -ne 0 || ! -x "$client" || ! -f "$profile_dir/$profile.yaml" ]]; then
  printf 'The verified client and configured ioant-openclaw-direct profile are required.\n' >&2
  exit 1
fi
if [[ -z "${CONTROL_PLANE_API_KEY:-}" ]]; then
  if [[ ! -t 0 || ! -t 1 ]]; then
    printf 'Run in your local interactive Terminal to enter the runtime key privately.\n' >&2
    exit 1
  fi
  read -r -s -p 'OpenAI tunnel Runtime API Key (hidden): ' CONTROL_PLANE_API_KEY
  printf '\n'
fi
if [[ -z "$CONTROL_PLANE_API_KEY" ]]; then
  printf 'No runtime key entered; nothing started.\n' >&2
  exit 1
fi
export CONTROL_PLANE_API_KEY
"$client" doctor --profile-dir "$profile_dir" --profile "$profile" --explain
exec "$client" run --profile-dir "$profile_dir" --profile "$profile"
