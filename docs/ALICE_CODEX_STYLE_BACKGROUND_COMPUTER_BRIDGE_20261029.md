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

## 205C-45 live acceptance and write-boundary correction (2026-10-29)

The operator's real Mac task `openclaw-alice-native-background-fixture-acceptance-20261029-205c45` **failed closed before any write**. CUA node connected, provider contract v2 accepted, `background` delivery and `set_value` advertised, driver process visible. The independently owned disposable AppKit window was found. Launch-phase `frontmostUnchanged=true,pointerUnchanged=true`; after multi-second read-only `get_window_state` the foreground remained unchanged but the pointer position differed. Result: `state=blocked`, `reason=foreground_or_pointer_changed`, `interferenceStage=post_native_read`, `mutatingActionAttempted=false`. The own execution close ACK was true, **not** an independent owner-release proof.

**Root cause in our test harness:** the post-read comparison used the snapshot taken *before launching the fixture*, conflating ordinary user cursor activity while OpenClaw was doing read-only observation with computer input interference. There is no evidence that CUA itself moved the pointer, no `set_value` call, and no background delivery acceptance in this receipt. Do not label the CUA provider broken or infer background writes are safe.

Code correction (candidate, not yet Mac-deployed):
- In the *write-enabled fixture-only challenge*, retain the independent window PID/title, original field value, provider generation, unique native refs and nonforeground launch gates; report prewrite failure if any identity/capability check fails.
- Treat pointer or frontmost movement during the long **read-only observation** as telemetry, not as proof of a CUA write. Immediately before the **single** allowed fixture `set_value(deliveryMode:"background")`, reverify fixture ownership, process life and provider generation. Take **two adjacent fresh** cursor/frontmost snapshots. If either differs, fail closed before sending input.
- Keep the last immediate snapshot private as the write-boundary baseline. After exactly one mutation and independent value readback, compare the frontmost and cursor with this baseline. A user mouse motion during the mutation/readback is **inconclusive** and NEVER a successful noninterference proof; never retry the write automatically.
- Do not expose raw cursor coordinates, foreground app ID, element refs, user content, or private app details. The public prewrite report still contains only fixed boolean predicates.
- Do not relax the fixture's one-shot uniqueness, fresh observation, owner proof, no Chrome/ChatGPT, no foreground input, and hard-stop behavior.

This improves acceptance signal under normal Mac activity without falsely proving that a provider-induced mouse movement can be distinguished from user movement. A genuinely concurrent pointer movement within the write interval remains inconclusive. For fully unattended/active-user operation an independent provenance audit or stronger native noninterference attestation would be needed before granting general ChatGPT background mutation.

The actual AliceAI Chat `requirements` ledger stays revision 24 and unapproved, and its exact-chat browser CUA consent barrier is not altered by these fixture changes. No Coordinator restart, chat message or task acceptance is authorized. Prior deployed runtime HEAD: `a764159f2aa4161da422f3f7555d752ae358930e`, 1065/1065 tests passed. Two new fixture tests are proposed; guarded deploy should verify **1067** total tests. A passing unit suite is not live background-write proof.

## 205C-46 safe-update gate failure (2026-10-29)

The Mac Worker declined the candidate `project-update-verify`:
`state=blocked`, `reason=candidate_tests_failed`, `tests=1067`,
`pass=1066`, `fail=1`, with no failing location disclosed.
**The runtime was not advanced.** This is exactly the behavior the safe
update gate is intended to enforce; never bypass it.

Source inspection found a stale test in
`test/openclaw-cua-fixture-background-write.test.mjs` named
`foreground/pointer changed => no write or read`. It injected a constant
new foreground app in every `readState` sample, so the new two-adjacent-
sample boundary was **stable** and correctly permitted the one fixture-only
write; the old assertion expected that a change relative to the original
pre-launch baseline would still block. Its test inputs, rather than the
new boundary rules, were outdated.

The test now feeds **different foreground apps into the two immediate
prewrite samples**. It still asserts `writeIssued=false`, the
`frontmostUnchanged=false` failure signal, and zero calls/intent marks.
The separate pointer movement test also enforces a mutation block for
unstable adjacent cursor samples. Existing long-read user-activity test
allows a stable *new* foreground at the immediate write boundary, but
still checks post-write noninterference and single execution.

This is a targeted candidate test correction, not a relaxation of the
new guard. The exact failing test name is inferred from the code diff;
because the Mac receipt deliberately suppressed test locations, it is
**not proven** until the next guarded 1067-test deploy passes.
Do not invoke the live AppKit write until the entire suite passes.

## 205C-48 real native background fixture success (2026-10-29)

