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
