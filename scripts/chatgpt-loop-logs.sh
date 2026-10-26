#!/usr/bin/env bash
# Operator-only reader; default is sanitized Desktop ZIP.
# Background launchd logs stay in local private storage to avoid Desktop TCC.
set -Eeuo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-bundle}"
case "$MODE" in
  bundle) exec python3 "$ROOT/scripts/openclaw-desktop-logs.py" ;;
  latest|tail) ;;
  *) echo "Usage: bash scripts/chatgpt-loop-logs.sh [bundle|latest|tail]" >&2; exit 2 ;;
esac
source "$ROOT/scripts/dev-env.sh"
python3 - "$PROJECT_DEV_CACHE/logs/chatgpt-loop" "$MODE" <<'PY'
import json,os,pathlib,re,sys
legacy=pathlib.Path(sys.argv[1]);mode=sys.argv[2]
background=pathlib.Path.home()/"Library"/"Application Support"/"ioant-openclaw-ops"/"logs"/"chatgpt-loop"
matcher=re.compile(r'^run-\d{8}T\d{6}Z-\d{1,9}-[0-9a-f]{8}(?:\.part[1-3])?\.jsonl$')
files=[]
for directory in (background,legacy):
    if not directory.is_dir() or directory.is_symlink():continue
    for file in directory.iterdir():
        if not matcher.fullmatch(file.name):continue
        try:
            stat=file.lstat()
            if not file.is_file() or file.is_symlink() or stat.st_uid!=os.getuid() or stat.st_mode & 0o077:continue
            files.append((stat.st_mtime_ns,file))
        except OSError:continue
files.sort(reverse=True)
if not files:sys.exit('[loop] No private diagnostic logs found.')
latest=files[0][1]
print('[loop] Latest diagnostic log:',latest)
if mode=='tail':
    with latest.open(encoding='utf-8',errors='replace') as stream:
        for line in stream.readlines()[-80:]:
            try:
                event=json.loads(line)
                if event.get('source')!='ioant-loop':continue
                safe={k:v for k,v in event.items() if k in ('event','action','status','code') and isinstance(v,str) and re.fullmatch('[A-Za-z0-9_-]{1,80}',v)}
                print(' '.join(k+'='+str(v) for k,v in safe.items()))
            except (ValueError,TypeError,AttributeError):print('[invalid JSONL event]')
PY
