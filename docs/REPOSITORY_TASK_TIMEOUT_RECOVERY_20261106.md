# Fixed task timeout: reviewed local recovery

## Observed failure

WinCat operation `wincat_bootstrap_ils_run_valid_20261106_019` ran its committed
package-only script at `e9e602339b2553c05bf17351d23712e3abff208a`. The single
step started at10:16:38 UTC and timed out at10:23:38, exactly420 seconds.
Its final state is inconclusive/command_outcome_requires_review; runner PID13405
has exited. It invoked no local model. The17230-byte log ends during first-time
Rust dependency compilation, before helper preparation completed. rust-objcopy
reported missing libLLVM.dylib, but subsequent compilation continued. This is
not evidence that the warning caused a terminal build failure.

The original desktop output directory is empty. No WinCat application DMG was
found in the declared Cargo target tree. The existing WineForge DMG under
compatibility/startup-runtime is an input runtime, not a new WinCat package.
No WinCat disk image is mounted. Scoped process inspection found no remaining
WinCat cwd or Cargo/compiler processes. Unrelated Drama Studio processes were
observed and were not stopped. The8 original WinCat changes and HEAD were retained.

## Cause and boundary

executionCommand terminates its process group on deadline. The runner deliberately
retains the project lease for every timedOut result; it has no generic reviewed
recovery path. A terminal receipt therefore leaves subsequent repository tasks
blocked indefinitely, even after a local build has stopped. Waiting, restarting
MCP, or a new operation ID does not settle the old result. project_result/report
and direct project_inspect remain readable; a diagnostic wrapped as a new
repository_task still needs the lease and is blocked.

## Implemented maintenance mechanism

`scripts/reconcile-repository-task.mjs` uses the registered repository policy,
original immutable receipt, pinned manifest/entry scripts and independently
refreshed process evidence. This is a local maintainer operation, not an arbitrary
remote unlock tool. No model, shell text, task retry or business checkout change.

```bash
bash scripts/dev-env.sh exec node scripts/reconcile-repository-task.mjs \
  inspect PROJECT_KEY ORIGINAL_OPERATION_ID

# Only after reviewing original logs, child operations, artifacts and effect scope:
bash scripts/dev-env.sh exec node scripts/reconcile-repository-task.mjs \
  resolve PROJECT_KEY ORIGINAL_OPERATION_ID REVIEW_DIGEST --effects-unverified
```

Only current-workspace repository_task terminal script timeouts are eligible.
Alice lifecycle tasks/grants, Git fetch/sync/delete, active runners/commands,
changed HEAD/branch/entry scripts, unverified process probes and expired/changed
reviews are rejected. Legacy receipts without command PIDs require conservative
same-user cwd inspection and global compiler absence, plus maintainer review.
Those local probes cannot prove SSH, detached services or remote effects ended;
the maintainer must verify such child operations separately before resolving.
The digest is a short-lived evidence binding, not a new permission grant.

Resolve rechecks evidence, writes an owner-private audit before matching release,
preserves the original inconclusive receipt/log/claims and records effectsVerified
false/taskRepeated false. Duplicate recovery reads its audit and cannot release
a subsequent operation's lease. Failed checks retain the lock. No TTL unlock.
MCP project_result exposes the reconciliation summary after its reader is loaded.

## Future long builds and diagnostics

Committed task step timeoutSeconds now permits1..3600 seconds instead of1..600;
default60 is unchanged. Use an explicit realistic budget for a clean Rust release
build, then poll the same asynchronous operation ID. This does not change desktop
Agent300-second inference budgets or make ChatGPT wait synchronously for an hour.
No task is automatically retried. Process ID, exit signal and observed process-group
absence are saved for future command receipts; timeout still retains its lease
until reviewed. This change does not declare partially completed builds successful.

## Acceptance

Five new focused checks cover immutable original/same-ID claims, duplicate audit
versus a later lock, active/changed/expired evidence, missing acknowledgment,
lifecycle exclusion, changed pinned scripts, malformed audit isolation, process
probe privacy and real SIGTERM timeout metadata. Full regression and actual reviewed
WinCat recovery/deployment evidence are appended after completion.

Full1405/1405 regressions passed at concurrency4, zero failed/skipped/cancelled,
46.9 seconds. On 2026-11-06 at18:54:27 Asia/Shanghai, fresh inspect/resolve verified
the same pinned manifest and idle scoped/compiler state, then released only019's
matching lease. Original receipt SHA256 remains
05e0ac0df35e8583d28f1dd1fdc3397cf0bf98dba87e2bf219b995a11a7176e8.
Audit decision is reviewed_local_task_ended_effects_unverified; state remains
inconclusive, effectsVerified=false and taskRepeated=false. The review and audit
are under the project's private task-reconciliation directory, outside hot
receipt capacity. No WinCat build, install, launch, Git sync or source edit was
performed by this maintenance task. Runtime reader rollout is recorded below.

## Loaded runtime acceptance

Source bf85b5e was pushed and remote main verified. With both native and fixed
queues empty, the existing Web memory-key control reloaded only Tunnel; Web and
credentials were not restarted/recovered. New managed PID28630 is healthy at
127.0.0.1:58638. Actual cloud project_result for019 still returns cached=true,
inconclusive/doNotRepeat=true and now reconciliation.state=resolved,
lockReleased=true/effectsVerified=false/originalReceiptPreserved=true. Actual
cloud project_actions for WinCat advertises maxStepTimeoutSeconds=3600. No new
tool name or argument schema is required for this update; no plugin Refresh is
needed for these two existing read calls or committed task-file timeout values.
No release build or DMG acceptance is implied by infrastructure acceptance.
