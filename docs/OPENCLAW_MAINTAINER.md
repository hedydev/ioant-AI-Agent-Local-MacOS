# OpenClaw Maintainer ↔ ChatGPT operational collaboration — Phase 1

## Ownership

The `AI-OpenClaw工作流` ChatGPT Project remains the **decision owner** for the OpenClaw integration infrastructure. A Maintainer checker on the Mac gathers evidence from its *already connected, authorized* local OpenClaw runtime and asks this ChatGPT to decide next. The checker is deterministic software, not a fourth OpenClaw LLM Agent yet. No existing AliceAI, OpenClaw Dev or main Agent gains any browser, shell, service or permission-management tools from this change.

The desired communication loop:

    Mac Maintainer checks → bounded structured report
          ↓ (existing exact-Chat browser bridge, only when ready)
    OpenClaw workflow ChatGPT diagnoses & selects fixed action
          ↓ (ioant-mac-ops-v1; strict action allowlist)
    Mac safe execution → same-chat verified receipt → ChatGPT acceptance

If the Chrome extension/Relay itself exposes **zero** target tabs, the transport is unavailable. The Maintainer can still inspect and create a local report, but **cannot deliver that report into ChatGPT through the broken Relay**. Claiming autonomous cross-chat messages or report delivery in this case is incorrect. A durable owner-private outbox with single-writer/receipt recovery is future work; never have a second worker independently type into a tab already locked by the existing watcher.

## First implementation

- `stage2/maintainer-health.mjs` performs only **four fixed, read-only diagnostic types**: `browser extension status --json`, `browser doctor --browser-profile chrome`, known Mac supervisor `status`, and `browser --browser-profile chrome --json tabs` sampled **twice** (two independent snapshots). Commands use exact installed OpenClaw local executable; no browser clicks, page snapshots, navigation, persistent settings changes or auto restart. It never reads other tab titles, content, cookies or secrets. Raw command outputs are not copied into the final result.
- `summarizeVisibleTabs` counts only structurally valid **same registered Project+Conversation IDs**, not guessed tab names. The total tab count is a count only; other URLs are ignored and not returned. Duplicate target tabs are a hard block.
- `assessMaintainerHealth` returns bounded `IOANT_OPENCLAW_MAINTAINER_HEALTH` with an *assessment* of sampled tab visibility, process status, and fixed troubleshooting recommendations. A successful extension status command does **not** prove Chrome is connected: its exit code indicates the status command completed. Neither a successful Doctor run nor a visible tab alone proves a ChatGPT message was sent. `relay_reports_zero_tabs` specifically does **NOT** mean permission was revoked; it may be a disconnected relay or a temporary tab enumeration failure.
- `formatMaintainerChatReport` builds a bounded, anonymized message intended for this ChatGPT. It does NOT send the message, impersonate a ChatGPT conversation, or retry a browser operation.
- Registered action `openclaw-maintainer-health` (the existing `ioant-mac-ops-v1` strict JSON shape) uses the current watcher and the fixed repo's `actionPlan` to run this exact check. Only valid existing assistant-role commands with unique IDs and the current watcher/Chrome's exact authorized tab can start it. Results are returned with the existing press-intent, user-role receipt and no-replay safeguards. No prompt, project key, flags, host, process ID, path or shell input is accepted from the ChatGPT message.

## Initial Mac acceptance

After the complete test-gated source update, run **read-only** once:

    cd ~/Documents/workspace/ioant-AI-Agent-Local-MacOS
    bash scripts/dev-env.sh exec node stage2/maintainer-health.mjs inspect openclaw-workflow

Expected shape:

    {"audit":"IOANT_OPENCLAW_MAINTAINER_HEALTH","schemaVersion":1,"state":"assessed",
     "projectKey":"openclaw-workflow","finding":"relay_reports_zero_tabs", ...,
     "autoChanged":false,"permissionsChanged":false,"reportDelivery":"not_attempted"}

The actual finding may differ. Do not assume `visibleTabs=0` persists without on-device results. The full suite includes tests for fixed actions, protocol denial of arbitrary arguments, duplicate target tabs, two samples, no raw browsing data and bounded message formatting.

### On-chat roundtrip (only after approved browser route works)

Current workflow ChatGPT may submit this assistant-role action:

    {"protocol":"ioant-mac-ops-v1",
     "id":"maintainer-health-unique-id",
     "action":"openclaw-maintainer-health"}

The existing watcher must independently find exactly one active authorized ChatGPT conversation, read the latest complete assistant task, execute the fixed read-only action, then submit a bounded `[IOANT-MAC-OPS RESULT ...]` message and confirm its **user-role** receipt. The software tests cannot prove Chrome relay is connected. If its target tab list remains 0, no task is delivered. The Mac-only health inspection can still return a standalone report.

