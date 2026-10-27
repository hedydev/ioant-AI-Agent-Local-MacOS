# AliceAI separate ChatGPT Project / multi-Worker handoff pilot — 2026-10-27

## Verified registration inputs (not a running Worker)

- AliceAI user-selected Project URL: `https://chatgpt.com/g/g-p-6acaef839af081919426a885b3209f54-ai-mc-alice/c/6ade11a5-f0c0-83ec-add1-8a0cff00c938`.
- Project ID: `g-p-6acaef839af081919426a885b3209f54`; conversation ID: `6ade11a5-f0c0-83ec-add1-8a0cff00c938`.
- Repository: `hedydev/ioant-AI-Minecraft-Alice` main, confirmed present. OpenClaw Agent identity: `alice-ai`, **binding only**, no new tools granted.
- Existing `openclaw-workflow` Project, Chat, Agent and foreground Worker remain unchanged.
- Registry entry and unit tests are **source-only** until the Mac candidate suite and a controlled update are complete. URL identity is not Chrome DOM/Relay visibility evidence.

## Proposed architecture

One trusted Chat I/O coordinator per Project conversation owns browser writes and conversation locks; independent execution Workers (e.g., planning, code, test, review) do NOT send directly to the same composer. The coordinator uses a private durable lease/receipt workflow ledger, role-specific capability manifests, and a verification barrier before advancing the task DAG. Do not treat Agent identity as authorization for host commands.

## Phased test (isolation first)

1. Validate the repo registry and full node suite without changing live services. Confirm exact AliceAI tab visibility in existing authorized Chrome profile via read-only `tabs` then exact DOM probe, never guess target IDs.
2. Before starting a second coordinator, verify per-conversation lock identity, state/reports isolation, independent launcher lifetime, and per-Project capabilities. Audit any global flags shared with the existing Worker. Do not automatically reuse current `mac-terminal` privilege in AliceAI chat.
3. Start a **separately operator-approved** AliceAI coordinator only after an isolated canary. First use `project-head`/read-only probes pinned to the AliceAI repository; prevent the existing `project-head` handler from accidentally reporting the ops repository.
4. Rehearse the handoff state machine without browser writes. Later, user-approved real successor creation must be in the same AliceAI Project, with verified URL+DOM, private handoff content digest, journalled press intent and user-role receipt, verified successor canary, and confirmed retirement of the old coordinator before route promotion.
5. Never mutate live Minecraft, Mint BDS 17879/17880, production AliceAI, other Project chats or the OpenClaw Gateway during this pilot.

## Current non-goals

No browser clicking, chat creation, Agent model changes, LaunchAgent installation, local workflow scheduler deployment or restart of existing Worker. No reliable ChatGPT remaining-context percentage is exposed; manual handoff is the initial trigger. A registered URL is not yet a verified independent Worker.
