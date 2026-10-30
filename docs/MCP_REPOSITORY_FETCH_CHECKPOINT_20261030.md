# Deterministic repository fetch checkpoint — 2026-10-30

AI session: `k4n8v2cs`. User requested a general fix for model-mediated Git fetch timeout, not a NetScale-only workaround.

## Source changes (MCP 0.9.1)

`openclaw_project_execute` now accepts fixed action `repository_fetch` for an already enrolled origin/branch. No task file, local model or clean worktree is required. Optional `expected_commit` verifies the fetched SHA. Other code execution actions still require a full pinned SHA and tracked task definition.

The runner performs fixed-argv fetch asynchronously with a 300-second Git timeout. It verifies both `FETCH_HEAD` and `refs/remotes/origin/<branch>`, returns `fetchedCommit`, `remoteTrackingCommit`, unchanged local `actualCommit`, `sourceCheckoutUpdated:false`, steps, exit codes and the durable cached receipt. No merge, checkout, clone, tests or local file cleanup. Git timeout is inconclusive and retains the operation lock; query the same receipt, never replay uncertain work.

The read-only inspector also reports locally stored remote-tracking and FETCH_HEAD commits. Those local refs alone do not prove current remote freshness or network reachability. Local HEAD staying unchanged after fetch is expected and cannot diagnose a failed fetch.

## Validation and deployment boundary

Targeted tests: **32 passed**, zero failed/skipped, including a real temporary Git remote with a dirty clone; local HEAD, index bytes, tracked edits and untracked files remained unchanged, and duplicate operation admission did not relaunch. Disposable fixture only; no real NetScale fetch was submitted. Full regression: **1338 passed**, zero failed/skipped/cancelled. Log: external verification/repository-fetch-full.log. The temporary continuation automation initially checked usage before resuming; it has since been deleted as requested when verification was delegated to ChatGPT Chat.

On automatic resume, same-child live health reported MCP **0.9.1** already running. The operator had restarted the service; no further restart was performed. Source tests alone were not used as deployment evidence. Existing Web service at http://127.0.0.1:18489 is detached and holds its Runtime Key in memory. Do not restart Web or recover credentials. For future upgrades only, wait for no active native operations before its existing control/restart API, then verify health and refresh the catalog. This rollout needs no further restart or Refresh. No new tool name is required: existing execute gains an action.

## Historical usage pause

Actual account check reached 95% used (5% remaining). User requested checkpoint/push, pause and automatic continuation after reset. Reset reported 2026-10-31 01:13 Asia/Shanghai. Automatic continuation must check actual usage first; unchanged states stay quiet. The checkpoint and source commit were pushed before pausing. Continuation then verified the existing deployment and updated Hero guidance. The operator subsequently requested moving available verification work to ChatGPT Chat; the automation was deleted. No background follow-up remains.

Latest unknown business operation `netscale_git_fetch_20261030_safe1` remains inconclusive (`agent_run_timeout`, no successful terminal tool receipt). Do not infer that Git never ran or repeat it. Reconcile native evidence before any business operation; this infrastructure repair does not modify NetScale source, signing settings, VPN or deployment.

Operator status command (no secret required):

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
bash scripts/tunnel-console-service.sh status
```

## Automatic continuation evidence

Account quota recovered and continuation resumed. The existing Web service and managed Tunnel were healthy, with an in-memory key. Same-child initialize identified `ioant-openclaw-direct` version `0.9.1`; therefore another restart was unnecessary. No Web, Gateway or Tunnel restart was made by this continuation.

An actual connector call to workflow `project_actions` returned `repository_fetch` enabled with all three requirements false (clean tree, task file, expected SHA). Chrome's existing plugin Refresh tools was clicked once and returned to its enabled state. No permission mode was changed.

A single authorized workflow prompt `MCP_FETCH_V091_READONLY_20261031` requested only actions/summary inspection and inspection of the calling Chat's action enum. Independent MCP audit records confirm its two successful reads at 2026-10-30 17:38:16/19 UTC; inspector completed in163ms. No project_execute or computer_task was requested for this acceptance. At that checkpoint final reply reading was pending because Chrome foreground changed during native window selection. No test message was resent and no unrelated chat composer was used. The operator later supplied the completed final read-only acceptance below. Do not repeat this acceptance or any uncertain business operation.

Hero Skills reusable fetch guidance was committed/pushed as `7bab64c` (full SHA in the consuming pin). Local unrelated Hero files remain excluded. Existing 1338-test source evidence still applies: no runtime code changed during continuation.

## Final web acceptance — operator-relayed, 2026-10-31

The operator pasted the actual ChatGPT Chat acceptance report. This is operator-relayed web evidence; Codex did not repeat the browser check or execute a Git fetch to reproduce it.

| Acceptance item | Reported result | Evidence scope |
| --- | --- | --- |
| Calling tool schema includes repository_fetch action | PASS | Current web Chat tool definition |
| expected_commit absent from top-level required | PASS | Optional for fetch; other execution actions still validate a pinned SHA |
| actions enabled | true | Actual project_actions read |
| Clean tree / task file / expected SHA required for fetch | false / false / false | Actual action metadata |
| Inspector | repository_inspection, readOnly=true | Actual summary read |
| Model inference / network invoked by inspector | false / false | Read-only result |
| Worktree clean | true | Observation at that read, not a persistent guarantee |
| Local remote-tracking commit | 704e5aad6306759cebe03a51d290bfb3d0a85110 | Local ref observation only |
| Local FETCH_HEAD commit | 6d11c1fb940c6a1f98272c9b387e628a4b5bf7ce | Local ref observation only |

The two local refs differ; that is not evidence of failed fetch or current remote freshness. The first inspector query reportedly met an MCP initialization conflict; only the read-only query was retried successfully. No mutating execution was repeated. No project_execute, fetch, script, local model, Computer Use, browser tool or user-file mutation was reported in this final acceptance.

Technical source/runtime/catalog/read-only verification is complete for this repair. This does not establish a real business fetch, build, test or deployment outcome. Unknown historical operations remain unreconciled. The user requested prioritizing ChatGPT Chat for supported execution, evidence retrieval and verification to conserve Codex usage; Codex handles bridge implementation changes when needed. Temporary automation openclaw-mcp was actually deleted before the final report was supplied. No further local command, restart or browser verification is needed for this documentation-only closure.
