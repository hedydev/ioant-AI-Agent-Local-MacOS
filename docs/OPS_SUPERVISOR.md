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


## Candidate test/archive path regression (2026-10-25)

The Mac's candidate test gate rejected the first private-runtime release at `test/ops-runtime-isolation.test.mjs:25` (340/341 passed). The issue was a test/reconstruction path mismatch: the old LaunchAgent's Documents script path was previously reconstructed from module-relative `ROOT`. During pre-merge tests `ROOT` points to the updater's isolated LunaDrive candidate directory, not the fixed historical source checkout. The old exact-match plist must always reconstruct from `~/Documents/workspace/ioant-AI-Agent-Local-MacOS`, independent of where the candidate runs.

The fix uses a fixed, explicit `LEGACY_REPO` under the operator's home only for recognized legacy service templates; the current LaunchAgent continues to use private Application Support runtime. Unit tests now enforce the separation and refuse arbitrary legacy variants. Do not skip the macOS candidate test gate or attempt install until all tests pass.


## 2026-10-25 — Chrome All-tabs project-path drift and private runtime updates

The user's Chrome extension is definitively **Connected, All tabs**, automatic bootstrap ready, extension v2.3.0 and Gateway healthy. Both Chrome screenshots showed the same user profile. Nevertheless `browser --browser-profile chrome --json tabs` returned only 2 eligible tabs (1 ChatGPT) while 4 ChatGPT tabs were visibly open across two Chrome windows. This is a separate OpenClaw target-enumeration discrepancy; do not mislabel it an All-tabs authorization error or assume missing tabs are hidden by our script.

Crucial diagnostic: the single exposed ChatGPT URL shares the fixed target *conversation ID* but has a different complete project path. The launcher and worker previously demanded the old full project URL. They now select only a **single unique validated ChatGPT conversation ID**, preserving the originally configured ID, existing chat lock/state/receipt key, and validating the actual DOM URL again. Strict HTTPS, chatgpt.com origin, query/fragment-free `/c/id` or `/g/project/c/id` shape remain mandatory. Duplicate matching IDs refuse to run, even if one is exact. This fix does not expose other tabs or grant more browser permissions.

A running *installed* service executes code from `~/Library/Application Support/ioant-openclaw-ops/runtime`, independently from the operator's Documents source checkout. For a code-only update with this service currently stopped, run both safe candidate-test-gated updaters before one restart:

    cd ~/Documents/workspace/ioant-AI-Agent-Local-MacOS &&
    bash scripts/dev-env.sh exec node stage2/project-self-update.mjs &&
    cd "$HOME/Library/Application Support/ioant-openclaw-ops/runtime" &&
    bash scripts/dev-env.sh exec node stage2/project-self-update.mjs &&
    launchctl kickstart "gui/$(id -u)/com.ioant.openclaw.safe-watcher" &&
    sleep 4 &&
    bash scripts/dev-env.sh exec node stage2/ops-supervisor.mjs status

Important: the final status invocation should be executed from **the Documents checkout** if there are ever source-based path checks on future revisions; the current status implementation uses only the known plist template and macOS. Avoid running a service before runtime project update passes. The Supervisor's `KeepAlive=false` still means a browser mismatch can leave it stopped. Inspect private local logs for actual browser match and then verify JSON task feedback separately; a PID alone does not prove conversation messaging.


## 2026-10-25 — Passive Chrome tab recovery without broadening access

After both protected local updates passed **344/344** Mac tests, the background watcher started but terminated with `lastExitCode=1` because initial `chrome tabs` returned 4 eligible tabs (2 ChatGPT) and none of those returned target ID. A previous observation returned 2 eligible tabs (1 ChatGPT) and the correct ID under a renamed project URL. Extension was Connected, All tabs, v2.3.0 matched, doctor green. Multiple independent snapshots of tab enumeration disagree; do not diagnose a Chrome profile mismatch, insist on Selected tabs, or replace Gateway/Chrome.

The new launcher distinguishes explicit `--watch` from `--once` and retains all hard safety gates. When 0 matching ID and watch mode is requested, startup no longer exits; it starts the existing private-runtime Node worker, which **waits passively** for a single strictly validated HTTPS ChatGPT conversation-ID tab, polling every configured interval (default 15 seconds). The worker confirms the actual DOM URL again before reading assistant-role tasks or sending feedback; it does not browse other pages, auto-open a personal Chrome tab, broaden permissions, write browser settings or attempt authentication. Repeated startup absence produces concise logs at most once per minute. A duplicate ID remains an error in the launcher; once/read-only mode remains fail-closed on missing target. Malformed browser metadata remains an error. If the Chrome extension's tabs fluctuate, the worker can become ready later without the operator manually restarting launchd.

