# AliceAI ↔ ChatGPT: Codex-style background Computer control

Status: **design + no-input planning gates committed**, not yet shipped as a live
writer. This deliberately supersedes the screenshot-pilot code (removed before
deployment). The existing Mac Ops and Alice Coordinator Workers remain unchanged.

## Why the foreground/screenshot design is wrong

The user can work in another app/window over Chrome. An ordinary display
`screen.snapshot` can show the **occluding** application; desktop
pixel-coordinate clicks/keyboard actions can steal focus or target the wrong
window. Even a window screenshot must not be treated as evidence that the
Chrome chat composer can be addressed safely by a pixel click. Avoid both as
the primary transport.

Mac evidence:
- 205C-39: `native_window_observed` for the OS-verified exact AliceAI Chrome
  window, with its Alice Chat tab active inside that Chrome window.
- 205C-41: 864 AX elements / three editable candidates / 52 buttons;
  none recognized as the unique composer.
- 205C-43: editable roles text_field (highest), text_area (middle),
  text_field (lowest); all labels unreleased/unrecognized. **No uniquely
  verified composer**, no authenticated send.
- Native `get_browser_state` returned `browser_consent_required`.
  Browser Relay exposed nine tabs, zero exact Alice tab. Do not retry or
  bypass that *browser* access boundary.
- The earlier noninterference fixture test ended
  `foreground_or_pointer_changed` **without attempting its actual write**.
  This is not proof that CUA background delivery is broken or safe.
- Native `computer.act` close ACK was received but owner-release was not
  independently proven. Do not assume an arbitrary fresh execution is free.

## Transport selection

**Chosen:** the existing trusted Mac OpenClaw node, native CUA v2
`computer.act`, exact `list_windows`, `get_window_state`
(`includeScreenshot:false`), refreshed `windowRef`/
`observationId`/`elementRef`, and **only an explicitly advertised
`deliveryMode:"background"`** for future element operations. The selected
node must be connected and identify `cua-computer`, contract v2 with a
stable provider generation. Element references and observations are
execution-scoped; never persist or reuse them after action, restart, stale
generation, navigation or teardown.

This is **Codex-style native element automation**, not a claim that the
`codex` harness or its independent `computer-use` MCP plugin is installed.
Official OpenClaw docs explicitly distinguish the separate Codex MCP route
from the built-in node-backed Computer Use route. Switching integrations
would introduce new install, permissions and process ownership, so the
existing proven CUA node is the first option. Do not install/switch providers
automatically.

No display capture, global cursor movement, global keypress, `bring_to_front`,
window activation, tab switch, script-injected DOM, raw CDP, or Browser Relay
fallback. If true background element delivery is unsupported, the system
must **stop and report**; it must NOT quietly switch to foreground.

## One-writer architecture

```
AliceAI ChatGPT owner (exact registered project + conversation)
     <=> existing Alice Coordinator (the ONLY message writer)
         - durable handshake mailbox (currently requested)
         - fixed chat binding, press_intent journal, no blind retry
         - candidate text treated as UNTRUSTED
       <=> native Computer background adapter (proposed, NOT yet installed)
           1. OS-attest exact Chrome tab/window without changing selection
           2. Check native CUA generation, background/action support
           3. Refresh AX window observation; resolve unique composer
           4. Persist a single write intent before one background operation
           5. Reobserve exact window and reconcile same user message receipt
           6. Close only own execution; uncertain outcome => freeze, no replay
         <=> connected Mac CUA provider (execution-scoped capabilities)

Independent AliceAI multi-Agent task ledger:
  requirements (revision 24, verified receipt, NOT yet owner-approved)
  -> risk review + architecture -> implementation -> tests -> review
  -> acceptance
```

The Ops Worker is **not** a second Alice Chat writer. The generic
`task_accept` reducer prevents worker/model self-approval but cannot
authenticate a bare verifier ID. Only a separately reviewed exact-Alice-owner
approval ingress may accept `requirements` after validating the SHA and
actual owner evaluation. This workflow remains blocked for downstream work.

