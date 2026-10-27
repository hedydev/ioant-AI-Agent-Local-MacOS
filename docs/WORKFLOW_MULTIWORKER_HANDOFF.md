# IOANT Multi-Worker / Agent Binding / Handoff

Status: 2026-10-27, experimental foundation. This document distinguishes working code from live-tested deployment.

## Verified environment
- Existing mac-ops-01 LaunchAgent is running with ChatGPT Project exact conversation 6adfdfb9-65b0-83ec-b6ac-155e7852c6af; latest live task receipts are confirmed by that conversation.
- The existing project-update-verify action has a prior live, fixed-origin main fast-forward test and feedback-then-reload acceptance. Each new code revision must pass its own gate.
- Gateway 2026.10.7 remains loopback; Tailscale Serve foreground HTTPS 443 -> loopback was independently witnessed on 2026-10-27.
- The Google Drive native sheet was created and read back: https://docs.google.com/spreadsheets/d/1fIt5ptZh_OjveG4RDx15s7OyR4NdQtD5Bk0RGk3O_PQ/edit

## Implemented this revision
- stage2/workflow-engine.mjs: pure, deterministic revision-checked workflow reducer.
- Each Workflow has task DAG, capability-scoped Workers, explicit Agent-to-Worker binding, immutable task execution receipts, and separate acceptance before an item unblocks dependents.
- Task split preserves superseded parent and requires each child to be accepted. Cancellation requests do not promise rollback; running tasks require evidence of confirmed stop before cancellation.
- Voiding a running task is refused; state mutation events use unique IDs and compare expectedRevision.
- Binding Agent identity supplies attribution and routing only; it never grants model tools, shell, SSH, browser writes, or additional capability.
- test/workflow-engine.test.mjs exercises dependencies, receipts, cancellation, splitting and capability isolation.
- config/chat-projects.json now points to the live bound Project conversation instead of a previously retired conversation.

## Not implemented yet / do not claim ready
- Workflow reducer does not schedule/execute subprocesses. No second live Worker exists, and multi-process leasing/persistent CAS has not been integrated with the watcher.
- Google Sheets is a read-only-friendly dashboard and human-readable projection, not a trusted source for executable instructions. Automated bidirectional Sheets sync and credentials are not configured.
- Existing chat-handoff.mjs and handoff-journal.mjs provide staged safeguards; they do not themselves create/send a new Project chat or rebind the LaunchAgent.
- No ChatGPT token-remaining percentage is available to the Worker. A manual trigger and exact application-level context-limit banner are trusted signals; measured slowdown is advisory until reproducible.
- OpenClaw App image handling and Ollama response times are pending benchmarks. AliceAI production services remain untouched.

## Required safe operation lifecycle
1. Coordinator creates Workflow / Task IDs and validates dependencies and separately granted capabilities.
2. One Worker claims a task with a unique lease; model-produced text alone cannot authorize arbitrary execution.
3. Each attempt emits an immutable Receipt ID and evidence digest. Completion is verification_pending until separately accepted.
4. Cancellation becomes cancel_requested, then cancelled only with stop evidence if execution began. Never call this rollback.
5. A split parent is superseded; downstream tasks depending on the parent wait for every child to be accepted.
6. Uncertain operation results are not automatically retried. Preserve original state and audit evidence.
7. Cross-chat handoff: create successor within the exact Project, deliver handoff, verify user-role receipt, stop old watcher, rebind and start, prove new-chat canary, then promote active route.
8. Watcher updates: fixed origin/main only, pretest candidate, ff-only, confirm feedback before reload; never reset/clean/stash/force-push or restart Gateway/Alice BDS.

## Separate sources of truth
- Git main task ledger remains canonical for development task identities and human acceptance under Hero Skills development governance.
- A future private durable local execution ledger on LunaDrive should own leases and receipts. Sheets is a synchronized projection; it must never become a remote command queue just because a cell was edited.

## Planned phases
- P1: full Mac node --test and project-update-verify feedback; verify running Worker consumes updated runtime.
- P2: durable local ledger and coordinator; second isolated Worker, robust heartbeat/de-duplication, fixed capability manifests.
- P3: same Project new-chat creation/send/receipt/rebind end-to-end; detect slowdown with trustworthy evidence.
- P4: Ollama cold/warm generation benchmarks, per-Agent selection, app image ingestion test, then AliceAI service discovery.

