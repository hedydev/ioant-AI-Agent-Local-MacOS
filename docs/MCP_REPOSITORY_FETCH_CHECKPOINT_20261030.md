# Deterministic repository fetch checkpoint — 2026-10-30

AI session: `k4n8v2cs`. User requested a general fix for model-mediated Git fetch timeout, not a NetScale-only workaround.

## Source changes (MCP 0.9.1 candidate)

`openclaw_project_execute` now accepts fixed action `repository_fetch` for an already enrolled origin/branch. No task file, local model or clean worktree is required. Optional `expected_commit` verifies the fetched SHA. Other code execution actions still require a full pinned SHA and tracked task definition.

The runner performs fixed-argv fetch asynchronously with a 300-second Git timeout. It verifies both `FETCH_HEAD` and `refs/remotes/origin/<branch>`, returns `fetchedCommit`, `remoteTrackingCommit`, unchanged local `actualCommit`, `sourceCheckoutUpdated:false`, steps, exit codes and the durable cached receipt. No merge, checkout, clone, tests or local file cleanup. Git timeout is inconclusive and retains the operation lock; query the same receipt, never replay uncertain work.

The read-only inspector also reports locally stored remote-tracking and FETCH_HEAD commits. Those local refs alone do not prove current remote freshness or network reachability. Local HEAD staying unchanged after fetch is expected and cannot diagnose a failed fetch.

## Validation and deployment boundary

Targeted tests: **32 passed**, zero failed/skipped, including a real temporary Git remote with a dirty clone; local HEAD, index bytes, tracked edits and untracked files remained unchanged, and duplicate operation admission did not relaunch. Disposable fixture only; no real NetScale fetch was submitted. Full regression: **1338 passed**, zero failed/skipped/cancelled. Log: external verification/repository-fetch-full.log. Temporary continuation automation `openclaw-mcp` is active and checks actual usage before resuming.

Live Tunnel is still MCP **0.9.0** until a guarded reload; 0.9.1 source tests do not establish cloud deployment. Existing Web service at http://127.0.0.1:18489 is detached and holds its Runtime Key in memory. Do not restart Web or recover credentials. Wait for no active native operations, use its existing control/restart API, verify health, Refresh tools in Chrome and confirm the action enum in the authorized workflow Chat. No new tool name is required: existing execute gains an action.

## Usage pause and remaining work

Actual account check reached 95% used (5% remaining). User requested checkpoint/push, pause and automatic continuation after reset. Reset reported 2026-10-31 01:13 Asia/Shanghai. Automatic continuation must check actual usage first; unchanged states stay quiet. Finish verification and source commit/push before pausing. On resume review command logs, deploy and do read-only catalog acceptance, update Hero shared guidance and remove the temporary continuation automation after completion.

Latest unknown business operation `netscale_git_fetch_20261030_safe1` remains inconclusive (`agent_run_timeout`, no successful terminal tool receipt). Do not infer that Git never ran or repeat it. Reconcile native evidence before any business operation; this infrastructure repair does not modify NetScale source, signing settings, VPN or deployment.

Operator status command (no secret required):

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
bash scripts/tunnel-console-service.sh status
```
