# Autonomous ChatGPT Project environment recovery — design and boundaries

Status: **pure planner with tests**. It does NOT yet launch Chrome, read tabs,
visit ChatGPT, call computer.act, type, or change conversation bindings.
Runtime actions require properly supported and authorized interfaces.

## User requirement

The operator asks the AI to continue a project. The AI should then determine
and restore any missing browser prerequisites autonomously, without asking the
operator to repeatedly set up Chrome or re-enable an already enabled extension.

1. Reuse a known exact AliceAI ChatGPT conversation when it exists.
2. Treat Chrome tab existence and Relay registration as independent evidence.
3. When the page exists but Relay is missing it, diagnose the mismatch rather
   than opening a second tab.
4. When all windows have been independently scanned and the conversation
   is absent, propose opening the pinned conversation URL, not a new chat.
5. When Chrome is confirmed closed, propose an approved launch and verify.
6. When the pinned conversation fails, "AI-MC-Alice / recent" is only a
   candidate: verify the exact Project and conversation IDs. Never silently
   bind a Worker to whichever item happened to appear first.
7. Independently confirm a task receipt inside the exact conversation before
   declaring the cross-ChatGPT coordinator healthy.

## Evidence hierarchy

- Relay inventory says which accessible Chrome tabs OpenClaw has attached.
  A missing tab does NOT mean it is absent from Chrome.
- Mac OS / Chrome window inventory must consider all windows and be complete
  before an absence assertion is meaningful.
- A visual screenshot can advise UI recognition but it may be stale or
  misread. Title recognition alone cannot prove the exact conversation ID.
- Host browser policy and user-approved computer controls always take
  precedence. If browser access is blocked, DO NOT try alternate browser,
  shell, AppleScript, HTTP, CDP, or computer.act surfaces to evade a refusal.

## Implemented pure recovery planner

Module: stage2/project-chat-environment-plan.mjs
Tests: test/project-chat-environment-plan.test.mjs

Its output is only a proposed next action; no action is executed.

| Condition | Proposed next action |
|---|---|
| Unique exact Relay match | Reuse the already registered tab |
| Duplicate Relay match | Stop for identity review |
| Actual Chrome target exists, Relay missing | Diagnose the mismatch; do not duplicate |
| Fresh exact visual evidence, Relay missing | Diagnose mismatch; require ID verification |
| Window inventory incomplete | Observe remaining windows first |
| Chrome closed | Request approved launch, then verify |
| Chrome open, target verified absent | Request approved pinned-chat navigation |
| Policy denies browser control | Stop; never bypass |
| Contradictory evidence | Re-observe instead of acting |

This module is project-generic and uses route IDs from a caller. No
hard-coded Alice-only browser behavior is introduced.

## Verified environment facts, 2026-10-28

- Main Worker exact-project canary 141A succeeded after chat rebinding.
- New-chat mac-terminal grant verified by operator.
- Screenshot analysis 145B succeeded locally with gemma4:26b-a4b;
  historical snapshot showed AliceAI Chat and extension ON.
- Alice coordinator LaunchAgent status 146A showed running PID 3199.
- Local log sample 146C reported 343 relay_missing_target events,
  zero page_ready_or_idle, zero handshake_confirmed.
- These facts do not establish a functioning AliceAI Chat handshake.

## Not yet wired (requires separate supported runtime capability)

Read-only, appropriately authorized OS/window inventory; live attestation
of exact Chrome chat presence; approved action execution; bounded navigation
and verification; durable operation journal; independently confirmed AliceAI
ChatGPT handshake. A blocked browser surface must not be replaced with a
workaround through another interface.

AliceAI Minecraft code decisions still belong to the AliceAI ChatGPT Project
Chat, not to the OpenClaw workflow coordinator.
