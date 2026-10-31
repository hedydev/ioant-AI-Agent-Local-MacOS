# Resource-aware MCP execution — 2026-10-31

## Evidence and goal

Operator authorized optimizing local-model memory and Agent timeouts without removing ChatGPT Chat MCP or computer abilities. A reported MLX Gemma load occupied25–26GB on a32GB Mac; a fresh read showed no loaded models, about16.9GiB free physical pages and14.75GiB swap. A high historical swap allocation alone is not proof of a current leak. NetScale fixed fetch completed in5.7 seconds, while several model-mediated calls returned unavailable native receipts after about121 seconds. Its FETCH_HEAD/remote-tracking refs already matched the requested commit; fetch was not meant to advance local HEAD. Original working tree contained user edits.

MCP0.10.0 separates deterministic execution from bounded model work. All existing project tool permissions and local model selection are preserved. This is a generic infrastructure change; no NetScale/Alice source, game/server, installed VPN or unknown historical operation is executed or repeated for acceptance.

## Deterministic original-checkout synchronization

New `project_execute` action `repository_sync` requires the exact full `expected_commit`, registered project key, unique operation ID and conversation key; no task file, local model or clean worktree. The fixed runner validates repository/origin/branch, fetches and checks the pinned target, validates the candidate tree and fast-forward ancestry, then rejects remote changes overlapping local staged/unstaged/untracked paths (conservatively case/Unicode-normalized).

Before and after update, private hashes verify local file bytes, symlink targets, modes and affected index entries. No raw local contents are returned. Local preservation inspection is bounded at2048 files/32MiB and blocks unusual index flags. Merge disables hooks, submodule recursion, auto-stash and ignored-file overwrite. No reset/clean/stash/clone or automatic merge-conflict resolution. A command with an uncertain update outcome retains its existing project lock. The receipt separates actualCommit, sourceCheckoutUpdated, worktreeClean and preservedLocalChanges from test/deployment success.

`repository_sync` does not run tests. Existing in_place repository tasks still require a clean checkout; isolated tests remain an explicit option when appropriate and authorized. Do not turn an original-checkout preference into an automatic clone. Review actual diffs and choose the correct authorized test strategy. This is not permission to replay old uncertain synchronization attempts.

## Asynchronous native computer jobs

`computer_task` now persists the original private input and admission before launching a detached one-job Node process. It returns `accepted`/`queued` immediately. Poll `computer_result` with the SAME project and operation ID until final. A unique durable runner claim prevents duplicate execution after repeated submissions or process/MCP reconnects. Reads do not start or retry work. Existing legacy started/finished receipts remain readable and are never converted into new jobs.

New jobs retain the legacy outer started/finished storage envelope so the already-running Web removal gate still recognizes pending native work. MCP results expose accepted/running phases, runner PID, model-residency-at-start and the actual300-second Agent budget. Updated console projection understands phases on its next ordinary Web upgrade; older Web remains compatible and shows Started for pending jobs. Do not restart Web merely to pick up this enhancement or lose its memory-only Runtime Key.

A host-wide lane for NEW MCP computer jobs admits at most4 jobs total, with1 active model run and up to3 waiting processes. Queue wait is bounded at300 seconds; an expired waiting job reports blocked without executing tools. The Agent run has300 seconds, with a separate335-second CLI watchdog and bounded SIGTERM/SIGKILL escalation. This removes the transport request deadline from inference duration; it does not guarantee every model task can complete. Do not increase budgets as a substitute for moving scripts/tests to the fixed executor.

Known terminal native metadata allows release of the lane; a CLI result without terminal evidence retains its lane and reports inferenceLaneHeld=true. A crash or lost receipt never authorizes TTL lock takeover or replay. Queued jobs may time out safely while reconciliation is required. No automatic lock deletion/restart/re-execution. A future reconciliation must prove actual native run completion before releasing a held lane.

The lane covers MCP computer jobs only. Direct OpenClaw UI/local-chat, no-tools advisor calls and other Ollama clients are outside it; do not claim global model serialization or an OS memory quota. Deterministic project tasks do not wait on this inference lane.

## Residency strategy and visibility

Keep the existing working Ollama idle unload and32K context. No Ollama restart, global model change, forced stop/unload or per-task preloading is made. Aggressively shortening idle residency would add cold loads and can make slow Agent starts worse; it does not reduce peak memory during inference. No paid model API or subscription routing change is added.

`openclaw_capabilities` now reports asynchronous native execution/lane limits and metadata-only loopback `/api/ps` residency (reported loaded bytes, context and expiry). This does not invoke a model, attribute requests to a project, prove a leak or change residency. A zero-loaded snapshot is compatible with working deterministic MCP tools.

## Validation and rollout

