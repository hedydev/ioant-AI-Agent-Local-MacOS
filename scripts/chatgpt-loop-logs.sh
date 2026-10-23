#!/usr/bin/env bash
# Read/export privacy-filtered ChatGPT loop event logs without starting Gateway.
set -Eeuo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/scripts/dev-env.sh"
MODE="${1:-tail}"
case "$MODE" in latest|tail|bundle) ;; *) echo "Usage: bash scripts/chatgpt-loop-logs.sh [latest|tail|bundle]" >&2; exit 2;; esac
LOG_DIR="$PROJECT_DEV_CACHE/logs/chatgpt-loop"
[[ -d "$LOG_DIR" && ! -L "$LOG_DIR" ]] || { echo "[loop] No safe log directory at $LOG_DIR" >&2; exit 1; }
python3 - "$LOG_DIR" "$MODE" "$HOME/Desktop/Ioant-AI-Agent-Reports" <<'PY'
import json, os, pathlib, re, sys, zipfile
logdir=pathlib.Path(sys.argv[1]); mode=sys.argv[2]; desktop=pathlib.Path(sys.argv[3])
patt=re.compile(r'^run-\d{8}T\d{6}Z-\d{1,9}-[0-9a-f]{8}(?:\.part[1-3])?\.jsonl$')
files=[]
for f in logdir.iterdir():
    if not patt.fullmatch(f.name): continue
    try:
        st=f.lstat()
        if not f.is_file() or f.is_symlink() or st.st_uid!=os.getuid() or st.st_mode & 0o077: continue
        files.append((f,st))
    except OSError: continue
files.sort(key=lambda x:x[1].st_mtime_ns,reverse=True)
if not files:
    sys.exit("[loop] No private diagnostic logs found.")
if mode=="latest":
    print(files[0][0])
elif mode=="tail":
    source=files[0][0]
    print("[loop] Latest diagnostic log:",source)
    with source.open(encoding="utf-8",errors="replace") as fh:
        lines=fh.readlines()[-80:]
    for line in lines:
        try:
            e=json.loads(line)
            print(f'{e.get("at","?")}  {e.get("event","?")}  action={e.get("action","-")} task={e.get("taskId","-")} status={e.get("status","-")} code={e.get("code","-")}')
        except (ValueError,TypeError): print("[invalid JSONL event]")
elif mode=="bundle":
    desktop.mkdir(parents=True,exist_ok=True,mode=0o700)
    if desktop.is_symlink():sys.exit("[loop] Unsafe destination")
    from datetime import datetime,timezone
    date=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    out=desktop/("Ioant-ChatGPT-Loop-Diagnostics-"+date+".zip")
    fd=os.open(out,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    try:
        with os.fdopen(fd,'wb') as dest:
            with zipfile.ZipFile(dest,'w',compression=zipfile.ZIP_DEFLATED) as z:
                for f,st in files[:10]:
                    if f.stat().st_ino!=st.st_ino:continue
                    z.write(f,arcname=f.name)
    except Exception:
        out.unlink(missing_ok=True)
        raise
    print("[loop] Exported privacy-filtered logs:",out)
PY
