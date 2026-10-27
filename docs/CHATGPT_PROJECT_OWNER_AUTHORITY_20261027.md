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
