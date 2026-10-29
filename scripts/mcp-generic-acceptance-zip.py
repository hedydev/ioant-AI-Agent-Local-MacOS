"""Package only the prior fixture report in the runner's private output directory."""
import os
import pathlib
import stat
import sys
import zipfile

try:
    root = pathlib.Path(os.environ["OPENCLAW_OUTPUT_DIR"])
    mode = root.lstat()
    source = root / "report.json"
    if len(sys.argv) != 1 or not root.is_absolute() or root.resolve() != root or not stat.S_ISDIR(mode.st_mode) or mode.st_uid != os.getuid() or mode.st_mode & 0o077:
        raise ValueError()
    entry = source.lstat()
    if not stat.S_ISREG(entry.st_mode) or stat.S_ISLNK(entry.st_mode) or entry.st_uid != os.getuid() or entry.st_size > 4096:
        raise ValueError()
    with zipfile.ZipFile(root / "report.zip", "x", compression=zipfile.ZIP_STORED) as archive:
        archive.writestr("report.json", source.read_bytes())
    print("OPENCLAW_GENERIC_ARCHIVE_WRITTEN")
except Exception:
    print("OPENCLAW_GENERIC_ARCHIVE_FAILED")
    sys.exit(2)
