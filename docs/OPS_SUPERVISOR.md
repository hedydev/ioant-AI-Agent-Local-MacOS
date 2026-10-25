# OpenClaw Ops — Mac watcher supervisor (stage 1)

The ChatGPT-led watcher already supports safe self-updates, but cannot change permissions omitted at startup. A text-only AI Agent must NOT get unrestricted terminal execution just to control its own process manager.

## Roles and scope

ChatGPT coordinates approved fixed actions; **openclaw-dev** remains the independent no-tools Gemma 4 technical advisor. A future **openclaw-ops** advisor may recommend operational tasks but MUST NOT invoke raw shell. A Mac-owned launchd supervisor performs only user-preapproved lifecycle operations; the watcher continues to accept only fixed structured tasks and exact ChatGPT tab IDs.

This first version is limited to **one-time user installation plus automatic self-update reload**. It does NOT yet provide arbitrary configuration changes, automatic recovery from all faults, or AI-driven terminal operations.

## Fixed launch policy

The stage2/ops-supervisor.mjs installer configures a user LaunchAgent named com.ioant.openclaw.safe-watcher with fixed parameters:

- Exact project ChatGPT conversation; Chrome extension profile; one watcher.
- --enable-self-update: clean main + fixed origin + candidate tests + safe fast-forward + controlled worker reload.
- --enable-gui-readonly: bounded DOM control roles, safe labels and geometry; no clicks, screenshots, input values or page text.
- --dev-agent openclaw-dev and --watch; no Agent creation, provisioning, Mint/BDS operation or elevated tool flags.
- User-level LaunchAgents only, not LaunchDaemons; no sudo or process kills.
- Private LunaDrive logs with owner-only access and launchd Umask 077.
- RunAtLoad=true; KeepAlive=false so browser/Gateway failures do not create unlimited restart loops.

The Mac must have an existing **non-interactively healthy** OpenClaw Gateway. No Gateway credentials are included in the plist or passed to the model. If health/auth cannot be established without prompting, the installer stops. The LaunchAgent uses a pinned PATH containing the **canonical directory of the Node.js binary actually running the installer**, followed by the fixed Homebrew and system PATH entries. This supports nvm, fnm, Volta and private LunaDrive installs without changing system PATH or installing a second Node. Before pinning, the installer requires a supported private or system root, regular executable file, current-user/root ownership, and no group/other write access or symlink anywhere along the canonical path. If any condition is uncertain it blocks with `unsafe_node_runtime`. The service status/uninstall routines validate the previously pinned PATH against the full known plist template, even if a later terminal uses a different Node version.

## Once-only operator setup AFTER a verified Mac test-gated update

Stop the existing foreground watcher normally with Ctrl+C; never run two workers for the same conversation. The installer refuses an existing watcher lock and will never force-stop an unrelated process.

Mac terminal commands:

    cd ~/Documents/workspace/ioant-AI-Agent-Local-MacOS
    bash scripts/dev-env.sh exec node stage2/ops-supervisor.mjs install

The installer validates macOS, exact repository path, clean main and allowed origin, canonical mounted LunaDrive, private log paths, authorized Gateway CLI health and absence of an existing watcher. It then registers and starts only the fixed user service. It does not run on Git checkout or automatically grant permissions to ChatGPT.

Status and rollback:

    node stage2/ops-supervisor.mjs status
    node stage2/ops-supervisor.mjs uninstall

Uninstall removes only the verified service entry and leaves project data, logs, Gateway/Agent configuration and Alice/Minecraft untouched.

## Acceptance and future extension

First stage the supervisor code through project-update-verify, requiring ALL native Mac tests to pass before ff-only. After the one-time operator install, check service registration and the actual exact Chrome-tab watcher startup; then issue a read-only GUI observation and require the bounded successful receipt. The installer reporting 'installed' is not itself proof that a browser observation succeeded.

Next, develop locally gated, fixed ops-status / ops-restart actions requiring the previously installed supervisor and a one-shot receipt-first restart, without granting the AI an exec tool or allowing arbitrary flags, PIDs or paths. A future openclaw-ops advisory Agent should remain no-tools and call the existing authorized dispatcher indirectly.

An LLM message by itself must not broaden the authorization of a previously launched process. This is the reason that the first supervisor installation remains a single explicit Mac operator action.

## 2026-10-25 — real Mac EX_CONFIG(78) recovery: external launchd logs

First on-device install successfully bootstrapped `com.ioant.openclaw.safe-watcher` but the service never spawned: `launchctl print` showed `state = not running`, `runs = 1`, `last exit code = 78: EX_CONFIG`. The exact watcher process was absent and the LunaDrive-based `logs/ops-supervisor/stdout.log` and `stderr.log` were empty. Mac service troubleshooting reports this exact pre-exec failure when StandardOutPath/StandardErrorPath target external APFS mounts, even with normal interactive file access. Root cause is highly plausible but not yet independently verified on this Mac.