The user's Mac result `openclaw-alice-native-background-write-retest-20261029-205c48` passed in 12,417 ms with `state=observed` and `reason=fixture_background_write_verified`. It exercised one real CUA `set_value` with `deliveryMode=background` against the independently OS-attested ephemeral AppKit fixture, and the **fresh native readback matched** its nonce-tagged test value. Unique window/element, independent OS PID, fixture still owned, stable generation, noninterference preflight, and postread frontmost/cursor all were true. No Chrome/browser access, screenshots, or user-facing pointer/keyboard input. This is a real capability proof on this particular fixture at this particular time, not proof that arbitrary controls or occluded Chrome can be safely written.

The execution close attempt was acknowledged but `ownerReleaseVerified=false` and `existingComputerOwnerReleased=false`. These are UNKNOWN/UNPROVEN assertions, not proof of a leak and not permission to clear someone else's owner. The `fixtureBackgroundProven` gate in `stage2/alice-background-computer-handoff.mjs` still requires an independent own execution closure proof; do not silently coerce the ACK into that proof. Never perform another mutating Computer action until ownership/current execution is independently established.

Next candidate: `scripts/alice-native-ax-semantic-readiness.mjs`, a pure privacy-bounded native accessibility classifier, attached only to the previously OS-verified AliceAI Chat Chrome window, with active-tab identity rechecked *after* the window observation. It reports per editable element only role kind, boolean prompt/search hints and bounded associated send-button structural signals, not input values, ChatGPT history, labels, coordinates, refs or raw AX trees. It always reports `composerIdentityVerified=false` and `chatDeliveryAuthorized=false`; a prompt hint and a nearby/send-named button do not establish owner identity or a correct write target. This uses no Browser Relay, screenshot, click, foreground input or browser DOM. The already deployed 205C-43 AX observation yielded three editables and zero exact-label prompt hints. This new classifier may still return no unique semantic candidate; that is a valid inconclusive result. Do not guess coordinates or hardcode the second candidate.

Prior successful deployed source `8865048dbd3fd1a7233347424ea3cbe48490b953`: 1067/1067 tests passed. This source candidate adds four semantic-classifier unit tests and should reach **1071**, subject to protected deployment validation. Do not restart the existing Coordinator, replay handshake, accept requirements ledger, or send a ChatGPT message in this phase.

## 205C-51 real compact composer evidence (2026-10-29)

The real Mac compact replay reported `state=native_window_observed`, `aliceTabActive=true`, `identityRechecked=true`, with **three** editables and `uniquePromptHint=true`:
- candidate #1: `text_field`, `prompt=false`, `search=true`, no parent/ancestors/send linkage;
- candidate #2: `text_area`, `prompt=true`, `search=false`, no parent/ancestors/send linkage;
- candidate #3: `text_field`, `prompt=false`, `search=false`, no parent/ancestors/send linkage;
- `sendButtonCount=0` among named Send buttons.

Thus a single likely composer has emerged, but `composerIdentityVerified=false` and `chatDeliveryAuthorized=false` remain correct. No evidence has yet established a connected send button, that a native `set_value` will dispatch React input events, or that Chrome element background writes work as safely as on the disposable AppKit fixture. No chat input or send was attempted.

Next purely read-only refinement: emit which **AX property name** provided candidate #2's prompt signal (e.g. `identifier` vs `placeholder`), a boolean for an exact known composer identifier, and bounded counts for unnamed icon-only buttons, buttons with bounds, broader native send/submit identifiers, and button geometry close to the editor. Raw labels, values, coordinates, refs, and untrusted page text stay private. Geometry is only supporting diagnostic evidence, NEVER a click target or proof of a send control. A named send button may not exist while the compose box is empty; do not infer that it does. The code does not change `composerIdentityVerified` or trigger any `computer.act` mutation.

This is a source candidate adding three new tests to the 1071-test deployed runtime; expected total **1074** after protected `project-update-verify`. Exact-chat sole-writer permission, independent native execution ownership release, unique send control, and actual chat receipt gates are still outstanding. No Coordinator restart, browser consent escalation, screenshots or DOM fallback.


## Latest verified follow-up: 205C-78 (supersedes 205C-51 pending-state guidance)

Read **[OPENCLAW_ALICE_CURRENT_HANDOFF_20261029_205C78.md](./OPENCLAW_ALICE_CURRENT_HANDOFF_20261029_205C78.md)** before attempting any further browser, Computer or ChatGPT Worker operation. Real Mac protected runtime update reached `8293034eb8b46f876b0a74e0624b13e9e90be156`, **1099/1099** tests; CUA own-lease state transition was verified in 205C-67, but ChatGPT message delivery still has **no** native proof. The Alice coordinator runs with its original handshake at `requested`. OS metadata confirmed the unique Alice chat **is a background Chrome tab**; active-window AX cannot prove its composer is empty. Chrome MCP `user`/`existing-session` is configured and running but `tabs` fails: last evidence (205C-78) shows Chrome 156 and a present `DevToolsActivePort` **unreadable by Mac Worker**. Do not claim TCC is conclusively responsible or alter privacy permissions without explicit approval. This follow-up includes safe **ChatGPT Ops Chat ↔ Worker rebinding** requirements; no rebinding occurred by committing docs.
