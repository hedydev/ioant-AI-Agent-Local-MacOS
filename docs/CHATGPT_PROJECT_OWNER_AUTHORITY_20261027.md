# ChatGPT Project Chat ownership of IOANT workflows — 2026-10-27

## Mandatory authority rule (user-confirmed)

**The corresponding ChatGPT Project conversation owns all project reasoning, development decisions, code authoring/review, test evaluation, and acceptance.** OpenClaw Workers and local Ollama/OpenClaw Agents are supporting actors only. Do NOT promote a model's proposed plan, code or test judgment into the project owner's decision by default.

| Project | Authoritative ChatGPT conversation | Supporting Worker / Agent |
| --- | --- | --- |
| `openclaw-workflow` | ChatGPT OpenClaw workflow conversation, currently bound as `6adfdfb9-65b0-83ec-b6ac-155e7852c6af` | `com.ioant.openclaw.safe-watcher`; local technical advisors; separately constrained `mac-computer` only with its own approval |
| `alice-ai` | ChatGPT AliceAI conversation in its own Project, ID `6ade11a5-f0c0-83ec-add1-8a0cff00c938` | `com.ioant.openclaw.alice-coordinator` (currently read-only host scope) and local `alice-ai` advisor |

## Required control flow

1. User asks the **corresponding ChatGPT Chat** to investigate/design/implement/test/review.
2. That Chat may ask a Worker to fetch bounded facts, run authorized commands, apply pre-reviewed changes or run tests, or consult local Agents and receive their bounded responses.
3. The Worker returns reproducible evidence / execution receipts **to that same Chat**. The Worker cannot infer acceptance from process exit code or model answer.
4. The owning ChatGPT Chat does the reasoning, determines necessary code changes, evaluates evidence and issues an explicit acceptance/rejection decision. Any data-plane workflow receipt is evidence, not approval.
5. A ledger task can advance only on an authorized, attributable decision from the **correct** owning Project Chat, with auditable review evidence. Future implementations need strong origin binding, anti-replay and version checks; merely supplying a `verifierId` string is not an authentic Chat identity.
6. Project authority does not imply bypassing tool permissions: only separately authorized Worker actions may write files, invoke tests or control a Mac; Alice coordinator's read-only host scope remains unchanged unless separately approved.

## What was actually tested

- Task 125 called the local OpenClaw `alice-ai` Advisor (no tools). It produced bounded *advisory* requirements text, not a ChatGPT AliceAI Chat task decision. It neither read the AliceAI repo nor modified Minecraft.
- Task 126 checked its persisted SHA-256 evidence. The model text was truncated (terminal showed `[truncated]`) and lacked concrete acceptance criteria. Neither task constituted Alice Chat acceptance.
- `alice-local-pilot` is currently reported at revision 24, `requirements` = `verification_pending`, one receipt, no downstream tasks ready. This state must not be auto-accepted, force-reset, re-run or promoted merely from an ops-side review.
- Existing seven DAG "Agent" identities are **logical role labels only**, not seven installed OpenClaw Agents and not seven ChatGPT conversations.
- Cross-Chat Alice delivery is **not yet verified**. Alice coordinator's prior handshake remains `requested`; exact-tab Chrome Relay was not ready, and an alternative browser reading tool denied host access. Do not bypass that refusal via raw CDP, alternate browser or other local page extraction. No promise of actual Alice Chat communication until a policy-compliant route is verified.

## Immediate implementation correction

- Suspend development and use of any autonomous `task_accept` or `task_review_reject` for AliceAI based on a local Agent, generic Worker status, or the OpenClaw-workflow Chat.
- A rejection/approval should be proposed as a review packet **to ChatGPT AliceAI Chat**, then only applied if that chat explicitly authorizes the outcome via a confirmed same-project channel.
- Until that communication path works, produce drafts and evidence without mutating the Alice workflow.
- Local Agent assistance is opt-in and always attributed, bounded, inspectable, and subordinate to the owning Chat's decisions.
- When implementing code generation, the owning Chat provides the plan and reviews patches; Workers can apply patches as technical execution but cannot independently approve code or tests.
- Keep private Mac workflow journals on LunaDrive, operator reports on Desktop; Google Drive sheets are separate project planning artifacts, not authoritative replicas of the workflow journal unless explicit synchronization is implemented and verified.

## 2026-10-27 — Alice owner-only evidence preview transport (source candidate)

After task 126 verified a SHA-256-backed local `alice-ai` advisor reply at workflow revision 24, the user reiterated that **ChatGPT AliceAI Chat**, not this OpenClaw-workflow Chat or any local Agent, owns AliceAI code analysis and acceptance.

A new narrowly scoped **read-only** action, `alice-owner-review-preview`, is recognized by the structured task parser and permitted only in the existing `alice-ai` isolated coordinator route. It requires exact pinned Alice Project + conversation identity already verified by the watcher; rejects prompt, command, path, model, verdict, verifier or arbitrary task fields; does not use `runner.runAction` or grant tools. The handler reads the owner-private existing workflow/evidence, verifies revision 24, receipt, SHA-256, role and `verification_pending`, and returns a bounded packet consisting of provenance and the **untrusted, truncated local advisor suggestion** for Alice ChatGPT to evaluate. No new browser writer, direct message sender, config update, task claim, task acceptance or rerun is introduced.

