#!/usr/bin/env python3
"""Operator-exported bounded OpenClaw log snapshot; launchd never writes Desktop."""
import collections
import datetime
import json
import os
from pathlib import Path
import re
import sys
import zipfile

EVENT_FILE = re.compile(r"run-\d{8}T\d{6}Z-\d{1,9}-[0-9a-f]{8}(?:\.part[1-3])?\.jsonl\Z")
EVENT_KEYS = frozenset({"at","source","event","action","taskId","status","code","elapsedMs","exitCode","profile","mode"})
SAFE_ATOM = re.compile(r"[A-Za-z0-9_-]{1,80}\Z")
MAX_FILE_BYTES = 2*1024*1024

def owned_private(path: Path, directory=False):
    try: info=path.lstat()
    except OSError: return False
    if path.is_symlink() or info.st_uid!=os.getuid() or info.st_mode & 0o077:return False
    return path.is_dir() if directory else path.is_file()

def filter_event(raw):
    try: o=json.loads(raw)
    except (ValueError,TypeError): return None
    if not isinstance(o,dict) or not set(o).issubset(EVENT_KEYS):return None
    if not all(isinstance(o.get(k),str) and SAFE_ATOM.fullmatch(o[k]) for k in ("source","event")):return None
    result={}
    for k,value in o.items():
        if k=="at":
            if isinstance(value,str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z",value):result[k]=value
        elif isinstance(value,str) and SAFE_ATOM.fullmatch(value):result[k]=value
        elif k in ("elapsedMs","exitCode") and type(value) is int and -1<=value<=2147483647:result[k]=value
    return result if result.get("source")=="ioant-loop" and result.get("event") else None

def recent_events(root: Path):
    if not owned_private(root,directory=True):return []
    files=[]
    for f in root.iterdir():
        if not EVENT_FILE.fullmatch(f.name) or not owned_private(f):continue
        info=f.stat()
        if info.st_size<=MAX_FILE_BYTES:files.append((info.st_mtime_ns,f))
    files.sort(reverse=True)
    selected=[]
    for _,file in files[:10]:
        events=[]
        with file.open("r",encoding="utf-8",errors="replace") as h:
            for line in h:
                event=filter_event(line)
                if event:events.append(event)
        selected.extend(events[-1000:])
    return selected[:3000]

def classify_line(line):
    if "Operation not permitted" in line or "Permission denied" in line:return "permission_denied"
    if "Temporary Gateway not ready" in line:return "gateway_start_failed"
    if "Waiting for authorized ChatGPT conversation" in line:return "chat_target_waiting"
    if "sameConversationId=0" in line or "No exact target tab" in line:return "chat_target_mismatch"
    if "No unique matching ChatGPT" in line:return "chat_target_missing"
    if "Diagnostic log:" in line:return "diagnostic_started"
    if "Stop requested" in line:return "worker_stop_requested"
    if "Feedback confirmed" in line or "receipt confirmed" in line:return "feedback_confirmed"
    if "[loop-log]" in line:return "diagnostic_log_error"
    if "error" in line.lower() or "failed" in line.lower():return "other_error"
    return None

def supervisor_summary(paths):
    counts={}
    for name,file in paths.items():
        count=collections.Counter()
        if owned_private(file) and file.stat().st_size<=8*1024*1024:
            with file.open("r",encoding="utf-8",errors="replace") as h:
                for line in h:
                    category=classify_line(line)
                    if category:count[category]+=1
        counts[name]=dict(count)
    return counts

def export(home:Path,legacy:Path,output:Path):
    roots={
      "background":home/"Library"/"Application Support"/"ioant-openclaw-ops"/"logs"/"chatgpt-loop",
      "legacy":legacy/"logs"/"chatgpt-loop"
    }
    safe={name:recent_events(root) for name,root in roots.items()}
    parent=home/"Library"/"Logs"/"ioant-openclaw-ops"
    summary=supervisor_summary({"stdout":parent/"stdout.log","stderr":parent/"stderr.log"})
    if not any(safe.values()) and not any(summary.values()):raise RuntimeError("no_private_worker_logs_found")
    desktop=home/"Desktop"
    if desktop.is_symlink() or not desktop.is_dir():raise RuntimeError("desktop_unavailable_or_symlink")
    if output.parent!=desktop/"Ioant-OpenClaw-Logs":raise RuntimeError("untrusted_output_location")
    output.parent.mkdir(mode=0o700,exist_ok=True)
    if not owned_private(output.parent,directory=True):raise RuntimeError("desktop_output_not_private")
    fd=os.open(output,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    try:
        with os.fdopen(fd,"wb") as dest,zipfile.ZipFile(dest,"w",compression=zipfile.ZIP_DEFLATED) as archive:
            for name,events in safe.items():
                archive.writestr(name+"-events.jsonl","".join(json.dumps(e,ensure_ascii=False)+"\n" for e in events))
            archive.writestr("supervisor-summary.json",json.dumps(summary,ensure_ascii=False,indent=2)+"\n")
            archive.writestr("README.txt","Sanitized events and supervisor error categories only. No raw Gateway logs, command output, chat content, URLs or auth data. The background worker writes private local logs; this archive is an operator export.\n")
    except BaseException:
        output.unlink(missing_ok=True)
        raise
    return output

def main():
    if len(sys.argv)!=1:raise SystemExit("usage: python3 scripts/openclaw-desktop-logs.py")
    home=Path.home()
    legacy=Path("/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos")
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output=home/"Desktop"/"Ioant-OpenClaw-Logs"/("IOANT-OpenClaw-Logs-"+stamp+".zip")
    print("[logs] Desktop export:",export(home,legacy,output))

if __name__=="__main__":
    try:main()
    except (OSError,RuntimeError) as exc:
        print("[logs] Export failed:",str(exc),file=sys.stderr)
        raise SystemExit(1)
