#!/usr/bin/env bash
# Timestamp each worker/launcher stdout and stderr line with Mac-local time.
# Only used by the launcher: never by JSON-producing child commands.
ioant_timestamp_lines() {
  local line
  while IFS= read -r line || [[ -n "$line" ]]; do
    printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')" "$line"
  done
}
ioant_install_log_timestamps() {
  exec > >(ioant_timestamp_lines)
  exec 2> >(ioant_timestamp_lines >&2)
}
