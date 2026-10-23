#!/usr/bin/env bash
# Repo-owned macOS development environment. Usage:
#   bash scripts/dev-env.sh check
#   bash scripts/dev-env.sh exec node --test
#   source scripts/dev-env.sh
#   bash scripts/dev-env.sh shell
_ioant_sourced() { [[ "${BASH_SOURCE[0]}" != "$0" ]]; }
_ioant_error() { printf '[dev-env] ERROR: %s\n' "$*" >&2; }
_ioant_prepare() {
  local var old
  PROJECT_DEV_SLUG="ioant-ai-agent-local-macos"
  IOANT_DEV_VOLUME="${IOANT_DEV_VOLUME:-/Volumes/LunaDrive}"
  IOANT_DEV_CACHE_ROOT="${IOANT_DEV_CACHE_ROOT:-$IOANT_DEV_VOLUME/DeveloperCache}"
  PROJECT_DEV_CACHE="${PROJECT_DEV_CACHE:-$IOANT_DEV_CACHE_ROOT/projects/$PROJECT_DEV_SLUG}"
  IOANT_NPM_CACHE="${IOANT_NPM_CACHE:-$IOANT_DEV_CACHE_ROOT/npm-cache}"
  IOANT_AI_AUDIT_DATA_DIR="${IOANT_AI_AUDIT_DATA_DIR:-$PROJECT_DEV_CACHE/audits}"
  for var in NPM_CONFIG_CACHE npm_config_cache HOMEBREW_CACHE CARGO_HOME CARGO_TARGET_DIR GRADLE_USER_HOME TMPDIR; do
    old="${!var-}"
    if [[ "$old" == *"/Volumes/MacDev"* ]]; then
      _ioant_error "$var still refers to /Volumes/MacDev"
      return 1
    fi
  done
  for var in "$HOME/.zshrc" "$HOME/.zprofile" "$HOME/.npmrc" "$HOME/.cargo/config" "$HOME/.cargo/config.toml" "$HOME/.gradle/gradle.properties"; do
    if [[ -f "$var" ]] && grep -E '/Volumes/MacDev' "$var" | grep -Ev '^[[:space:]]*#' >/dev/null; then
      _ioant_error "legacy path found in $var (review it manually)"
      return 1
    fi
  done
  [[ -d "$IOANT_DEV_VOLUME" && -w "$IOANT_DEV_VOLUME" ]] || { _ioant_error "LunaDrive unavailable: $IOANT_DEV_VOLUME"; return 1; }
  local mounted
  mounted="$(df -P "$IOANT_DEV_VOLUME" 2>/dev/null | awk 'NR==2 {print $NF}')"
  [[ "$mounted" == "$IOANT_DEV_VOLUME" ]] || { _ioant_error "$IOANT_DEV_VOLUME is not an actual mounted volume (mounted on: $mounted)"; return 1; }
  umask 077
  mkdir -p "$IOANT_DEV_CACHE_ROOT" "$IOANT_NPM_CACHE" "$PROJECT_DEV_CACHE" "$IOANT_AI_AUDIT_DATA_DIR" || return 1
  [[ -w "$IOANT_AI_AUDIT_DATA_DIR" ]] || { _ioant_error "audit directory not writable"; return 1; }
  export PROJECT_DEV_SLUG IOANT_DEV_VOLUME IOANT_DEV_CACHE_ROOT PROJECT_DEV_CACHE IOANT_NPM_CACHE IOANT_AI_AUDIT_DATA_DIR
  export NPM_CONFIG_CACHE="$IOANT_NPM_CACHE"
}
_ioant_check() {
  local resolved
  printf '[dev-env] volume=%s\n' "$IOANT_DEV_VOLUME"
  printf '[dev-env] npm=%s\n' "$NPM_CONFIG_CACHE"
  printf '[dev-env] audits=%s\n' "$IOANT_AI_AUDIT_DATA_DIR"
  if command -v npm >/dev/null 2>&1; then
    resolved="$(npm config get cache 2>/dev/null)"
    [[ "$resolved" == "$IOANT_NPM_CACHE" ]] || { _ioant_error "npm resolves to $resolved, expected $IOANT_NPM_CACHE"; return 1; }
  fi
  printf '[dev-env] OK\n'
}
_ioant_main() {
  local mode="${1:-check}"
  case "$mode" in
    check) _ioant_prepare && _ioant_check ;;
    exec)
      shift
      (( $# > 0 )) || { _ioant_error "exec requires command"; return 64; }
      _ioant_prepare || return 1
      exec "$@" ;;
    shell)
      _ioant_prepare || return 1
      exec "${SHELL:-/bin/zsh}" -l ;;
    *) _ioant_error "unknown mode: $mode"; return 64 ;;
  esac
}
if _ioant_sourced; then
  _ioant_prepare || return 1
else
  _ioant_main "$@"
fi
