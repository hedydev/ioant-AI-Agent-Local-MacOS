# Deterministic inspection, execution routing and Agent receipts

## Observed cause

The operator approved fixing stale plugin metadata, ambiguous Agent errors and
incorrect execution-route selection after a real project Chat used native Agent
calls for Git inspections and attempted cloning. No business project checkout,
clone, compile, deployment, VPN or old operation was rerun during this repair.

Read-only native runtime metadata gave stronger evidence than wall time alone:
one real Git-inspection run waited about118 seconds before its exec call. Exec
returned success about0.7 seconds later. The run then ended with explicit native
aborted/timedOut/timedOutByRunBudget flags. This demonstrates a total Agent budget
exhaustion rather than a shell command that itself ran for120 seconds. Another
clone attempt has no reconciled terminal evidence and remains unknown. Do not
rewrite its old receipt or replay it based on this diagnosis.

The bridge previously collapsed CLI failures, aborted runs, metadata/payload
problems and missing answers into agent_receipt_unavailable_do_not_repeat. The
CLI wrapper also discarded valid terminal JSON on a nonzero exit. Thus an Agent
could have used a tool successfully while the caller lost the typed result.
Persisted MCP receipts already existed; this was not evidence of disk-write failure.

The cloud catalog inspected before this repair had no workspace_mode parameter,
although the running source supported it. Source/SDK support alone is not a cloud
catalog rollout. Tools and server instructions must be refreshed in ChatGPT.

## MCP0.9.0 routes

| Intent | Preferred path |
| --- | --- |
| Local Git HEAD/branch/status/diff | openclaw_project_inspect, deterministic and read-only |
| Tracked scripts, repository update, builds/tests | project_actions → project_execute → project_result → project_report |
| Bounded native UI/Agent task | computer_task → computer_result; local-model total budget120 seconds |

Full Agent permissions remain enabled. Routing guidance does not revoke tools or
add natural-language command blockers. Respect the user's desired working tree.
Isolated execution is optional for appropriate authorized tests/builds; it is not
a default instruction to clone repositories or permission to discard local edits.
In-place execution still requires its existing clean-checkout preconditions.

## Read-only inspection

The shared catalog adds openclaw_project_inspect (sixteen dynamic tools; fixed
single-project base remains unchanged). The route requires the registered project
key. No arbitrary command, path, Agent, remote URL or runtime is accepted.

- Validates the same enrolled canonical checkout/branch/origin identity.
- Allows a dirty tree; all Git invocations are fixed reads with optional index
  writes disabled, fsmonitor disabled, and no external diff/textconv.
- Summary returns local HEAD/branch/status, not latest remote HEAD. No fetch.
- details=diff reads tracked staged/working diffs. Untracked contents are excluded.
- Redaction occurs before4000-character pagination. Later pages require the first
  snapshot_sha256; changed data returns changed rather than mixing revisions.
- Oversized/truncated command captures return a typed failure and no partial diff.
- Reads are an observation, not an atomic filesystem snapshot or mutation approval.

The tool needs neither Chrome Debug, desktop permissions nor a local model. It
does not itself clean, clone, update, stage, commit or execute tests. The AI reads
actual differences before deciding its next authorized action.

## Typed Agent outcomes

agent-result.mjs interprets bounded native fields and does not expose raw provider
errors, stderr, prompts or traces. Distinct reasons include:

- agent_cli_timeout / agent_cli_launch_failed / agent_cli_failed;
- agent_result_capture_limit / agent_result_invalid_json;
- agent_metadata_unavailable / agent_model_policy_unverified;
- agent_run_timeout / agent_run_aborted / agent_run_not_completed;
- agent_payload_unavailable / agent_answer_empty / agent_invocation_exception.

Explicit native timeout flags take priority; elapsed time alone never becomes a
timeout diagnosis. Nonzero CLI terminal JSON can preserve tool/timeout metadata
while keeping the outcome inconclusive. Success tool names are evidence about
those tools, not independent business-effect verification.

Results separate executionOutcome:unverified from receiptPersisted:true. Only a
successful durable write returns the latter; a write failure reports false.
Cached outcomes and at-most-once operation IDs remain unchanged. Old generic
receipts retain their original contents. Unknown effects require reconciliation,
not a new operation ID or a different execution mode to repeat the same task.

## Verification and rollout

Full regression:1336 passed, zero failed/skipped/cancelled. Targeted tests cover
native abort/timeout evidence, nonzero JSON, distinct errors, sensitive-data
omission, actual temporary Git repositories, index/source/HEAD preservation,
pagination changes, output bounds, enrollment and arbitrary-argument rejection.
No model inference was needed for these tests.

The operator-approved rollout uses the existing console's in-memory key and
POST /api/control/restart only after observing no active tasks. Web/Gateway are
not restarted. Plugin management has no connector Refresh operation, so Chrome
settings provide Refresh tools. Verify the actual refreshed cloud schema contains
workspace_mode and the new inspection tool; do not infer it from local tests.

Mac/bash reusable checks (already run during delivery):

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
bash scripts/tunnel-console-service.sh status
bash scripts/dev-env.sh exec node --test test/agent-result.test.mjs test/project-inspection.test.mjs
```

Frontend refresh cannot reload MCP source. Use the console's Restart Tunnel when
upgrading MCP, then ChatGPT Plugins → OpenClaw Mac → Refresh tools. Preserve the
private key in server memory; never retrieve credentials from browser/process
state. Do not terminate the stdio child alone, overlap Tunnel clients, or restart
while another native task is in flight. Old model-induced unknown operations are
not authorized to run again by a successful deployment.

## Actual rollout acceptance

The guarded reload waited for a quiescent task window and reused the existing
console memory key. Tunnel returned ready. The same-child initialize evidence
reported ioant-openclaw-direct0.9.0. Chrome Refresh tools completed; plugin details
showed Write6 + Read10, including project_inspect and workspace_mode guidance.
The existing Codex conversation retained its earlier injected tool declarations;
that stale in-turn view was not treated as proof that cloud refresh failed.

In the previously authorized workflow Chat, a single read-only acceptance prompt
MCP_ROUTING_V09_READONLY_20261030 requested project_actions and project_inspect only.
The actual web response confirmed both workspace_mode choices visible, the new
inspector callable, repository_inspection, readOnly:true, modelInferenceInvoked:false,
networkInvoked:false and worktreeClean:false. Independent MCP audit records show
the two reads; inspect completed in about142ms. No project_execute/computer_task
was submitted for this acceptance. The normal ChatGPT response itself uses the
web subscription; the local inspector invokes no additional model or paid API.

A separate local SDK check enumerated16 tools and read workflow/NetScale metadata
without fetch or mutation. It is supplemental evidence, distinct from the real
web call. The source and index preservation tests used disposable local Git
fixtures. Native timeout classification is fixture-tested; historical unknown
operations are not retroactively assigned a success or new diagnostic reason.

Current local checkout dirty states are observations, not permission to clean or
re-run jobs. Existing chats should use the refreshed tool definitions on subsequent
work; if a client keeps an old schema/session, reload that chat or reselect the
installed plugin before proceeding. Do not reinstall or change permissions.

Shared guidance was updated and pushed in Hero Skills a0c41e4, teaching deterministic
inspection, calling-chat schema verification, optional isolation and distinct
Agent/command/receipt outcomes without copying private runtime state. This product
pins that revision. At final checkpoint the five-hour Codex window had about14%
remaining; scoped code/docs and this verified continuation record are being pushed
before the requested low-usage threshold. No automatic old-job replay is pending.
