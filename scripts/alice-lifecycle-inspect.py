#!/usr/bin/env python3
"""Bounded read-only lifecycle proof, independent of the busy project runner."""
import datetime
import fcntl
import importlib.util
import inspect
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import time


def log_signals(text, pid):
    # Exact generated PID prefix, fixed categories only. Never return log lines,
    # login prompts, device codes, identities, environment or packet bodies.
    lines = []
    active = False
    matched = 0
    for line in text.splitlines():
        marker = re.match(r'^\[[^\]]{16,60} PID=(\d+)\] ', line)
        if marker:
            active = int(marker.group(1)) == pid
            matched += int(active)
        if active and len(line) <= 4096:
            lines.append(line)
    known = {
        'connect_timeout': r'(?:connect(?:ion)?|ping|raknet|login).{0,50}(?:timed? ?out|timeout)|(?:timed? ?out|timeout).{0,50}(?:connect|ping|raknet|login)',
        'server_id_conflict': r'server_id_conflict',
        'server_disconnect': r'\[Alice wire\] server_disconnect|"kind":"server_disconnect"',
        'server_kicked': r'\[Alice Bedrock\] kicked:',
        'transport_ended': r'"kind":"transport_ended"',
        'spawn_confirmed': r'spawn confirmed',
        'start_game_received': r'start_game_received|Bedrock login coordinate:',
        'auth_interaction_required': r'Device code \(private terminal only\)|microsoft\.com/link',
        'connection_refused': r'ECONNREFUSED',
        'network_unreachable': r'ENETUNREACH|EHOSTUNREACH',
        'runtime_exception': r'\b(?:TypeError|ReferenceError|SyntaxError|RangeError):',
        'operator_shutdown': r'\[Alice shutdown\] requested:|"kind":"operator_shutdown"',
    }
    errors = sorted(set(name for line in lines for name in
                    re.findall(r'\b(TypeError|ReferenceError|SyntaxError|RangeError):', line)))
    classes = {'undefined_property': r'Cannot read properties of (?:undefined|null)',
               'fetch_failed': r'TypeError: fetch failed',
               'null_object': r'Cannot convert undefined or null to object',
               'bigint_json': r'Do not know how to serialize a BigInt',
               'bigint_mixed': r'Cannot mix BigInt and other types',
               'bigint_conversion': r'Cannot convert .{0,100} to a BigInt',
               'number_conversion': r'Cannot convert a BigInt value to a number',
               'buffer_argument': r'first argument must be|must be of type (?:string|number|Buffer)',
               'readonly_property': r'Cannot assign to read only property',
               'undefined_write': r'Cannot set properties of (?:undefined|null)',
               'not_a_function': r'is not a function',
               'undefined_identifier': r'is not defined',
               'invalid_argument': r'ERR_INVALID_ARG|invalid argument'}
    frames = []
    vocabulary = set('cannot read write convert destructure properties property undefined null object function constructor callback listener argument arguments value type number string buffer bigint integer positive negative offset length size bounds array packet decode encode serializer expected received missing required invalid not is must be of to a an the from for in unsupported native error'.split())
    error_words = []
    for line in lines:
        if 'TypeError:' in line:
            message = line.split('TypeError:', 1)[1][:240]
            message = re.sub(r'([\'\"]).*?\1', '', message)
            error_words = [word.lower() for word in re.findall(r'[A-Za-z]+', message)
                           if word.lower() in vocabulary][:36]
        for file, row, col in re.findall(r'((?:src|lib|bedrock_plugins)/[A-Za-z0-9_./-]{1,140}\.(?:cjs|js)):(\d{1,6}):(\d{1,5})', line):
            if '..' not in file.split('/') and len(frames) < 12:
                frames.append({'file': file, 'line': int(row), 'column': int(col)})
    return {'matchedPidLines': matched, 'signals': sorted(
        name for name, pattern in known.items() if any(re.search(pattern, line, re.I) for line in lines)),
        'exceptionTypes': errors, 'exceptionCategories': sorted(
        name for name, pattern in classes.items() if any(re.search(pattern, line) for line in lines)),
        'errorWords': error_words, 'networkCodes': sorted(set(
            code for line in lines for code in re.findall(
            r'\b(ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|CERT_HAS_EXPIRED|UNABLE_TO_VERIFY_LEAF_SIGNATURE)\b', line))),
        'stackFrames': frames}


