# MCP execution history archive — 2026-11-02

## Observed failure and cause

Actual local read-only inspection found Alice has exactly500 persistent execution receipts:463 passed,26 failed and11 blocked; no active lease. `ProjectExecutionStore.begin` rejects a NEW operation at500 hot JSON receipts with `execution_history_full`. This is a project-local storage admission guard, not ChatGPT usage/context, model memory, BDS query allowance or the native inference queue. Existing result/report reads remain available. Rebooting does not remove receipts.

## Implemented contract (MCP0.12.0)

The project console shows hot/archived/active/uncertain counts, remaining slots and receipt/report bytes. “归档已完成任务” retains the newest100 settled (`passed/failed/blocked`) receipts and archives the rest. The total lifetime record count is no longer the hot-store admission count. This is an explicit local action, not automatic cleanup. No task, model, Git operation or game command is invoked.

Full original receipts, input digest, ID and declared logs/artifacts are copied into owner-private per-operation directories, verified, atomically published, then removed from hot storage. Reads try hot storage then the published archive, including a reader already in progress. Same-ID execution requests still return the saved result or digest conflict; archiving never grants replay permission. Reports retain hash verification and pagination. Failed copy/hash/conflict stops without deleting its source receipt. An interrupted publication may leave identical hot/archive copies; these are deduplicated in the console, and a separately reviewed archive request can finish cleanup. A crashed maintenance lease remains for explicit investigation, never age-based lock deletion.

Only settled tasks are eligible. Running/accepted records or an existing lease block maintenance. `inconclusive` records stay hot. Archive requests use their own durable IDs and return cached outcomes on repetition; missing final archive receipts are reported as uncertain, not automatically retried. Project registration, loopback Host/Origin/session token and JSON validation remain required. No arbitrary path or shell is accepted by the API.

`archive/<operation-id>/` retains receipt/log/declared sanitized artifacts. Original `<operation-id>.output/` directories are untouched. Archiving releases hot task slots, **not total disk space**; storage bytes include tracked receipts/reports, not raw output directories. No logs, claims or user files are discarded. Do not restore an old MCP executable after archiving: old versions do not know this layout and could forget operation IDs.

The updated MCP process writes a private startup marker with PID/start identity and archive lookup version. Archive admission checks all currently running direct MCP servers, requiring matching markers. This proves loaded reader support rather than checking source files. Old/mixed/missing readers yield `archive_reader_upgrade_required`. Stale process markers cannot authorize a new process with a reused PID. If startup attestation is unavailable, MCP still starts normally; only archive maintenance fails closed.

## Console and operator entrypoints

Open the existing localhost console, select a project, then use “执行历史容量” → “归档已完成任务”. The confirmation explains100 recent settled records are retained. “浏览全部历史” pages30 rows at a time across hot and archived receipts; each exposes its existing declared report links. Archived rows are marked. Buttons are disabled while a project is busy. A full hot store does not prevent readback.

Mac bash/zsh, existing checkout (no branch changes):

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
bash scripts/tunnel-console-service.sh status
bash scripts/dev-env.sh exec node scripts/project-history.mjs status alice-ai
```

The maintained optional local maintenance command is:

```bash
bash scripts/dev-env.sh exec node scripts/project-history.mjs archive alice-ai
```

It enforces the same reader/lease/state/hash guards and default100 retention as the Web API; it does not bypass a stopped/old reader, refused task or unknown receipt. Substitute only a registered project key returned by normal project discovery.

Runtime rollout: first ensure no project/native task is active, use the existing console memory-key Restart Tunnel once, verify MCP0.12.0/archiveLookupVersion1 is actually loaded, then upgrade the Web daemon. A Web restart discards its memory-only Runtime Key and stops its managed Tunnel; the user must privately re-enter the key in the new Web page before starting it. Never recover the key from process environments, logs or browser storage. Gateway/Ollama/Mint/BDS and business repositories are not part of this upgrade. No tool schema changed, so no plugin catalog Refresh is required just for archive support.

If the operator is ready for key re-entry, the maintained Web lifecycle commands are:

```bash
bash scripts/tunnel-console-service.sh stop
# Wait until status reports ready=false before starting the replacement.
bash scripts/tunnel-console-service.sh status
bash scripts/tunnel-console-service.sh start
```

Then enter Runtime Key at http://127.0.0.1:18489 and use Start Tunnel; verify readiness and the project capacity card. Do not repeatedly restart to clear the500-record condition. Do not retry earlier denied syncs/reloads after capacity is released.

## Validation and rollout boundary

Full1367 Node regressions pass. New integration tests reproduce500 hot receipts, archive400, prove new admission, old-ID cached/conflicting behavior, original receipt preservation, paginated log/JSON readback, concurrent readers during publication, active/uncertain retention, old/mixed runtime rejection, symlink/hash/conflict protection, idempotent archive requests and scoped history pagination. HTTP tests cover same-origin/session/JSON controls. Both locale catalogs match, JavaScript and shell syntax checks pass.

An actual temporary localhost preview (18490, read-only real history) showed Alice500/500, zero active/uncertain,5.08MiB tracked data; Chinese project selection and history next-page navigation worked. This preview does not deploy the18489 backend. At source delivery, no actual task was archived and the original Tunnel remained running. Web runtime deployment/key re-entry and actual first archive are recorded separately after completion. No Alice source sync, reload, BDS/world action or uncertain task replay was performed.

## Operator deferred runtime upgrade

The operator explicitly chose to keep existing Web/Tunnel running and upgrade later. No production service restart, actual archive, key recovery or business operation was performed. A separate temporary local SDK child verified server0.12.0 can start and read an existing Alice result with cached:true; it was closed. This is not deployment of the running Tunnel child. The read-only18490 preview was stopped.

Validation provenance: the first full1367-run passed. A later default-parallel full run passed1364/1367 and failed three unchanged old Worker wall-clock tests (feedback recovery, delayed initialization receipt, loop end-to-end). Their actual outputs show the fixture did not finish before its fixed deadline; no assertion or product timeout was weakened. Reconciliation of these test failures is recorded below before final delivery.

Final test reconciliation: the focused archive/executor/HTTP/UI run passed28/28. The unchanged Worker recovery+initialization files passed13/13 with one test-file at a time, and the separate loop end-to-end file passed1/1. A bounded-four-file full run passed1366/1367, with only the same17-second end-to-end fixture deadline failing; that test passed alone with unchanged assertions. The old `stage2/` and `src/` runtime files are unchanged in this feature. Keep this scheduling sensitivity visible; this work does not claim to fix the legacy Worker test timing. No further repeat is needed for the archive change. Actual live archive acceptance remains deferred at the operator’s request.
