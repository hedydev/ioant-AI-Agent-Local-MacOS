#!/usr/bin/python3
"""Root-owned, fixed-scope Minecraft BDS socket identity: read-only, no args."""
import hashlib
import json
import os
import re
import subprocess
import sys
import time

CMD=["/usr/bin/ss","-H","-u","-a","-n","-p","(","sport","=",":17879","or",
     "sport","=",":17880","or","sport","=",":17881",")"]
OWNER=re.compile(r'\("([A-Za-z0-9_.-]{1,40})",pid=([1-9][0-9]{0,9}),fd=[0-9]{1,8}\)')
AUDIT="IOANT_MINT_BDS_PROCESS_IDENTITY"

def parse_sockets(value):
    if not isinstance(value,str) or len(value)>8192: raise ValueError("size")
    rows=[]
    for line in value.splitlines():
        if not line.strip(): continue
        columns=line.split()
        if len(columns)<5: raise ValueError("fields")
        port=re.search(r":(17879|17880|17881)$",columns[3])
        if not port: raise ValueError("unrelated_socket")
        owners=[]
        for name,pid_str in OWNER.findall(line):
            pid=int(pid_str)
            if pid>2147483647: raise ValueError("pid_range")
            if (pid,name) not in owners: owners.append((pid,name))
        if len(rows)>=8 or len(owners)>2: raise ValueError("ambiguous")
        rows.append((int(port.group(1)),owners))
    return rows

def birth(pid,reader=None):
    if reader is None:
        def reader(path):
            with open(path,encoding="utf-8") as f: return f.read(4097)
    raw=reader("/proc/{}/stat".format(pid))
    end=raw.rfind(")")
    if end<0 or len(raw)>4096 or not raw.startswith(str(pid)+" ("):
        raise ValueError("stat")
    columns=raw[end+2:].split()
    if len(columns)<20: raise ValueError("stat_short")
    ppid,tick=int(columns[1]),int(columns[19])
    if not (0<=ppid<=2147483647 and tick>0): raise ValueError("birth")
    return ppid,tick

def inspect(run=subprocess.run,read_birth=birth,read_link=os.readlink,read_comm=None,now=time.time):
    if read_comm is None:
        def read_comm(pid):
            with open("/proc/{}/comm".format(pid),encoding="utf-8") as f:
                return f.read(128).strip()
    t=int(now())
    def answer(state,**fields):
        return dict(audit=AUDIT,schemaVersion=1,readOnly=True,
                    observedAtUnix=t,port=17880,state=state,**fields)
    def snapshot():
        r=run(CMD,capture_output=True,text=True,check=False,timeout=8,
              env={"LC_ALL":"C","PATH":"/usr/bin:/bin"})
        if r.returncode!=0: raise OSError("ss")
        return parse_sockets(r.stdout)
    try:
        first=snapshot()
        matches=[owners for p,owners in first if p==17880]
        if len(matches)!=1 or len(matches[0])!=1:
            return answer("inconclusive",reason="no_unique_visible_owner")
        pid,name=matches[0][0]
        if name!="bedrock_server":
            return answer("inconclusive",reason="unexpected_process_name")
        first_birth=read_birth(pid)
        first_comm=read_comm(pid)
        cwd=read_link("/proc/{}/cwd".format(pid))
        exe=read_link("/proc/{}/exe".format(pid))
        second_birth=read_birth(pid)
        second_comm=read_comm(pid)
        again=snapshot()
        second_matches=[owners for p,owners in again if p==17880]
        if first_birth!=second_birth or first_comm!=second_comm or second_matches!=[[(pid,name)]]:
            return answer("inconclusive",reason="process_or_socket_changed_during_audit")
        if second_comm!="bedrock_server" or not exe.endswith("/bedrock_server"):
            return answer("inconclusive",reason="unexpected_executable_or_process")
        prod={i for p,owners in again if p==17879 for i,_ in owners}
        shared=pid in prod
        classification=("production_port_owner" if shared else
          "production_directory" if cwd=="/home/tedz/minecraft-bedrock" else
          "isolated_lab_directory" if cwd=="/home/tedz/minecraft-bedrock-alice-lab" else
          "other_or_unverified_directory")
        return answer("observed",pid=pid,parentPid=second_birth[0],
          process="bedrock_server",
          birthTag=hashlib.sha256("{}:{}".format(pid,second_birth[1]).encode()).hexdigest()[:12],
          classification=classification,sharesProductionPort=shared,
          productionPortOwnerVisible=bool(prod),executableMatches=True,
          note="point_in_time_identity_only_no_permission_to_stop_or_reprobe")
    except (OSError,ValueError,subprocess.SubprocessError):
        return answer("inconclusive",reason="socket_inspection_unavailable")

if __name__=="__main__":
    if len(sys.argv)!=1 or os.geteuid()!=0: raise SystemExit(2)
    print(json.dumps(inspect(),sort_keys=True,separators=(",",":")))
