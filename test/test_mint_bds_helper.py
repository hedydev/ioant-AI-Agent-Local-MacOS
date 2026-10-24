#!/usr/bin/python3
"""Offline mocked tests; never invokes sudo or real BDS."""
import importlib.util
import subprocess
import unittest
from pathlib import Path

path=Path(__file__).resolve().parents[1]/"scripts/mint-bds-diagnostics.py"
spec=importlib.util.spec_from_file_location("bds_helper",path)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

def row(port,pid):
    return 'UNCONN 0 0 0.0.0.0:{} 0.0.0.0:* users:(("bedrock_server",pid={},fd=5))'.format(port,pid)

class Safety(unittest.TestCase):
    def witness(self,cwd="/home/tedz/minecraft-bedrock-alice-lab",first=None,second=None,change_birth=False):
        default=row(17879,44)+"\n"+row(17880,1712655)
        outputs=[default if first is None else first,default if second is None else second]
        counter=[0]
        def run(argv,**kw):
            self.assertEqual(argv,m.CMD)
            self.assertFalse(kw.get("shell",False))
            return subprocess.CompletedProcess(argv,0,outputs.pop(0))
        def proc(pid):
            self.assertEqual(pid,1712655)
            counter[0]+=1
            start=1001+(counter[0] if change_birth else 0)
            # state is field 3, ppid field 4, starttime field 22.
            columns=["S","31"]+["0"]*17+[str(start)]
            return m.birth(pid,lambda _:"{} (bedrock_server) ".format(pid)+" ".join(columns))
        def link(s):
            return cwd if s.endswith("/cwd") else cwd+"/bedrock_server"
        return m.inspect(run=run,read_birth=proc,read_comm=lambda _: "bedrock_server",
                         read_link=link,now=lambda:1792800907)
    def test_lab_classification(self):
        ans=self.witness()
        self.assertEqual(ans["state"],"observed")
        self.assertEqual(ans["classification"],"isolated_lab_directory")
        self.assertNotIn("/home/",str(ans))
    def test_production_directory(self):
        self.assertEqual(self.witness(cwd="/home/tedz/minecraft-bedrock")["classification"],
                         "production_directory")
    def test_production_port_collision(self):
        s=row(17880,1712655)+"\n"+row(17879,1712655)
        self.assertEqual(self.witness(first=s,second=s)["classification"],"production_port_owner")
    def test_birth_change_fails_closed(self):
        self.assertEqual(self.witness(change_birth=True)["reason"],
                         "process_or_socket_changed_during_audit")
    def test_unrelated_port_rejected(self):
        with self.assertRaises(ValueError):
            m.parse_sockets(row(18789,20))

if __name__=="__main__":
    unittest.main()