## Future completion

1. Add one dedicated automatic per-login health sampler at a conservative interval and debounced change detection, using only the already validated read-only primitives. No process restarts during observation.
2. Add a single owner-private pending-report outbox, idempotent request ID + hash, write-ahead send intent, and a **single writer** on the existing authenticated ChatGPT watcher (no competing agents pressing Enter). When Relay recovers, deliver the oldest pending report once and independently confirm recipient user-role receipt. If uncertain, remain pending without auto resend.
3. Keep OpenClaw Dev/AliceAI as no-tool advisory agents. If a fourth named Maintainer Agent is approved for presentation in OpenClaw UI, provision it with a separate tool-denied policy and give its *non-privileged advice* only the sanitized health report; the deterministic Mac checker performs actual diagnostics.
4. Add explicitly approved, reversible local recovery actions with host proof and rollback; NEVER override Chrome `Pause`, user `Cancel`, disabled setup or revoked extension permissions. Surface failure states in native OpenClaw UI.

Chrome extension reference: https://docs.openclaw.ai/tools/chrome-extension. `All tabs` can exclude user-paused tabs. Explicit debugger Cancel remains effective even across reconnection. Opening arbitrary tabs or automatically changing Chrome access modes without user consent is forbidden.


## Phase 2 — persisted zero-tab incident notification (candidate)

The next stage uses **the existing exact-Chat, single-writer watcher**, not a competing background browser process. `stage2/maintainer-outbox.mjs` provides pure notice generation, strict Project+Chat identity, receipt markers, a write-ahead `press_intent`, and confirmation-based clearing. `stage2/chatgpt-loop.mjs` integrates the notice with its existing private `state.json` and atomic save/receipt-first message delivery. The watcher must actually run this new code; updating the Documents development checkout does NOT update its independent private runtime checkout or prove successful delivery.

### Trigger and recovery

- The registered `openclaw-workflow` ChatGPT conversation is the only eligible notice recipient. The current `chrome` profile must return an **empty, valid tab list** twice in succession; browser command errors, other ChatGPT tabs, missing only the target, and duplicate active target tabs do **not** create this incident.
- One pending notice per Project/Chat is persisted in the existing owner-private watcher `state.json`; the checker cannot overwrite a pending notice, open tabs, repair debugging sessions, broaden permissions or access another Chat.
- When the originally registered exact ChatGPT conversation becomes available again and prior task feedback has been reconciled, the existing watcher sends the bounded notice to the same Chat using its existing `sendToChat`. A dedicated notice receipt prefix is checked **only in a user-role message**. The `press_intent` barrier is written BEFORE Enter.
- If the browser result or send is ambiguous after `press_intent`, subsequent watcher iterations check receipts **read-only** and never repeat Enter. The watcher will keep the pending notice (and pause subsequent new tasks until reconciled). Manual recovery may be required if Chrome's receipt UI never exposes it; do not erase state/locks as a workaround.
- The notice explicitly states it is historical: zero tabs were observed before the page recovered. It is NOT proof the user revoked access or the local model, Agent, or Gateway failed.
- The registered action `openclaw-maintainer-health` remains available for the current ChatGPT to request a fresh four-category read-only diagnosis once the notice is delivered.

### Acceptance

1. Protected Mac source updater full `node --test` gate passes. Seven additional outbox tests check identity, idempotency, bounded content, write-ahead no-replay and watcher code structure; **expected 397 tests**, actual Mac confirmation pending.
2. Update the **private Application Support runtime checkout separately** using its own protected `project-self-update.mjs` if the exact installed supervisor recognizes that runtime. Do not change plist, restart Chrome, modify extension permissions or manually kill processes. The previously running watcher may continue on older code until its process is safely reloaded.
3. Read-only `stage2/maintainer-health.mjs inspect openclaw-workflow` may remain `relay_reports_zero_tabs` when Chrome still exposes no tabs. In that case **automatic delivery cannot occur**; the notice waits for a future verified same-Chat reconnect. Do not assert that a report was delivered without user-role receipt evidence.
4. If Relay recovers, check `stdout.log` for `Maintainer incident delivered and receipt confirmed` and confirm that the ChatGPT conversation actually shows the notice. No automatic Agent tools, Chrome debugger bypass, or new Project Chat creation are part of this stage.

The official Chrome extension reference documents user-paused tabs, debugger Cancel and the limits of status output: https://docs.openclaw.ai/tools/chrome-extension