**Change:** only launchd's own stdout/stderr are redirected to owner-private `~/Library/Logs/ioant-openclaw-ops/` on the internal Mac disk. The existing application diagnostic streams and caches remain on LunaDrive. Installation checks the `~/Library/Logs` parent is user-owned, canonical, non-symlink and not group/other writable, and the dedicated child directory and log files are private. It never changes volume/TCC permissions and does not remove old logs.

The new `status` distinguishes `running` (launchctl reports both running state and a process PID), `stopped` (registered but no running PID, reports numeric exit code when present), and `unloaded` (known plist but no service). A registered PID does NOT yet prove browser or Gateway health. `uninstall` recognizes exactly two known, complete project-generated plist versions (previous external logs and new internal logs) using the previously pinned Node directory; it refuses edits or other service labels.

Recovery of the already failed **known** service requires one terminal sequence AFTER the revised Git candidate passes all tests:

    cd ~/Documents/workspace/ioant-AI-Agent-Local-MacOS
    bash scripts/dev-env.sh exec node stage2/project-self-update.mjs && \\
    bash scripts/dev-env.sh exec node stage2/ops-supervisor.mjs uninstall && \\
    bash scripts/dev-env.sh exec node stage2/ops-supervisor.mjs install && \\
    bash scripts/dev-env.sh exec node stage2/ops-supervisor.mjs status

This is an explicit user-local graceful bootout of only the exact service followed by a new plist registration. Never manually edit launchd plists, move system logs, force-kill unknown PIDs or bypass the test gate. If any step reports blocked/inconclusive, stop and inspect that receipt. After local status returns `running`, verify a new read-only exact ChatGPT tab probe before claiming a healthy end-to-end loop.


## 2026-10-25 — EX_CONFIG resolved; Documents TCC denial and isolated runtime

The user confirmed the second migration's Mac suite **337/337 passed**; uninstall and install succeeded but status was **stopped**, `lastExitCode:126`, `logLocation:local`. Crucial new internal stderr evidence:

`/bin/bash: /Users/ted/Documents/workspace/ioant-AI-Agent-Local-MacOS/scripts/chatgpt-loop.sh: Operation not permitted`

No shell script startup output was produced. Its plain POSIX permission was `-rw-------` and parent Documents directory `drwx------@`: owner-read is not an executable-bit issue because /bin/bash reads the script. The background launchd process cannot assume Terminal.app's macOS privacy grant to Documents. Do NOT chmod 777, disable TCC, or grant broad Full Disk Access to /bin/bash.

Candidate revision uses an independent fixed private local runtime checkout under `~/Library/Application Support/ioant-openclaw-ops/runtime`. During explicit local install, only the trusted clean main source checkout in Documents is read. The installer validates origin and HEAD, prevents Git symlinks/submodules with tracked mode checks, makes a separate local Git clone via `--no-local --single-branch --branch main` and then pins its origin to the previously verified public GitHub remote. It verifies the runtime copy is private, clean, on main, at the exact source HEAD, with real owned non-group-writable script and directory. No Git object hardlinks to Documents. The login agent's fixed ProgramArguments now points to the private runtime script, not Documents; ordinary test-gated updates operate on the runtime checkout itself and do not mutate the source Documents checkout. The documents checkout can still be updated manually when desired; project changes remain committed to GitHub main.

The background worker's task Markdown reports now go to `~/Library/Application Support/ioant-openclaw-ops/reports/chatgpt-loop` instead of the TCC-protected Desktop. Existing foreground watcher mode retains Desktop reports; LunaDrive's current per-chat state, feedback receipts and one-shot claims are preserved. This new privacy mode is pinned only in the supervisor's plist. The installed Supervisor continues to use private stdout/stderr on `~/Library/Logs/ioant-openclaw-ops`.

The updated explicit uninstall command recognizes the TWO existing exact legacy Documents plists: old external log redirection and newer local log redirection; unknown or modified services remain blocked. The new runtime plist is fully distinguished. No arbitrary command or model privilege has been introduced.

After full candidate Mac tests pass, perform exactly one local migration:

    cd ~/Documents/workspace/ioant-AI-Agent-Local-MacOS
    bash scripts/dev-env.sh exec node stage2/project-self-update.mjs &&
      bash scripts/dev-env.sh exec node stage2/ops-supervisor.mjs uninstall &&
      bash scripts/dev-env.sh exec node stage2/ops-supervisor.mjs install &&
      sleep 3 &&
      bash scripts/dev-env.sh exec node stage2/ops-supervisor.mjs status

Note: shell continuation formatting should be used in the terminal, not copied with Markdown indentation. If a step is blocked do not force delete the existing plist, Git runtime or task locks. Real Mac test-gated candidate, first runtime process PID, Gateway/browser health and GUI-readonly response remain UNVERIFIED as of this Git-only fix. If status remains stopped inspect LOCAL launchd stderr; if running, then issue a new read-only GUI probe rather than assuming end-to-end success.