To deploy when the fixed supervisor is already installed but `stopped`: from an interactive Mac Terminal use the exact protected source update, followed by private runtime update. Only after both return `updated`/`up_to_date`, call `launchctl kickstart gui/$(id -u)/com.ioant.openclaw.safe-watcher` once. Then check status and recent stdout/stderr. Expected outcome may be `running` and `Waiting for authorized ChatGPT conversation` (watcher alive, browser NOT yet ready), not necessarily a completed ChatGPT roundtrip. Do not report `healthy` until the worker logs `page_ready` and a real task receipt is confirmed. If startup still terminates, diagnose the new exit and avoid blind restarts.

## 2026-10-27 — Background logger TCC fix and Desktop export (source change; Mac rollout pending)

Operator's read-only evidence on 2026-10-27:
- Documents checkout `2452fc3285f8b02759d0bfb91646a4fc2434efe0`; separate LaunchAgent runtime checkout `3e874c27d894eb767725657b44368cb3a4082169`. The runtime is **not** synchronized with the checkout or latest remote `main`.
- Registered LaunchAgent `com.ioant.openclaw.safe-watcher` is **stopped**, `lastExitCode=1`, no watcher process. Gateway itself remained healthy. Consequently no ChatGPT automated task was delivered or acknowledged through this stopped worker.
- The private local `stderr.log` ended with `Operation not permitted` redirecting the temporary Gateway log to `/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos/logs/`; the watcher also reported a failure appending a LunaDrive JSONL diagnostic. The preceding, repeated `different_chat_visible` observations show no authorized browser tab with the **fixed old conversation ID**; this is a separate binding/visibility issue, not proof of revoked browser permissions.
- A background LaunchAgent may lack Terminal's TCC permissions for **both** external volumes and Desktop. Never change its plist `StandardOutPath` / `StandardErrorPath` to `~/Desktop` or `/Volumes/LunaDrive`: those stay at the tested `~/Library/Logs/ioant-openclaw-ops/{stdout,stderr}.log`.

**Source fix:** when the pinned `IOANT_BACKGROUND_SAFE_REPORTS=1` is present, `scripts/chatgpt-loop.sh` now selects `~/Library/Application Support/ioant-openclaw-ops/logs/` for both private JSONL events and transient Gateway raw diagnostics. `stage2/diagnostic-log.mjs` only accepts this exact background path with private-owner, non-symlink checks; foreground logs retain the old project cache location for compatibility. This avoids launching Gateway with a shell redirection to the inaccessible LunaDrive directory. It does **not** change Gateway credentials, Chrome permissions, fixed ChatGPT target, process restart policy, or any state locks.

