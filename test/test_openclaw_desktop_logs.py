import importlib.util
from pathlib import Path
import tempfile
import json
import unittest
import zipfile

MODULE=Path(__file__).resolve().parents[1]/'scripts'/'openclaw-desktop-logs.py'
spec=importlib.util.spec_from_file_location('log_export',MODULE)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class LogExports(unittest.TestCase):
 def setUp(self):
  self.t=tempfile.TemporaryDirectory()
  self.root=Path(self.t.name)
  self.home=self.root/'home';self.home.mkdir(mode=0o700)
  (self.home/'Desktop').mkdir(mode=0o700)
  self.legacy=self.root/'legacy';self.legacy.mkdir(mode=0o700)
  self.events=self.home/'Library'/'Application Support'/'ioant-openclaw-ops'/'logs'/'chatgpt-loop'
  self.events.mkdir(parents=True,mode=0o700)
  self.supervisor=self.home/'Library'/'Logs'/'ioant-openclaw-ops'
  self.supervisor.mkdir(parents=True,mode=0o700)
  self.out=self.home/'Desktop'/'Ioant-OpenClaw-Logs'/'report.zip'
 def tearDown(self):self.t.cleanup()
 def add(self,base,name,value):
  file=base/name;file.write_text(value);file.chmod(0o600);return file
 def test_filters_raw_credentials_and_keeps_failure_categories(self):
  self.add(self.events,'run-20261027T023000Z-123-1234abcd.jsonl',json.dumps({'source':'ioant-loop','event':'worker_error','code':'timeout','at':'2026-10-27T02:30:00.000Z'})+'\n'+json.dumps({'source':'ioant-loop','event':'worker_error','secret':'SENSITIVE'})+'\n')
  self.add(self.supervisor,'stderr.log','/Volumes/LunaDrive/private Operation not permitted\nAuthorization: Bearer ghp_SECRET123\n')
  mod.export(self.home,self.legacy,self.out)
  with zipfile.ZipFile(self.out) as z:
   events=z.read('background-events.jsonl').decode(); summary=json.loads(z.read('supervisor-summary.json'))
   self.assertIn('timeout',events)
   self.assertNotIn('SENSITIVE',events)
   self.assertEqual(summary['stderr']['permission_denied'],1)
   for entry in z.namelist():
    body=z.read(entry)
    self.assertNotIn(b'ghp_SECRET',body)
    self.assertNotIn(b'/Volumes/LunaDrive/private',body)
  self.assertEqual(self.out.stat().st_mode & 0o777,0o600)
 def test_unprivate_files_not_exported(self):
  f=self.add(self.events,'run-20261027T023000Z-123-1234abcd.jsonl','{"source":"ioant-loop","event":"launcher_start"}\n')
  f.chmod(0o644)
  self.add(self.supervisor,'stdout.log','Stop requested\n')
  mod.export(self.home,self.legacy,self.out)
  with zipfile.ZipFile(self.out) as z:self.assertEqual(z.read('background-events.jsonl'),b'')
 def test_output_symlink_is_rejected(self):
  self.add(self.supervisor,'stderr.log','Operation not permitted\n')
  other=self.root/'elsewhere';other.mkdir()
  (self.home/'Desktop'/'Ioant-OpenClaw-Logs').symlink_to(other)
  with self.assertRaisesRegex(RuntimeError,'desktop_output_not_private'):mod.export(self.home,self.legacy,self.out)
 def test_existing_export_not_overwritten(self):
  self.add(self.supervisor,'stderr.log','Operation not permitted\n')
  mod.export(self.home,self.legacy,self.out)
  with self.assertRaises(FileExistsError):mod.export(self.home,self.legacy,self.out)

if __name__=='__main__':unittest.main()