## Mac operator fallback if self-update is not delivered
On the Mac, in the validated repository checkout:
  cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
  git fetch --no-tags origin main
  git status --short --branch
  git pull --ff-only origin main
  bash scripts/dev-env.sh exec node --test
Do not manually restart the running worker or copy code into its private runtime until its self-update state and exact launchd target are inspected. The fixed project-update-verify action is the preferred update path.
## 第二阶段：私有持久化账本（当前候选实现）

- `stage2/workflow-store.mjs` 固定 LunaDrive 私有位置 `PROJECT_DEV_CACHE/chat-projects/workflows`；仅本机已授权协调器可写，绝不读取 Google Sheet 作为可执行命令。
- 不允许任意路径注入：测试自定义 root 仅在 `IOANT_WORKFLOW_TEST_ROOT=1` 的隔离测试进程中生效。
- `initializeWorkflow` 和 `transactWorkflow` 使用所有者私有文件/目录、进程间 mkdir 排它锁、唯一事件 ID、期望 revision、临时文件写入、fsync 和原子 rename；读回校验 revision。
- 进程崩溃留下的锁不会被自动盗取或删除；需要本地核实原所有者和副作用后单独恢复。不可因超时重复执行任务。
- `inspectWorkflow` 返回本地快照和只读摘要；当前没有自动 Sheets 双向同步、远端 Worker 进程管理或实际 Agent 行为采集。
- `test/workflow-store.test.mjs` 覆盖耐久写入、旧版本阻断、两个并发写竞争、不可识别锁保留、不安全权限拒绝。
- **候选代码未验收前，不得将 P2 持久化层在台账中标为已部署。**

## 2026-10-27 Worker STOP / timestamp recovery

- Root cause: `actionFromJson` rejects an oversized/malformed assistant action, but `extractAction` propagated `Malformed structured task (strict action-specific fields).` to top-level `main().catch`, terminating the watcher. This was observed after a long `mac-terminal` command; the watcher exit is real, not just a stale log banner.
- `stage2/task-observation.mjs` now converts **only this exact malformed-action error** into a non-executable `rejected_invalid_task` status. The watcher remains on the same chat, emits one bounded warning per transition, and waits for a valid subsequent assistant task. Unverified role provenance, multiple valid tasks and all other unexpected exceptions remain fatal.
- `scripts/worker-log-timestamp.sh` is sourced by the launcher before worker output. It timestamps each stdout/stderr log line using Mac local time and numeric UTC offset, e.g. `[2026-10-27 09:47:00 +0800] [loop] ...`. Machine-readable outputs from subprocesses are NOT modified.
- A stopped LaunchAgent cannot receive `project-update-verify`; one Mac operator recovery is necessary to update both the source checkout and deployed private runtime with the pretested `main` revision, then `launchctl kickstart` only if the exact managed service is not running. Do not use `reset`, `clean`, `stash`, `killall` or restart OpenClaw Gateway/Alice BDS.
- Validation requirement: candidate Node suite, Bash log helper test, observed time-stamped stdout/stderr, and a fresh post-recovery `project-head` user-role receipt. Until that receipt, runtime recovery is **unverified**.

## 2026-10-27 Gemma vision metadata repair (candidate only)