def probe(data):
    home = Path.home()
    source = home/'minecraft-ai/scripts'
    sys.path.insert(0, str(source))
    from alice_operator.process import AliceProcess
    from alice_operator.config import private_path, private_json
    from alice_operator.diagnostics import alice_processes
    app = AliceProcess()
    private_path(app.root, directory=True)
    root = app.root/'mcp-client-lifecycle'
    private_path(root, directory=True)
    claim = private_json(root/(data['operationId']+'.json'), limit=8192)
    if (claim.get('operationId') != data['operationId'] or
            claim.get('oldPid') != data['oldPid'] or claim.get('newPid') != data['newPid']):
        raise ValueError('remote_claim_mismatch')
    lock_fd = os.open(root/'lifecycle.lock', os.O_RDWR | os.O_NOFOLLOW)
    try:
        private_path(root/'lifecycle.lock')
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError('remote_lifecycle_still_active')
        out = {'schemaVersion': 1, 'operationId': data['operationId'],
               'observedAt': int(time.time()*1000),
               'remoteClaimState': claim.get('state'),
               'remoteClaimReason': claim.get('failureReason'),
               'remoteLifecycleIdle': True,
               'oldPidPresent': (Path('/proc')/str(data['oldPid'])).exists(),
               'newPidPresent': (Path('/proc')/str(data['newPid'])).exists(),
               'candidateCount': len(alice_processes(app)),
               'ownerPid': None, 'ownerStartMs': None, 'ownerVerified': False,
               'heartbeatFresh': False, 'connected': False, 'sessionEstablished': False,
               'worldVerified': False, 'portVerified': False,
               'log': {'matchedPidLines': 0, 'signals': [], 'exceptionTypes': [],
                       'exceptionCategories': [], 'errorWords': [], 'networkCodes': [], 'stackFrames': []}}
        owner = app.owner()
        if owner:
            spec = importlib.util.spec_from_file_location('alice_recovery_status', source/'alice-mint.py')
            cli = importlib.util.module_from_spec(spec);spec.loader.exec_module(cli)
            status = cli.status(app)
            _, token, _ = app.inspect(owner)
            raw = private_json(app.root/'status.json', limit=8192)
            out.update(ownerPid=owner['pid'], ownerStartMs=status.get('processStartAtUnixMs'),
                       ownerVerified=status.get('statusSource') == 'current_process' and
                       raw.get('producerPid') == owner['pid'] and raw.get('producerStartToken') == token,
                       heartbeatFresh=status.get('heartbeatFresh') is True,
                       connected=status.get('reportedConnected') is True,
                       sessionEstablished=status.get('sessionEstablished') is True,
                       worldVerified=raw.get('world') == 'Bedrock level',
                       portVerified=raw.get('serverPort') == 17879)
        logs = []
        for file in app.root.glob('operator-alice-*.log'):
            try:
                info = private_path(file)
                if data['startedAtMs']-5000 <= info.st_mtime*1000 <= data['finishedAtMs']+60000:
                    logs.append((info.st_mtime, file))
            except (ValueError, OSError):
                pass
        for _, file in sorted(logs, reverse=True)[:8]:
            with file.open('rb') as stream:
                stream.seek(0, 2);stream.seek(max(0, stream.tell()-65536))
                summary = log_signals(stream.read(65536).decode('utf8', 'replace'), data['newPid'])
            if summary['matchedPidLines']:
                out['log'] = summary
                break
        return out
    finally:
        os.close(lock_fd)


def main():
    data = json.loads(sys.argv[1] if len(sys.argv) == 2 else sys.stdin.read(4096))
    if (set(data) != {'operationId', 'oldPid', 'newPid', 'startedAtMs', 'finishedAtMs'} or
            not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{7,79}', data.get('operationId', '')) or
            any(type(data[k]) is not int or data[k] <= 0 for k in ('oldPid', 'newPid', 'startedAtMs', 'finishedAtMs'))):
        raise ValueError('invalid_inspection_input')
    source = ('import datetime,fcntl,importlib.util,json,os,re,sys,time\nfrom pathlib import Path\n' +
              inspect.getsource(log_signals) + '\n' + inspect.getsource(probe) +
              '\nprint(json.dumps(probe(' + repr(data) + ')))\n')
    result = subprocess.run(['/usr/bin/ssh', '-T', '-o', 'BatchMode=yes', '-o',
                             'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=8',
                             'tedz@192.168.0.104', '/usr/bin/python3 -c ' + shlex.quote(source)],
                            capture_output=True, text=True, timeout=25, check=False)
    if result.returncode or len(result.stdout) > 4096:
        raise ValueError('lifecycle_inspection_unavailable')
    print(json.dumps(json.loads(result.stdout)))


if __name__ == '__main__':
    main()
