# ChatGPT Project routing and safe handoff — first implementation (2026-10-25)

## Product responsibility

**ChatGPT Project Chat** is the decision owner for that project; the current `AI-OpenClaw工作流` chat owns only integration, orchestration, project routing, safe execution bridges and UI. Other chats (AliceAI, NetScale, ChatDock, etc.) lead their own repositories and report acceptance within their own project context. OpenClaw Agents are advisers/workers; `chatgpt-loop.sh` + macOS LaunchAgent are mechanical browser/permission bridges, not additional Agents.

## Implemented foundation

- `config/chat-projects.json`: initial **one explicitly known** project-to-chat binding. Do not invent unknown Project IDs, chat URLs, new repositories or agent bindings. Each registration includes `key`, `repo`, `role`, `agentId`, `chatUrl`.
- `stage2/project-chat-routing.mjs`: strict `https://chatgpt.com/g/g-p-<32 hex>[optional label]/c/<conversation ID>` parser, canonical URL handling, a single user-provided `utm_source=chatgpt.com` tracker ignored for identity; arbitrary queries, fragments and foreign domains rejected. Derives a stable URL *project identifier prefix*, a separately variable human-readable project label, conversation ID, and canonical URL. The URL alone is **not browser-verified membership**. Registry rejects duplicate Project or conversation identities and unknown Agent names. A successor must belong to exactly the same registered Project ID but have a **different** conversation ID. Project renames in a URL do not silently grant other projects permission.
- `stage2/chat-handoff.mjs`: deterministic, browser-free state transitions `requested → handoff_ready → new_chat_verified → receipt_verified → agent_acknowledged → promoted`. Every stage enforces narrow prerequisites. A text handoff can be recorded only after proving it came from the old assistant turn; it is bounded, treated as inert data, and hashed. The new browser page must be verified inside the same Project and explicitly approved by the operator before any send. Receipt proof requires a role-scoped user bubble in the exact new chat; the project route switches only after the bound Agent acknowledged the new project context, the old watcher stopped and all evidence flags passed. Any send with an ambiguous receipt must remain pending and NEVER be blindly retried. The returned registry snapshot is not persisted yet.
- `stage2/chat-projects-cli.mjs`: read-only `status`, `inspect <url>`, `preview <key> <handoff-id>`, `check-successor <key> <new-url>`; prints structured metadata, never clicks, sends, creates, or reassigns anything.
- Three independent test files cover URL normalization, Project rename, cross-project denial, duplicate conversations, invalid Agent/repo binding, explicit context-limit signals, role receipts, approval gates and migration ordering.

### Source validation versus live functionality

The above is **only the new coordination foundation**. It does NOT automatically create ChatGPT chats, detect ChatGPT token counts, send handoff documents, install extra LaunchAgents or provision Agents. Existing single-chat watcher and its fixed macOS LaunchAgent remain unchanged until separate acceptance. Repository changes still require the Mac test-gated updater.

## Detecting a chat near its limit

ChatGPT does not expose a verified remaining-context percentage to this integration. **Message count / age / token guessing must NOT be presented as a true limit measurement.** Only explicit, independently observed UI indication in the exact registered conversation can trigger automatic `handoff_recommended`, once a version-specific UI observer is actually implemented and tested. An operator can request a handoff preemptively without any fabricated token estimate. Ordinary assistant prose must not be mistaken for a trusted system context-limit banner.

## Safe future migration transaction

