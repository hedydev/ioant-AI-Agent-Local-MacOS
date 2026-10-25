# Stage 3 — read-only ChatGPT Project browser observation

## Scope

The operator verified 371/371 native Mac tests for the prior handoff journal version `58359e2bc2f7ec51fe9e03118cdfe2ec1e5214a3`. The source checkout has one active registered Project Chat: `openclaw-workflow`, bound to `openclaw-dev`. The handoff journal is `idle` with revision 0.

This stage adds a **single-shot read-only** page inspection to validate browser capabilities before any migration writes. It DOES NOT create a new conversation, detect ChatGPT's undisclosed remaining-context percentage, type/press into the page, grant Agent tools, or modify the existing running macOS watcher.

### Mac user command — after full test-gated source update

```bash
cd ~/Documents/workspace/ioant-AI-Agent-Local-MacOS
bash scripts/dev-env.sh exec node stage2/project-chat-ui-probe.mjs probe openclaw-workflow
```

Read-only result `audit=IOANT_PROJECT_CHAT_UI_PROBE` reports:

- `target_unavailable`: OpenClaw Chrome extension currently does not expose the **registered active conversation**; report counts only and don't guess a new tab.
- `blocked`: unregistered Project, duplicate current conversation ID tabs, malformed/untrusted handles, or actual page route changed. Do not pick another chat.
- `inconclusive`: temporary browser/Gateway/evaluate failure, malformed or oversized result. No browser writes.
- `observed`: exactly one matching authorized browser tab and DOM page identity confirmed. Report only `pageVerified`, `hasMain`, `composerPresent`, the **count** of possible New Chat controls (not usable click references), and `explicitContextLimit`.

The call is bound to **the existing** OpenClaw Chrome extension profile (`chrome`) and current registered Project ID + conversation ID; it invokes at most one browser `evaluate` on the exact matching tab, after a read-only `tabs` query. The page-side inspector reads a bounded number of UI controls and application-level alert/status banners, with hard-coded permitted labels. It never returns chat contents, input values, arbitrary labels, other tab titles/URLs, cookies, screenshots or page HTML. The Node validator rejects any extra result fields.

### Context-limit evidence limitations

`explicitContextLimit='explicit_limit_banner'` means only that a known, exact application-level alert text matched. Normal result is `unknown`. **Unknown is not 'plenty of context' or 'not near the limit'.** There is no verified remaining percentage; an operator may still request a handoff preemptively. Assistant text quoting a warning is NOT a trusted UI banner. Any new UI language or structure must be independently checked and explicitly tested before adding signatures.

### Project membership evidence limitations

The Project prefix encoded in a ChatGPT URL identifies the expected chat route, not independently proven membership. The observer validates actual DOM `location.href` again, but does **not** yet prove that a **newly created** chat belongs to the intended Project. The `newChatUiCandidates` count is **only a visual readiness hint**. It does not authorize clicks, identify a unique button, or prove a click would create a Chat. New-chat creation will require direct version-specific UI tests plus user approval, new-page Project verification and a durable journal.

### Important existing browser discrepancy

The user's Chrome extension is Connected and All tabs, but OpenClaw's `browser --browser-profile chrome --json tabs` previously enumerated an inconsistent subset (the active conversation sometimes absent). Another connected browser view may see the correct ChatGPT tab without proving OpenClaw Relay does. This probe uses the **actual OpenClaw CLI** so it cannot silently substitute another browser source and claim Gateway delivery.

### Acceptance criteria

1. Existing registered Project key remains unchanged and source checkout full test gate passes.
2. Probe returns bounded JSON with no private text or foreign URLs; one exact target or `target_unavailable`.
3. No Chrome navigation, click, page write, model call or task execution is triggered.
4. A successful `observed` output is **read-only page health evidence**, not proof that the existing background watcher is attached, or that a new chat can be created.
5. After the Mac report, design an opt-in, recoverable browser-created Project chat proof with no duplicate Enter and no active route promotion until all journal gates have passed.

Source: `stage2/project-chat-ui-observer.mjs`, CLI: `stage2/project-chat-ui-probe.mjs`, tests in `test/project-chat-ui-*.test.mjs`. OpenClaw CLI docs: https://docs.openclaw.ai/cli/browser . ChatGPT Projects reference: https://help.openai.com/en/articles/10169521-projects-in-chatgpt .
