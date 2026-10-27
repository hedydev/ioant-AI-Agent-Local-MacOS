# Mac Computer Use — non-interfering concurrent-operation design (2026-10-28)

## Operator expectation

The AI should work on the Mac like a Codex worker while the human continues
using the same computer. AI automation must not seize the shared mouse,
foreground focus or keyboard during unattended operation. A visible "agent
cursor" overlay does not create a second independent macOS hardware pointer.

## Official OpenClaw capabilities

- macOS provider setting: OpenClaw.app → Settings → This Mac → Capabilities.
- Peekaboo is the default; CUA is separately selected with a bundled app-owned
  driver and appropriate Accessibility / Screen Recording permissions.
- Both expose computer.act; provider support is action-specific, so passing
  get_cursor_position does not prove list_apps or background window actions.
- CUA advertises window/element input and background delivery, but desktop
  coordinate input remains a foreground desktop route. A background hint
  cannot magically isolate desktop clicks.
- Providers must not silently fall back per action. The caller must verify
  the provider descriptor, current generation, result and target state.
- A dedicated cloud/managed Linux desktop can offer a separate pointer and
  display; a Mac background window action is not that type of isolation.

Sources:
https://docs.openclaw.ai/nodes/computer-use
https://cua.ai/docs/cua-driver/reference/mcp-tools/pointer-cursor-and-browser

## Current established evidence

- 148B: Mac node native get_cursor_position returned observed (read-only).
- 149B: Mac node list_apps failed with native_call_rejected_or_unavailable.
  Failure reason was previously hidden. Latest changes classify a bounded
  native error family but require fresh deployment and execution.
- 149A: 613/613 tests passed in the prior deployed revision.
- No successful real background input has been independently observed.
- AliceAI ChatGPT browser/Relay mismatch remains unrelated and unresolved.

## Newly committed

- scripts/openclaw-computer-provider-readiness.mjs
  One read-only nodes status request. Output does not contain app names,
  windows, PIDs, node IDs, screenshots, ChatGPT content or credentials.
  If the explicit provider descriptor is unavailable, provider is unknown.
  A claimed descriptor never counts as actual background execution success.
- stage2/mac-computer-background-policy.mjs
  Pure no-execution gate that requires verified CUA, background delivery
  tested in reality, fresh generation/observation, window/element targets,
  specific action attestation, and user-authorized non-browser action.
  Never substitutes desktop scope or foreground delivery.
- New tests cover policy and provider status privacy/fail-closed behavior.
- scripts/openclaw-native-app-inventory-readonly.mjs was updated to preserve
  only safe native error class/code instead of dropping the failed call reason.

## Acceptance stages — not completed

1. Deploy pinned HEAD and pass complete unit regression.
2. Run provider-readiness audit; identify active provider if reported.
3. Run one newly classified read-only list_apps only if safe; do not loop.
4. If CUA background metadata actually exists, wire this guard to a
   narrowly scoped execution interface. Pure-policy unit tests alone do
   not enforce anything against arbitrary OpenClaw actions.
5. Test using a dedicated *non-browser* app/window, with explicit permission,
   and verify cursor positions and frontmost app before/after, interaction
   result, and zero accidental interruption. Do not use ChatGPT as a
   substitute test target.
6. If no background control can be proved, use a separate managed desktop
   or virtual machine, or require one-off foreground approval.

## Non-negotiable browser boundary

An earlier host browser tool explicitly refused ChatGPT UI access.
Do not use Computer Use, shell, AppleScript, CDP or another browser channel
to bypass this denial. Distinguish browser-control privileges from native
computer ability. The AliceAI Project Chat remains the owner of its own
project development and approvals.

## 2026-10-28 / Task 150B diagnosis correction

150B returned provider=unknown and list_apps exitCode=1, while a prior
native get_cursor_position request succeeded. The former inspector checked
legacy guessed paths (computer/computerControl) and did not parse the
official v2 node status field named computerUse.

Official descriptor structure: computerUse.contractVersion=2,
computerUse.provider.{id,label,generation}, computerUse.actions,
computerUse.deliveryModes, computerUse.features.agentCursor.

The updated inspector reads this explicit structure, checks generation and
contractVersion, normalizes only recognized provider identifiers and
exposes only bounded capability flags. It does not echo provider labels,
node identities, window titles, executable names, observation tokens or
browser/chat contents. The combined readiness tool now **skips list_apps**
unless the provider descriptor is valid, the provider family recognized,
and list_apps explicitly advertised. A missing capability is never
interpreted as permission to retry.

An advertised agentCursor is a software indicator, not a physical second
macOS mouse pointer or its own focus context. A truly independent pointer
and keyboard requires a separate desktop session/environment.

Sources:
- https://docs.openclaw.ai/nodes/computer-use
- https://app.unpkg.com/openclaw@2026.10.4/files/dist/computer-use-contract-g23cJXOi.mjs

No user-facing system configuration was modified; CUA was not selected,
Chrome was not opened or read, and no input was performed.
