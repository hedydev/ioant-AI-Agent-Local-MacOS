"""Read exactly one declared UTF-8 ZIP member. Never extract an archive."""
import stat
import sys
import zipfile

def safe(name):
    return bool(name) and not name.startswith(("/", "-")) and ":" not in name and "\\" not in name and all(
        p not in ("", ".", "..", ".git") for p in name.rstrip("/").split("/")) and not any(ord(c) < 32 or ord(c) == 127 for c in name)

try:
    if len(sys.argv) != 3 or not safe(sys.argv[2]):
        raise ValueError()
    with zipfile.ZipFile(sys.argv[1]) as archive:
        entries = archive.infolist()
        if len(entries) > 64 or len({e.filename for e in entries}) != len(entries) or sum(e.file_size for e in entries) > 8388608:
            raise ValueError()
        for entry in entries:
            mode = entry.external_attr >> 16
            if not safe(entry.filename) or entry.flag_bits & 1 or stat.S_ISLNK(mode) or entry.file_size > max(1, entry.compress_size) * 100:
                raise ValueError()
        member = archive.getinfo(sys.argv[2])
        if member.is_dir() or member.file_size > 262144:
            raise ValueError()
        data = archive.read(member)
        sys.stdout.buffer.write(data.decode("utf-8", errors="strict").encode("utf-8"))
except Exception:
    sys.exit(2)
