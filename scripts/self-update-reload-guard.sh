#!/usr/bin/env bash
# Called only by the opt-in foreground launcher after a worker requests exit 75.
# Unlimited legitimate updates across a long-running session are allowed.
# A single exit 75 without actual verified fast-forward progress is denied.
ioant_validated_reload_progress() {
  local root="$1" before="$2" after="$3" current branch
  [[ "$before" =~ ^[0-9a-f]{40}$ && "$after" =~ ^[0-9a-f]{40}$ ]] || return 1
  [[ "$before" != "$after" ]] || return 1
  branch="$(git -C "$root" symbolic-ref --quiet --short HEAD 2>/dev/null)" || return 1
  [[ "$branch" == main ]] || return 1
  current="$(git -C "$root" rev-parse --verify HEAD 2>/dev/null)" || return 1
  [[ "$current" == "$after" ]] || return 1
  git -C "$root" cat-file -e "$before^{commit}" 2>/dev/null || return 1
  git -C "$root" cat-file -e "$after^{commit}" 2>/dev/null || return 1
  git -C "$root" merge-base --is-ancestor "$before" "$after" 2>/dev/null || return 1
}
