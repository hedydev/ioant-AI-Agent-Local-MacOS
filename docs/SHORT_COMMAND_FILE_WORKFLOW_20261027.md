# Short command-file tasks for Mac Worker (2026-10-27)

## Why

Task 075 was not executed. The Watcher reported malformed structured task on 2026-10-27 13:35:58 and then invalid_task heartbeats. Current stage2/protocol.mjs limits mac-terminal command text to 2048 JavaScript characters and 4096 UTF-8 bytes. The current watcher safely rejects malformed tasks but does not provide a diagnostic receipt, so the conversation stalls until a corrected assistant message appears.

## Method

Save complex, tested ESM command scripts in stage2/tasks/ within the GitHub repository. Only deploy after focused and full tests with project-update-verify. The assistant then issues one short JSON mac-terminal action with a new task ID and fixed checked entrypoint. Verify the deployed Git HEAD before execution. Do not allow arbitrary paths, credentials, or shell input. Never reuse an ambiguous run ID or replay a model invocation.

The current script stage2/tasks/main-continuation-benchmark.mjs completes the deferred benchmark for main Agent. It reads the existing off-base test session, refuses to generate if any session is already active or status is unknown, issues at most one thinking-off Agent run without external delivery, and reports numeric timing, token usage, and correct/incorrect only. Timeout does not cancel or automatically retry the Agent run.

A valid future task can use command:
set -euo pipefail; RT="$HOME/Library/Application Support/ioant-openclaw-ops/runtime"; test "$(git -C "$RT" rev-parse HEAD)" = "VERIFIED_SHA"; node "$RT/stage2/tasks/main-continuation-benchmark.mjs"

## Follow up

Add a separate rate-limited, one-time invalid-task feedback receipt, without executing invalid code and without echoing command text. Preserve exact-chat authorization and user-message receipt idempotency. This is not yet implemented.
