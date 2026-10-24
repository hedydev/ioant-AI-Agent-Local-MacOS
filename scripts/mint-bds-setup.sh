#!/usr/bin/env bash
# Interactive operator-approved, fixed-scope Mint helper installation.
set -Eeuo pipefail
umask 077
stage="${1:-}"
[[ "$stage" =~ ^/home/tedz/\.ioant-bds-readonly\.[[:alnum:]]{8}$ ]] || exit 2
[[ "$(id -un)" == tedz && "$HOME" == /home/tedz ]] || exit 2
[[ -d "$stage" && ! -L "$stage" && "$(stat -c '%a %U' "$stage")" == '700 tedz' ]] || exit 2
for file in helper.py sudoers; do
  [[ -f "$stage/$file" && ! -L "$stage/$file" ]] || exit 2
done
[[ -x /usr/bin/python3 && -x /usr/bin/ss && -x /usr/sbin/visudo ]] || exit 2
echo '[setup] Mint sudo authorization for a fixed read-only helper; no BDS restart.'
sudo -v
fixed=/usr/local/libexec/ioant/mint-bds-diagnostics.py
rule=/etc/sudoers.d/ioant-mint-bds-readonly
[[ ! -L /usr/local/libexec && ! -L /usr/local/libexec/ioant ]] || { echo '[setup] Unexpected symlink' >&2; exit 2; }
sudo install -d -o root -g root -m 0755 /usr/local/libexec/ioant
# Any group/other-writable ancestor could let an unprivileged account
# replace a root-owned script path. Refuse the entire privilege grant.
for parent in /usr /usr/local /usr/local/libexec /usr/local/libexec/ioant; do
  [[ ! -L "$parent" ]] || { echo '[setup] Symlink in helper parent chain' >&2; exit 2; }
  owner_mode="$(sudo stat -c '%u:%a' "$parent")"
  [[ "$owner_mode" =~ ^0:[0-7]{3,4}$ ]] || { echo '[setup] Helper parent not root-owned' >&2; exit 2; }
  octal_mode="${owner_mode#*:}"
  (( (8#$octal_mode & 0022) == 0 )) || { echo '[setup] Helper parent writable by non-root' >&2; exit 2; }
done
[[ "$(sudo stat -c '%u:%g:%a' /usr/local/libexec/ioant)" == '0:0:755' ]] || exit 2
[[ ! -L "$fixed" && ! -L "$rule" ]] || { echo '[setup] Installed path is a symlink' >&2; exit 2; }
if sudo test -e "$fixed"; then
  sudo cmp -s "$stage/helper.py" "$fixed" || { echo '[setup] Existing helper differs; refuse overwrite' >&2; exit 2; }
else
  sudo install -o root -g root -m 0555 "$stage/helper.py" "$fixed"
fi
[[ ! -L "$fixed" && "$(sudo stat -c '%u:%g:%a' "$fixed")" == '0:0:555' ]] || exit 2
sudo /usr/sbin/visudo -cf "$stage/sudoers"
if sudo test -e "$rule"; then
  sudo cmp -s "$stage/sudoers" "$rule" || { echo '[setup] Existing sudoers rule differs; refuse overwrite' >&2; exit 2; }
else
  sudo install -o root -g root -m 0440 "$stage/sudoers" "$rule"
  if ! sudo /usr/sbin/visudo -cf /etc/sudoers; then
    sudo rm -f "$rule"
    echo '[setup] Sudoers validation failed; only new rule rolled back' >&2
    exit 1
  fi
fi
[[ ! -L "$rule" && "$(sudo stat -c '%u:%g:%a' "$rule")" == '0:0:440' ]] || exit 2
echo '[setup] Root-owned helper and scoped rule installed; read-only smoke check:'
sudo -n /usr/bin/python3 -I -S /usr/local/libexec/ioant/mint-bds-diagnostics.py