1. Operator or verified ChatGPT UI limit signal requests rollover of a **specific registered Project + active conversation**. Allocate unique handoff ID, freeze the old route for new privileged actions, and persist private journal/rollback evidence.
2. Watcher, without context-reading another project, asks **that original ChatGPT** for a bounded handoff: scope, previous outcomes, verified tests, HEAD, current work, known incidents, next action, safety and permissions. Redact secrets. Do not claim it succeeded until a complete assistant turn from the original chat is observed. If the old chat cannot answer, stop for a manual handoff from project docs; do not hallucinate one.
3. Via the already authorized user Chrome profile, user-consented browser workflow creates a **new chat inside the same Project**. Verify actual location/Project membership, exact new chat URL and distinct new conversation ID from DOM and authoritative browser tab metadata. The mere ability to click New Chat or construct a URL is NOT proof. No cross-project navigation or arbitrary locator clicking.
4. Send handoff to the new chat with an immutable request ID + content digest and a durable **press-intent** journal written BEFORE Enter. Check fresh new-chat **user-role** receipt by the exact marker. On unclear delivery, read-only reconciliation; NEVER press Enter twice.
5. Request bound Agent to load only that Project's approved workspace and current handoff, and independently verify Agent acknowledgement. No new tools, shell permissions or alternate repository access.
6. Gracefully deactivate previous watcher route, confirm no competing process/lock, then atomically promote the new Chat URL in private approved registry. Record predecessor metadata and history, retain old chat and reports, no deleting the old conversation.
7. Emit migration receipt to the new and, if still available, old chats; present Project/Chat/Agent status via a read-only OpenClaw Control UI native plugin view. A restart must reconcile journal before any repeat action.

**Fail-closed:** missing user consent or UI proof, revoked Chrome access, ambiguous receipt, wrong Project ID, duplicate same-conversation tabs, unacknowledged Agent, non-fresh repo HEAD, stale watcher lock, or mismatched Project routing → do not promote. Keep last verified active route untouched.

## OpenClaw Control UI

OpenClaw currently documents Feature Plugins with native Control UI navigation and pages, but APIs are **experimental** and the user runs OpenClaw 2026.10.6. Pin this runtime and test its SDK contracts before installing any plugin. Aim for one `AI Ops` page under the **existing** local Gateway origin, not an extra web daemon. UI should distinguish `watcher process running`, `ChatGPT browser page_ready`, `handoff pending`, `bound Agent acknowledged` and `task receipt confirmed`. Only render bounded, redacted metadata by default. UI never supplies arbitrary process IDs, shell commands or user-supplied paths to a privileged executable.

## Mac read-only acceptance (after the repo's full native tests)

    cd ~/Documents/workspace/ioant-AI-Agent-Local-MacOS
    bash scripts/dev-env.sh exec node stage2/chat-projects-cli.mjs status
    bash scripts/dev-env.sh exec node stage2/chat-projects-cli.mjs inspect 'https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/6add3565-d868-83ec-804e-1e7a00eb0a59?utm_source=chatgpt.com'
    bash scripts/dev-env.sh exec node stage2/chat-projects-cli.mjs preview openclaw-workflow handoff-20261025-preview

These only compute local routing and suggested prompt text; they do not interact with ChatGPT, the browser, other projects, or the running watcher.

## Immediate next coding tasks

1. Verify current watcher **real ChatGPT page_ready and JSON feedback**, since PID alone is not end-to-end success.
2. Persist project registry and per-handoff journal safely on private local storage with atomic write + owner-locked idempotency.
3. Implement a strict, version-tested read-only exact-Project ChatGPT limit/banner observer, with operator-request fallback.
4. Build the user-consented **same Project** chat creation/delivery observer and test its DOM selectors in the actual Chrome version. No hidden browser API assumptions.
5. Wire Agent route rebind, old watcher release and immutable delivery receipts; then add native OpenClaw Control UI Feature Plugin.

## Phase 2 — Local private handoff journal

Implementation in `stage2/handoff-journal.mjs` now creates a project-scoped, owner-only, revisioned journal when a locally trusted orchestrator requests one. See `docs/HANDOFF_JOURNAL.md` for the exact write-ahead intent and crash-recovery safety boundary. The existing read-only CLI additionally supports:

    bash scripts/dev-env.sh exec node stage2/chat-projects-cli.mjs handoff-status openclaw-workflow

It prints metadata only and does not initialize absent storage. Persisting a handoff is separate from automating ChatGPT page creation or promoting the live registry; these remain future evidence-gated steps. No new action has been added to the browser worker allowlist.