Targeted tests cover actual temporary dirty Git checkout preservation, overlap refusal, ignored-file protection, exact commit admission, independent-project queue serialization, legacy receipts, no replay, launch failure, queue expiry, uncertain completion retention, a separate real Node fixture process and a nonresponsive CLI watchdog. No test loads a real model or operates the desktop. Final full regression: **1350 passed**, zero failed/skipped/cancelled (`verification/resource-complete.log` outside Git). Final targeted release tests20 passed. Read-only local SDK status passed with no inference/desktop calls. A first full run caught a same-millisecond FIFO tie; stable slot ordering fixed it, and subsequent full runs passed. No model was loaded for acceptance.

Runtime source remains a candidate until a no-active-call Tunnel reload through the existing console memory key. Never restart Web/Gateway/Ollama or fetch credentials from process/browser state. After reload verify same-child MCP version0.10.0 and perform read-only actions/capability calls. ChatGPT Chat should carry the final refreshed-catalog verification at the operator's request to conserve Codex usage. No real NetScale sync or model/desktop probe is necessary for this infrastructure rollout.

Operator commands (Mac, bash/zsh; status only, no secret):

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
bash scripts/tunnel-console-service.sh status
bash scripts/dev-env.sh exec node scripts/direct-openclaw-shared-smoke.mjs --status openclaw-workflow
```

For an actual future MCP upgrade, use the existing Web console Restart Tunnel after no native call is in flight, then Refresh tools in the plugin settings. Do not stop/restart the Web daemon or blindly repeat historical jobs.

Usage checkpoint: weekly account window reached90% used (10% remaining), five-hour window20% used. Source/tests/docs are being committed/pushed before runtime reload. No repeat of historical acceptance is required.

## Actual deployment evidence

Source commit `91629f6b9a1effd86266291760e39f9157fde973` was pushed and remote SHA independently verified. After the console reported no accepted/running/started tasks, its existing memory-key Restart Tunnel API was used once. Web, Gateway and Ollama were not restarted and no credential was read or re-entered. Same-child health subsequently confirmed `ioant-openclaw-direct` **0.10.0**, Tunnel ready.

Actual cloud MCP read calls then returned:

- workflow actions: `repository_sync.enabled=true`, clean-tree/task-file requirements false, expected commit required true, modelInferenceInvoked=false;
- capabilities: nativeDesktop.execution=asynchronous, agentTimeoutSeconds=300, maxConcurrentMcpJobs=1, queueCapacity=4, queueWaitSeconds=300;
- localInference.residency.models=[], settingsChanged=false;
- workflow Agent status: ready, full tools, computerControlEnabled=true.

The Ollama `/api/ps` read remained empty after these calls, corroborating that deterministic discovery/status does not require loading Gemma. No real computer_task was submitted just for acceptance. Async native behavior is covered by mocked native boundaries and a separate real Node fixture; actual native completion remains a later user-task validation, not a claim made from these reads. New console phase fields are source-ready; the current Web remains compatible without restarting it.

Shared Hero standard was updated/pushed as `4631f3c`, teaching safe original sync, async polling and resource/budget boundaries without project-specific runtime facts. The consuming pin is updated. The final calling-Chat schema verification was delegated to ChatGPT Chat to conserve Codex usage and has now passed as relayed by the operator below. No automatic follow-up was installed. **No further Refresh or service restart is needed**.

Completed Chat prompt (historical; do not repeat):

```text
仅使用 OpenClaw Mac 做只读验收：确认当前 project_execute.action 枚举包含 repository_sync；实际调用 openclaw_project_actions({"project_key":"openclaw-workflow"}) 和 openclaw_capabilities({})。报告 sync 的 enabled/expectedCommitRequired，以及 nativeDesktop 的 execution/agentTimeoutSeconds/maxConcurrentMcpJobs/queueCapacity、localInference.residency。不要调用 execute、computer_task、模型、脚本或修改文件。新动作不可见时只报告目录未刷新，不另找执行路径。
```

## Final calling-Chat acceptance — operator-relayed

The operator supplied the21-second ChatGPT Chat read-only report: actual project_execute action enum includes repository_sync; actions returned enabled=true, requiresCleanWorktree=false, taskFileRequired=false, expectedCommitRequired=true. Capabilities returned nativeDesktop.execution=asynchronous, agentTimeoutSeconds=300, maxConcurrentMcpJobs=1, queueCapacity=4, queueWaitSeconds=300. Only actions and capabilities were called; no execute, computer_task, model, script or file mutation was reported. This is relayed web evidence, not an additional Codex browser check.

Queue capacity4 is the TOTAL admitted MCP computer jobs (at most1 active plus3 waiting), not4 extra waiting jobs. Direct local-chat and other Ollama clients remain outside this lane. Source/runtime/catalog/read-only technical verification is complete; real business sync/desktop outcomes and inference-time memory peaks were not measured by this acceptance. No repeat, model-loading probe or runtime restart is required for documentation closure.
