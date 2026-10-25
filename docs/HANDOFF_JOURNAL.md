# Resumable ChatGPT Project handoff journal — Phase 2

This component supports project-scoped reliable state recording. It is NOT yet a browser automation agent, ChatGPT-limit detector, chat creator, send dispatcher or a permission grant.

## Mac-only storage

- The configured developer-cache root is fixed under `/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos` and provided by the existing `scripts/dev-env.sh`.
- The private journal lives at `$PROJECT_DEV_CACHE/chat-projects/handoffs/<project-key>.json`; it is NOT written to the repository, transmitted to GitHub, exposed through Agent chat, or logged to the UI in full.
- Directories are owner-only `0700`, journal files `0600`, with owner/symlink and canonical-root checks and bounded file size. An atomic `mkdir` per-project lock ensures no two local workers advance the same handoff concurrently; an unrecognized or interrupted lock remains **blocked** for explicit operator review. No PID kills or automatic orphan deletion.
- Each completed journal write uses a unique exclusive temporary file, file synchronization and atomic rename. Every mutation increments a project-local revision, rejects stale expected revisions and enforces a one-active-handoff-per-project invariant. No existing journal can be replaced with a different active request.
- Before submitting any handoff to a new ChatGPT composer, a *future authorized browser worker* MUST first persist `sendPhase: press_intent` through `markHandoffPressIntent`. Once recorded, restart/retry can only **read** the new chat to reconcile its user-role receipt. It must NOT automatically resubmit. Ambiguous delivery needs manual review, preserving exactly-once intent. The current journal never sends itself.
- A private helper `readHandoffPrivate` is only for the trusted Mac-side orchestrator and contains handoff prose. The CLI `handoff-status` returns only bounded fields: project key, phase, revision, request ID, source/destination conversation IDs, delivery phase and history count. Neither the CLI nor the ordinary diagnostic logs reveal document content.
- Stage advancement re-evaluates the pure handoff transition functions, strict registered project/Agent binding and equal immutable identity fields. It rejects skipped phases, changed handoff hashes, moved projects, unconfirmed receipts and Agent swaps.
- Automatic route promotion and archive migration are intentionally NOT enabled until the exact browser/new Chat Project membership, user role receipt, Agent acknowledgement and old watcher exit have been proven on the real Mac. `agent_acknowledged` can be recorded; promotion remains a separate future privileged transaction.

## Semantics

`requested → handoff_ready → new_chat_verified → [press_intent] → receipt_verified → agent_acknowledged`

The final `promoted` step is not writable via this module yet; the original configured Chat URL and LaunchAgent remain unchanged.

The journal does not infer context usage percentage from message count. Current ChatGPT does not expose a verified remaining context API to this integration. Automatic limit-triggered requests need direct observed UI evidence, while the user can request a handoff at any time. Do not treat ordinary assistant text as a limit banner.

## Existing operator read-only commands

After full native test-gated checkout update:

```bash
cd ~/Documents/workspace/ioant-AI-Agent-Local-MacOS
bash scripts/dev-env.sh exec node stage2/chat-projects-cli.mjs status
bash scripts/dev-env.sh exec node stage2/chat-projects-cli.mjs handoff-status openclaw-workflow
bash scripts/dev-env.sh exec node stage2/chat-projects-cli.mjs preview openclaw-workflow handoff-example-20261025
```

`handoff-status` is read-only: when the journal directory has not been initialized it returns `state: idle` and does not create storage. `preview` only prints a handoff request prompt, does not send it to ChatGPT.

## Implementation security boundary

`stage2/handoff-journal.mjs` functions are callable only from trusted local code. They assume independent, **real** evidence gathering by the future privileged browser and Agent witnesses; passing `true` to pure witness helpers is not an authorization mechanism. Future ChatGPT model responses and Web page text must NEVER be permitted to supply `root`, `expectedRevision`, `verifiedState`, Agent ID or evidence flags directly as an executable task. Chat messages remain restricted to the existing `ioant-mac-ops-v1` allowlist, which this change does **not** expand.

No new browser Chrome tabs, Project chats, task execution, system service changes, Agent tools, or external ports are installed by this commit. Existing `com.ioant.openclaw.safe-watcher` stays bound to the currently approved conversation.

## Next implementation tasks

1. Observe a verifiable context-limit/explicit rollover banner in a registered exact ChatGPT project without reading unrelated tabs.
2. Build a named, user-approved browser migration witness tested against actual current ChatGPT Projects UI; record the created successor ID only after browser/DOM confirmation.
3. Implement source assistant handoff capture and new-chat user-role receipt with a write-ahead intent before Enter.
4. Implement safe, verified Agent acknowledgement and atomic route promotion from a locked source Project binding to a new Project chat without racing the old watcher.
5. Surface only sanitized status and timestamps in the native OpenClaw Control UI, once current 2026.10.6 Feature Plugin compatibility is confirmed.