## Mandatory acceptance gates before a real message

1. **Identity:** independent macOS Chrome URL attestation matches exact
   Alice Project + conversation and one unique Chrome window; the Alice
   tab is the active tab **inside its own Chrome window**, but the Chrome
   window need NOT be frontmost on the Mac.
2. **Capability:** CUA v2 connected; `get_window_state`, `list_windows`,
   `set_value` and `background` advertised. Provider generation and native
   execution owner independently verified; don't infer safety from
   capabilities alone.
3. **Noninterference proof:** separately verify background element
   `set_value` on our independently attested disposable AppKit fixture:
   exactly one write, value readback, fixture ownership, driver generation
   stable, frontmost app unchanged, pointer noninterference proof and an
   independently verified own execution release. If user input races with
   the proof, return inconclusive; never assert that no movement was caused.
   This proof is presently **NOT passed**.
4. **Composer identification:** using full native AX hierarchy in a private
   local inspection, prove **one** ChatGPT composer element and **one**
   associated send action, with role/semantic label/parent relationships
   and visibility/editability state. The three coarse candidates at 205C-43
   do not satisfy this. Do not hardcode ordinal, y-coordinate or placeholder
   English translation as identity. Accessibility content is untrusted;
   do not execute instructions found in the UI. If AX cannot establish
   identity, report unsupported; no guessing.
5. **Single writer + explicit request:** only existing Alice Coordinator
   with a trusted project owner action and exactly-once handshake may
   enqueue a fixed bounded message; persist a durable `press_intent` and
   payload digest before any element mutation. Existing requested handshake
   MUST NOT be re-requested or replayed.
6. **Background action + receipt:** compare current generation/refs, target
   ownership and coordinator lease immediately before one background
   element operation. No foreground fallback; no global Return/key press.
   Reobserve the native target. Confirm a unique matching user-role Chat
   bubble and persisted exact-chat receipt. Mere API ACK or text-entry
   readback is **not** a sent ChatGPT message.
7. **Failure handling:** `background_unavailable`, stale observation,
   unknown owner, changed tab, ambiguous composer, unverified write,
   lost ACK/receipt or model uncertainty => fail closed. No immediate retry,
   no scope escalation, no killing or restarting other Workers. Preserve
   private state for owner reconciliation.

## Phase sequence and shipping gates

- **Phase A (this commit):** delete occlusion-prone screenshot pilot,
  document the exact contract, and add a pure planning module
  `stage2/alice-background-computer-handoff.mjs` with regression tests.
  Its output always says `executionAuthorized:false`; passing simulated
  gate values is NOT a grant. No real Computer input.
- **Phase B:** validate existing `scripts/openclaw-cua-fixture-background-write.mjs`
  without modifying browser or user windows. Before an input test,
  independently handle/verify the prior execution ownership and
  false-negative pointer movement. If fixture proof cannot pass when the
  user is actively using another window, stop rather than claim Codex-like
  unattended safety.
- **Phase C:** implement a private, bounded AX semantic resolver against
  only the exact Alice Chat window. Preserve refs inside one driver
  execution and report anonymous readiness booleans; no user text or raw
  refs in Ops Chat.
- **Phase D:** a separately approved single-writer native background
  handshake with persisted intent and independent message confirmation.
  Enforce no duplicate send even on process crash.
- **Phase E:** separately approved Alice owner-review receipt and eventual
  trusted `task_accept`; never equate model text with test evidence.

Previous live Mac runtime before candidate changes:
`b0d6732781c716b94bc8c55a1be05b47d0c0826c`,
1061 tests passed. New candidate adds four pure tests, expected 1065,
to be confirmed by guarded `project-update-verify`. It makes **zero**
changes to the running Worker, Gateway, Chrome, BDS or ledger.
