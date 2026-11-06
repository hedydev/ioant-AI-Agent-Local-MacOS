# Git fetch timeout settlement — 2026-11-06

## Evidence and cause

Drama Studio operation `drama_milestone_e_sync_20261106_01` is repository_sync,
expected target b9f43b1d081f5136c6ec891f071742e21ba3d0e2. Its only command
was fetch, from11:13:56.753Z through11:14:41.760Z:45 seconds, exit signal SIGTERM,
Git PID36778, processGroupAbsent=true; runner36770 has exited. The19-byte log
contains only the fetch start. No merge, script, build or checkout update ran.
HEAD/branch remain3ad32bf56313a646c66f45f8c7e8c97863dbb05d/main, origin/main
matches that local record, FETCH_HEAD is empty, no root or refs Git locks remain.
Original local package/Cargo locks and generated files remain present.

One bounded15-second read-only ls-remote succeeded against this registered origin
and observed HEAD f3cc61015cafb2be2bf0e6b73de1455ae88dae58. This is a single
read-connectivity observation, not proof of the historical network cause, push
success, or authority to fetch/merge the newer commit.

The previous WinCat fix deliberately covered current-workspace script timeouts,
not Git mutation paths. A fetch inherited the generic45s command budget in sync,
while repository_fetch already had300s. Every timeout retained the project lease,
even with a recorded ended Git process group and no later checkout operation.
No model inference or desktop permission is involved in this failure.

## Cohesive correction

Both repository_fetch and repository_sync use the same explicit300s fetch budget.
They remain detached asynchronous jobs; there is no automatic retry. A timed-out
fetch is classified failed/git_fetch_timeout and its lease released ONLY when:

- it is the single recorded fetch of repository_fetch/repository_sync;
- captured command PID and process group are independently absent;
- enrolled repository/origin are verified, HEAD/branch match the pre-fetch state;
- no Git operation or root/refs lock file remains, and evidence reads succeed.

The result explicitly states fetchSucceeded=false, localCheckoutUpdated=false,
remoteRefsMayHaveChanged=true. It never continues to a merge or script after that
timeout and never claims fetch/sync success. Missing process evidence, an active
group, changed HEAD, Git locks, output failure, later phases, script/lifecycle and
remote deletion operations retain their existing protections.

## Old receipts and reviewed recovery

Old final receipts are immutable. The local maintainer entrypoint is:

```bash
bash scripts/dev-env.sh exec node scripts/reconcile-git-fetch.mjs \
  inspect PROJECT_KEY ORIGINAL_OPERATION_ID
bash scripts/dev-env.sh exec node scripts/reconcile-git-fetch.mjs \
  resolve PROJECT_KEY ORIGINAL_OPERATION_ID REVIEW_DIGEST --effects-unverified
```

In addition to the checks above, historical recovery verifies the original runner
has exited and binds the60-second review to local file/index preservation hashes,
FETCH_HEAD contents and remote-tracking ref. Review then resolve rechecks all
evidence and writes a private audit before compare-and-release. Original logs,
result, claims and doNotRepeat remain unchanged. Duplicate recovery cannot release
a later job. This does not fetch, merge, clear Git locks or modify business files.

The shared receipt/audit review protocol now lives in execution-recovery.mjs;
script and fetch modules retain their distinct applicability and process proofs.
Alice lifecycle recovery remains separate. project_result exposes the historical
reconciliation after the reader is reloaded. No new MCP tool/input schema.

## Validation and deployment

Regression checks include real killed subprocesses in both fixed Git actions,
no subsequent commands/merge, preserved dirty files/index, same-ID no replay,
active/missing process evidence, retained root/ref locks, changed HEAD, phases
after fetch, immutable old receipts, duplicate recovery versus a later lease,
changed local review evidence/expiry and the existing script recovery suite.
Full-suite, actual reviewed recovery and loaded-runtime evidence follow below.

Full1410/1410 regressions passed at concurrency4, zero failures/skips/cancellations
in44.1 seconds. At19:45:37 Asia/Shanghai, a fresh original-receipt review and
independent rechecks released only sync01's matching lease. Original receipt
SHA256980a494373c14df2cadabdb58dfa4e465801b910a5d05f0b26234ff33efa82ed is
unchanged. Audit decision=confirmed_fetch_ended_before_checkout_update,
effectsVerified=false/taskRepeated=false. HEAD3ad32bf/main and six local changed
file/index hashes remained identical through recovery. No business sync/build
was executed. Runtime deployment/actual cloud acceptance are recorded below.

## Loaded runtime acceptance

Source80176b990b676f47be66aaa6c764133000766ee0 is pushed and remote main verified.
With zero native/fixed running or queued jobs, the console reused its in-memory
key to reload only Tunnel. Web was not restarted; no credentials were recovered.
New managed Tunnel PID49198 is healthy at127.0.0.1:63468. Actual cloud result for
the old Drama sync returns cached/inconclusive/doNotRepeat with reconciliation
resolved/lockReleased=true/effectsVerified=false/originalReceiptPreserved=true.
Actual cloud actions exposes fetchTimeoutSeconds=300 for both fetch and sync,
while maxStepTimeoutSeconds=3600 remains available. One parallel read-only actions
query encountered a gateway connection timeout during initial acceptance; its
single sequential read-only retry succeeded. No execution was submitted/retried.
This update adds no caller arguments or tool names, so no Refresh is required.
Original project HEAD and local edits remain unchanged; product tests and a newly
authorized sync remain with the project's Chat after reviewing current state.