**Delivery limitation:** This command can be initiated only by an assistant response in the **exact** AliceAI Project Chat, and feedback can be returned only when the authorized Chrome Relay exact Chat tab and composer are available. Historical live checks showed the Alice tab missing in that Relay and handshake state `requested`. Thus a committed/deployed handler does **not** prove that ChatGPT AliceAI has received its contents. Do not use an alternative browser automation channel to evade previous host restrictions. Keep the live workflow at revision 24; do not accept, reject or restart the task from an ops-side result.

Suggested owner-chat request once the authorized Alice Chat is independently reachable:

```json
{"protocol":"ioant-mac-ops-v1","id":"alice-owner-review-preview-001","action":"alice-owner-review-preview"}
```

When a matching same-Alice-chat `[IOANT-MAC-OPS RESULT ...]` arrives, the Alice ChatGPT Project Chat should reason over the advice with its AliceAI repository context and either request a revised plan or explicitly approve an actionable requirement spec. An authenticated, owner-bound durable decision/acceptance adapter is **not yet implemented**. Merely asking for a preview must never update the ledger.

## 2026-10-28 — Mac visual helper node identity correction

- `scripts/openclaw-mac-visual.mjs` v1 `inspect` was blocked with `active_macos_node_unavailable`; task 138 separately observed one connected macOS node advertising `screen.snapshot` and `computer.act`. No screen capture or `computer.act` was invoked.
- The root issue is an overly restrictive selection predicate that assumed `nodes status --json` reports the invocation identifier as `nodes[].id` and that it must equal `activeNodeId`. The status format may instead report `nodeId`, and `activeNodeId` is not guaranteed to target that unique connected macOS node.
- Selection policy now supports `nodeId` and legacy `id`. If exactly one connected macOS node exists, select it; if multiple exist, require exactly one active-ID match; never select offline nodes, iOS nodes, display names, or ambiguous IDs. Reject missing identity. The `inspect` operation remains read-only, with no screenshots, browser actions, mac-computer control or model calls.
- Screen capture still requires a separate explicit operator task using `capture`; its result must be verified live with the actual Mac node. The previously blocked run did not perform capture. Do not mistake advertised capabilities for effective OS/Gateway approval.
- Permanent user preference: anything involving more than trivial logic must be implemented and tested as a version-pinned repo script, then invoked by a **short** Worker command. Reports and logs belong on Mac Desktop.

## 2026-10-28 — Opt-in local visual advisory for Alice Chat connection diagnosis

- Actual task `139E` called the already paired macOS OpenClaw Node's `screen.snapshot` and saved an owner-private `1280x720` JPEG to Desktop, 142132 bytes, SHA-256 `0921882d0523aeacaa558235c6bb9cd940ae8229b08c889dad144fe9654536ad`. Computer actions and browser writes were not invoked.
- The screenshot is on the user's Mac; the owning ChatGPT OpenClaw project conversation has **not** seen the image. Do not claim the Alice tab is visible until evidence from image inspection supports it.
- `scripts/openclaw-mac-vision.mjs analyze <exact Desktop screenshot filename> <sha256>` is a new separately invoked operator task for advisory visual analysis. It verifies fixed filename shape, regular owner-private file, JPEG/PNG magic and digest, then sends the image **only to** Ollama `127.0.0.1:11435` using `/api/chat`; no external service is involved. It refuses a busy Ollama (`/api/ps` not empty), refuses models without explicit `/api/show` vision capability, and never downloads, installs, or changes models.
- It writes a bounded advisory report and summary to Desktop. Local model output is untrusted observation, not authentic DOM/tab matching, permission approval or ChatGPT Alice project acceptance. No browser navigation, raw CDP, extension toggle, `computer.act`, keyboard/mouse operation, workflow mutation, or automated permission bypass is added.
- Run full candidate tests and approved `project-update-verify` deployment before Mac invocation; actual Ollama visual inference remains unverified until operator posts a fresh receipt. If a screenshot contains private material, its processing is local-only and no raw screenshot is printed or uploaded by this helper.

## 2026-10-28 — Local vision diagnosis of existing Mac screenshot

- Mac-native `screen.snapshot` live capture task 139E succeeded, producing a bounded 1280x720 JPEG, 142132 bytes, SHA-256 `0921882d0523aeacaa558235c6bb9cd940ae8229b08c889dad144fe9654536ad`. OpenClaw Node action reported `invokedComputerAct:false` and `changedBrowser:false`. Snapshot file exists on the operator's Desktop; it is **not** in this GitHub repository and its pixels were **not** observed by ChatGPT.
- Candidate `scripts/openclaw-mac-vision-audit.mjs <exact 64-character SHA>` operates only on an already-captured Desktop screenshot whose contents verify that digest, owner, mode and image signature. It never asks Mac Node for another image or calls browser, CDP or `computer.act`.
- The candidate script selects an already-installed Ollama model via localhost `/api/tags` and `/api/show` only when that model reports `vision` capability; it sends JPEG/PNG image bytes to `127.0.0.1:11435/api/chat` as an inline base64 image. It does not install or pull models, and does not call external APIs.
- Model output is treated as **untrusted advisory observation**, not proof of browser registration, source of commands, or approval. It must meet a small bounded JSON schema, and it is written to Desktop with owner-only permissions. Actual Relay tab identities still require a separate authorized OpenClaw browser observation. Do not interpret the existence of `ON` or Chrome debugging UI as a verified exact AliceAI Chat relay binding.
- Run only after reviewed GitHub main commit and `project-update-verify` with full regression. Existing AliceAI Chat handshake and rev24 workflow state remain unchanged.
