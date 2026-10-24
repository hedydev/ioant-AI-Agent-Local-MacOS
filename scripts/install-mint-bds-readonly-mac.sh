#!/usr/bin/env bash
# Run on Mac terminal. Explicitly fixed to approved Mint target and clean main.
set -Eeuo pipefail
umask 077
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$root"
[[ "${ALICE_SSH_TARGET:-}" == 'tedz@192.168.0.104' ]] || { echo '[setup] Scope: tedz@192.168.0.104 only' >&2; exit 2; }
[[ -t 0 && -t 1 ]] || { echo '[setup] Operator terminal required for Mint sudo' >&2; exit 2; }
[[ "$(git branch --show-current)" == main ]] || { echo '[setup] Use main' >&2; exit 2; }
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || { echo '[setup] Dirty tracked tree; no install' >&2; exit 2; }
case "$(git remote get-url origin)" in
  'https://github.com/hedydev/ioant-AI-Agent-Local-MacOS.git'|'https://github.com/hedydev/ioant-AI-Agent-Local-MacOS'|'git@github.com:hedydev/ioant-AI-Agent-Local-MacOS.git') ;;
  *) echo '[setup] Unexpected origin' >&2; exit 2;;
esac
for file in scripts/mint-bds-diagnostics.py scripts/mint-bds-sudoers scripts/mint-bds-setup.sh; do
  [[ -f "$file" && ! -L "$file" ]] || { echo "[setup] Missing or linked file: $file" >&2; exit 2; }
done
target=tedz@192.168.0.104
opts=(-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=yes)
stage="$(ssh "${opts[@]}" "$target" 'umask 077; mktemp -d "$HOME/.ioant-bds-readonly.XXXXXXXX"')"
[[ "$stage" =~ ^/home/tedz/\.ioant-bds-readonly\.[[:alnum:]]{8}$ ]] || { echo '[setup] Invalid Mint staging directory' >&2; exit 2; }
cleanup() {
  ssh "${opts[@]}" "$target" "rm -f '$stage/helper.py' '$stage/sudoers' '$stage/setup.sh' && rmdir '$stage'" >/dev/null 2>&1 || true
}
trap cleanup EXIT
scp "${opts[@]}" scripts/mint-bds-diagnostics.py "$target:$stage/helper.py"
scp "${opts[@]}" scripts/mint-bds-sudoers "$target:$stage/sudoers"
scp "${opts[@]}" scripts/mint-bds-setup.sh "$target:$stage/setup.sh"
echo '[setup] Fixed helper staged privately; Mint sudo approval follows.'
ssh -tt "${opts[@]}" "$target" "bash '$stage/setup.sh' '$stage'"
echo '[setup] Installed with a read-only Mint smoke check. No BDS restarted.'