**Desktop logs:** from an **interactive Mac Terminal** after synchronizing source, run:

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS" &&
bash scripts/chatgpt-loop-logs.sh bundle
```

It writes a bounded, private `~/Desktop/Ioant-OpenClaw-Logs/IOANT-OpenClaw-Logs-<UTC>.zip` containing allowlisted JSONL event fields from the current background and legacy LunaDrive logs plus **category counts** from `~/Library/Logs/ioant-openclaw-ops/{stdout,stderr}.log`. The ZIP deliberately does not contain raw Gateway logs, secret-bearing command output, chat text, URLs or credentials. `bash scripts/chatgpt-loop-logs.sh` defaults to `bundle`; `latest` and `tail` remain read-only. A ZIP export is an **operator action** so macOS TCC permissions cannot break background worker startup; it is not live mirroring to Desktop. Terminal may ask for normal Desktop authorization.

Before deploying the changed background Worker, run `python3 -m unittest discover -s test -p 'test_openclaw_desktop_logs.py' -v`, `node --test`, and `bash -n scripts/chatgpt-loop.sh scripts/chatgpt-loop-logs.sh` on the real Mac. Follow the existing protected source and private runtime update gates; a Documents checkout update alone does **not** update the deployed runtime. Do not claim successful Worker restart, exact ChatGPT tab binding, delivery receipt or macOS acceptance based on offline tests or this documentation commit alone. Examine the exported sanitized ZIP and target ID before any controlled restart.

## 2026-10-27 — Desktop log ZIP returned; evidence-based next gates

Operator exported `IOANT-OpenClaw-Logs-20261026T191716Z.zip` after the `efbbdf5` test repair. The ZIP contains `background-events.jsonl` (**empty**), `legacy-events.jsonl` (**1430 filtered JSONL events**), `supervisor-summary.json`, and README. A successful ZIP export **does not establish** that the new background worker was ever running. These are historical events, with event timestamps spanning **2026-10-24T23:54:48.925Z through 2026-10-26T09:23:11.085Z**, not a live activity feed.

Exact observed legacy event counts: `launcher_start=10`, `gateway_existing=9`, `gateway_error=1`, `launcher_exit=9`, `tab_found=2`, `tab_missing=7`, `worker_start=8`, `page_ready=6`, `page_not_ready=1251`, `action_started=10`, `action_finished=9`, `feedback_pending=9`, `feedback_confirmed=9`, `worker_error=1`. The 1251 `page_not_ready` entries are labeled `unexpected`: not specific enough to blame OAuth/Chrome or user permissions. During **2026-10-25T00:32:15Z to 02:30:47Z**, one earlier run completed 9 actions and confirmed 9 feedback receipts, so the bridge has genuinely worked in the past. Later runs show long, repeated target-not-ready periods, not successful new exchanges. The final recorded run lasted ~4.4 seconds: `launcher_start 2026-10-26T09:23:06.718Z` → `gateway_error 09:23:10.914Z` → `launcher_exit exitCode=1 09:23:11.085Z`.

`supervisor-summary.json` counts historical raw stdout/stderr categories across the whole file, not just the final run: stdout `diagnostic_started=8,chat_target_waiting=1251,worker_stop_requested=4`; stderr `permission_denied=2,chat_target_mismatch=3,chat_target_missing=3,diagnostic_log_error=1,gateway_start_failed=1`. Correlate to the operator's earlier raw stderr, which showed a temporary Gateway log shell redirection into LunaDrive failing `Operation not permitted`. The new remote code relocates this log only for `IOANT_BACKGROUND_SAFE_REPORTS=1`. **Do not claim the background TCC issue is fixed on Mac until the isolated Application Support runtime checkout has been fast-forward updated, restarted once under operator control, and emits fresh background log events.**

Deployment order: (1) protected clean-main source update + test gate, (2) protected separate private-runtime update + test gate, (3) deliberate *one* `launchctl kickstart` of only the known stopped managed LaunchAgent, (4) verify Supervisor `running` **and** a fresh `background-events.jsonl` `launcher_start`/`worker_start` event, (5) separately verify the target ChatGPT conversation identity and delivery receipt. A PID alone is not a ChatGPT roundtrip; without a fresh matching target tab, `--watch` should wait safely. Do not change the fixed chat URL by guessing another conversation ID. Do not delete watcher locks, kill unknown processes, reset state, change Chrome permissions, or touch Alice/Minecraft. The standalone `project-self-update` applies only a fixed origin/main ff-only update after tests, and must be run separately in BOTH checkouts.

**Residual risk:** moving event logs and the temporary Gateway redirection off LunaDrive does not itself migrate `PROJECT_DEV_CACHE`/the ChatGPT task-state ledger, which still references the external volume; if launchd TCC blocks other cache reads/writes after rollout, obtain the new local background stderr and stop for a separate safe, idempotent state migration, not a blind path rewrite that loses one-shot receipts.

## 2026-10-27 — Operator-approved same-Project Chat rebind (deployment pending)

The operator supplied the **exact active ChatGPT conversation URL**:

```text
https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/6adf6584-1a40-83ec-a4ab-c59ac7e28cf7
```

It has the same verified URL-derived Project ID as the legacy Supervisor target `6add3565-d868-83ec-804e-1e7a00eb0a59`, but a different conversation ID. The separate `config/chat-projects.json` Project binding now points at the operator-confirmed new conversation. URL-derived Project ID alone is not a live browser access/DOM receipt.

**New implementation**: `stage2/ops-rebind.mjs` exposes two **terminal-only** commands `rebind <exact-project-chat-url>` and `start <exact-project-chat-url>`. Neither is an `ioant-mac-ops-v1` ChatGPT task action; no model gets arbitrary LaunchAgent control. `stage2/ops-supervisor.mjs` now recognizes only a strict known plist template where the single `--chat-url` argument can vary within the exact registered Project; other ProgramArguments, environment, script root, stdout/stderr, privilege flags and permissions must match unchanged.

**Rebind gate:** macOS + expected Documents repository path; both source and private runtime clean on `main`, matching exact HEAD with allowlisted GitHub origin; required external state cache mounted; installed plist private and fully recognized; **launchctl explicitly proves the existing service stopped, no PID**; neither old nor new conversation has `watch.lock`; the requested new chat has no preexisting `state.json`. Copy the exact old plist to an owner-private, non-overwriting `~/Library/Application Support/ioant-openclaw-ops/rebind-backups` recovery file before `launchctl bootout`. Then atomically replace just the validated plist URL. **Do not bootstrap during `rebind`**. Return `rebound_unloaded` and old/new IDs only if the new plist is independently recognized and launchd remains unregistered. If failure occurs after bootout, stop and inspect the recovery backup; **never auto-replay or guess**. Old watcher state, receipt history, service logs, locks and AliceAI/Minecraft are untouched.

**Start gate:** an explicit separate `start <exact-project-chat-url>` must match the stored current plist, with launchd still unregistered, both Git HEADs matching and clean, no target `watch.lock`, and a healthy already configured Gateway. `launchctl bootstrap` then invokes `RunAtLoad`; `start_requested` is **not** proof the Worker remained alive or that it accessed/sent to ChatGPT. Current `--watch` behavior is passive on missing tab. Check `stage2/ops-supervisor.mjs status`, fresh local background events, the exact Chrome target, and an actual new `[IOANT-MAC-OPS RESULT ...]` receipt before claiming success.

### Mac operator rollout (only after candidate gates pass)

```bash
SRC="$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
RUNTIME="$HOME/Library/Application Support/ioant-openclaw-ops/runtime"
CHAT="https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/6adf6584-1a40-83ec-a4ab-c59ac7e28cf7"