- Read-only on-device Ollama confirmed \`gemma4:26b-a4b\` has native \`vision\` capability; the OpenClaw provider model catalog currently declares \`input: ["text"]\`. Four existing Agents (main, alice-ai, openclaw-dev, mac-computer) share that exact Ollama model. The model-binding and Agent/tool policies must be preserved.
- \`stage2/openclaw-vision-metadata.mjs\`: fixed-id, single-purpose one-shot vision metadata patch. Exact provider URL, complete model inventory, safe opaque \`config.get\` revision, source-disk and gateway snapshots, CLI config dry run, private 0600 backup, a single \`config.patch\` with baseHash, and strict disk/Gateway read-back. No retries on ambiguous receipt, no model switch, no Agent mutation, no automatic global thinking change.
- Deliberate patch contains the complete existing provider model array with only Gemma's \`input\` changed to \`["text","image"]\`; doing so preserves sibling entries under both array replacement and ID-merge behaviors. The script blocks when the source snapshot/inventory is inconsistent.
- \`test/openclaw-vision-metadata.test.mjs\` covers field scope, Agent preservation, stale revision, inventory conflict, unexpected provider, one write with backup, failure/no retry, and read-back. Running this test does not write the real Gateway.
- **No live OpenClaw config mutation has occurred as of this candidate Git commit.** To accept, validate the Mac full test suite through \`project-update-verify\`; then run the one-shot command using the authorised bounded Worker and verify real App image delivery separately.
### macOS runtime path with spaces — corrected entrypoint 2026-10-27

- Live task 033 failed on stale source checkout (37dfe2e) versus active runtime c74b8dd. Task 035 launched the runtime script and returned status passed, exit 0, but **no JSON audit** after 63ms. It did not verify any config write.
- Root cause: using URL pathname encodes spaces as %20, unlike process.argv[1] containing literal Application Support. The entrypoint guard was false; Node imported the module and silently exited 0.
- Corrected the guard using fileURLToPath(import.meta.url). Added a sandboxed child-process regression test copying script/dependencies to a directory literally named Application Support, setting OPENCLAW_PROFILE so no config is touched, and requiring an explicit custom_profile_review JSON audit.
- **Still not live-applied.** Update the isolated runtime with project-update-verify, then run one guarded patch. An exit code without an expected IOANT_GEMMA_VISION_PATCH JSON receipt is never evidence of modification.

### Entry invocation: symlink canonicalization follow-up (2026-10-27)

- Task 037 isolated the sole failing candidate test: child process exit 0 but empty stdout, causing JSON.parse to throw Unexpected end of JSON input.
- On macOS Node may canonicalize a temporary script under /var to /private/var, or resolve other symlinks in ESM import URLs. Decoding %20 alone is insufficient. The entrypoint now compares realpath of argv[1] and fileURLToPath(import.meta.url), without executing when imported or either path is unresolved.
- The isolated regression test launches from both an Application Support-style directory and a symlink alias pointing to that directory. Both must return a bounded blocked/custom_profile_review JSON status without reading or changing the live OpenClaw config.
- Still a candidate until Mac runs full test suite and isolated runtime self-update succeeds. No live model metadata write has been verified.
## 2026-10-27 Gemma native thinking metadata repair — candidate

- Evidence: native Ollama /api/show reports gemma4:26b-a4b capabilities vision+thinking, thinking.values [false,true]. Gateway config.get raw/sourceConfig/parsed/resolved omit reasoning, while effective config materializes reasoning=false. main agent thinking high/low -> Gateway error within ~2 sec; off previously succeeded. Exact allowlisted error check confirms high unsupported; Gemma native think='high' returned HTTP200. Root cause: manual provider model metadata not flagged reasoning-capable.
- Stage2 patch: stage2/openclaw-reasoning-metadata.mjs. Adds ONLY reasoning:true to the already image-enabled gemma4:26b-a4b provider model entry. No changes to agents (main, alice-ai, openclaw-dev, mac-computer), defaults, image input, tools, credentials, or sibling models. Requires fixed local loopback Ollama provider, exact five model IDs, existing input ['text','image'], no explicit think overrides, raw flag omitted, valid opaque config.get revision, and four structurally valid Gateway config roots (allowing effective false where authored raw is absent). Explicit reasoning:false is protected and blocks.
- One-shot write must pass dry-run, private 0600 backup, baseHash config.patch, strict disk before/after comparison and Gateway four-root readback; never retries uncertain responses. Audit contains no raw config/error strings, hashes, or backup path.
- Regression tests cover allowed raw/effective distinction, exact provider-array scope, vision preservation, AliceAI agent policy preservation, inventory/revision changes, explicit disabled and think overrides, write order/backup/no retry/readback, CLI execution from paths with spaces and symlinks.
- **Only a Git candidate until 476+ full tests pass and isolated Mac runtime update succeeds.** After one real patched execution, verify high/low/off in separate sessions and repeat a small vision test; no global thinkingDefault modifications.