cd "$SRC" || exit 1
bash scripts/dev-env.sh exec node stage2/project-self-update.mjs || exit 1
cd "$RUNTIME" || exit 1
bash scripts/dev-env.sh exec node stage2/project-self-update.mjs || exit 1
cd "$SRC" || exit 1
test "$(git rev-parse HEAD)" = "$(git -C "$RUNTIME" rev-parse HEAD)" || exit 1

# Read-only before the potentially mutating rebind:
bash scripts/dev-env.sh exec node stage2/ops-supervisor.mjs status

# The rebind alone leaves the service UNLOADED.
bash scripts/dev-env.sh exec node stage2/ops-rebind.mjs rebind "$CHAT"

# Check the returned state: must be rebound_unloaded, with the new ID.
bash scripts/dev-env.sh exec node stage2/ops-supervisor.mjs status

# Only after reviewing the rebind receipt, explicitly launch once.
bash scripts/dev-env.sh exec node stage2/ops-rebind.mjs start "$CHAT"

# Observe live state. Do not claim completion based on bootstrap alone.
bash scripts/dev-env.sh exec node stage2/ops-supervisor.mjs status
bash scripts/chatgpt-loop-logs.sh bundle
```

**IMPORTANT**: Avoid chaining `rebind` to `start` if the first command fails or reports `blocked_or_inconclusive`. The rebind program preserves a backup and never silently restarts the old worker. If `start` returns `start_requested`, the worker still requires an observed live PID, fresh `page_ready`, and an independently confirmed two-way message. Don't broaden Chrome permissions, delete session state, manually alter the LaunchAgent, reset/clean the repo or relaunch under an unrelated agent.

Existing source/runtime Mac acceptance on the previous commit: 420/420 Node tests in both updaters, 4/4 Python ZIP tests. The **new rebind code/tests have not yet been verified on the real Mac** at the time of this Git-only change.

## 2026-10-27 — Orphaned old-session watch.lock blocks rebind (fix pending Mac gate)

Mac read-only witness:
- Both source and runtime at `8e36d7cf0354642073d8e01d3be42df508788d47`, 425/425 candidate tests passed.
- Supervisor `com.ioant.openclaw.safe-watcher` is **registered, not running**, last exit code 1, still bound to `6add3565-d868-83ec-804e-1e7a00eb0a59`.
- Old chat: `watch.lock` exists (100 bytes) with recorded PID **79690**, for which Mac `kill(pid,0)` returned **ESRCH** (process not found). No `watch.lock.recovery` exists. The old `state.json` exists (689 bytes) and must be preserved.
- New chat `6adf6584-1a40-83ec-a4ab-c59ac7e28cf7`: no `watch.lock`, `watch.lock.recovery`, or `state.json`. The old `rebind` blocked with `watcher_lock_or_target_state_exists` before any plist changes.

A left-behind old lock does **not** imply a live owner, but the observed ESRCH is point-in-time only. The revised `stage2/ops-rebind.mjs` implements a separate, **read-only, fail-closed** `inspectOldWatchLock`: require a regular same-user 0600 file of at most 512 bytes; open `O_NOFOLLOW`, compare file identity and timestamps, validate the lock record (`pid`, `startedAt`, `nonce`), require `kill(pid,0)` to produce ESRCH twice; forbid any `watch.lock.recovery`; then repeat all old-lock checks immediately before bootout. A changed/unknown/live owner blocks. **No old `watch.lock`, `state.json`, or other history is removed or reset.** The target still must have no lock, recovery guard, or state. New test `test/ops-rebind-lock.test.mjs` covers orphan, missing, live, invalid, symlink, recovery, and changed-file states.

This code does **not** fix browser permissions or establish a live ChatGPT receipt. After a Git-only commit, run the protected `project-self-update.mjs` separately in BOTH checkouts, confirm matching HEAD, rebind from the operator's terminal, verify `rebound_unloaded`, then explicitly start the exact new route and check a real process plus current background events. Stop on any failed gate; do not manually delete or rename old lock/state, stop unknown processes, reset Git or modify Gateway credentials.
