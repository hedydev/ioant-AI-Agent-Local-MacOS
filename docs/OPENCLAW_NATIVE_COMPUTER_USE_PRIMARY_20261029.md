# OpenClaw App native Computer Use — authoritative project direction (2026-10-29)

> **Read this before planning any OpenClaw/Mac/ChatGPT/AliceAI automation.**
> This is the current product-direction and evidence index. Detailed operational
> safeguards live in [ALICE_CODEX_STYLE_BACKGROUND_COMPUTER_BRIDGE_20261029.md](./ALICE_CODEX_STYLE_BACKGROUND_COMPUTER_BRIDGE_20261029.md).
> Historical notes and diagnostic experiments do not supersede these rules.

## 1. User-approved primary goal and routing order

The operator's **primary goal** is for the **installed OpenClaw.app and its
already-paired native macOS node** to control the Mac through **native
Computer Use**, coordinated with this ChatGPT Ops Project and independently
with the AliceAI Project. This is not a Chrome extension installation project.

Preferred path:

1. **OpenClaw.app → paired Mac node → native CUA v2 `computer.act`**,
   including exact window/element observations and narrowly scoped
   `deliveryMode:"background"` element actions where truly supported.
2. Reuse the existing **ChatGPT Ops Worker** as project transport, command
   executor and test/evidence carrier; use the separate **Alice Coordinator**
   as the only Alice Chat message writer. Local Agents can analyze/code/test
   without claiming owner acceptance.
3. Consider browser extension/Relay/Chrome MCP only as **separate optional
   paths** if the operator explicitly changes the goal or a well-proven
   non-invasive dependency actually requires them. They must NOT displace
   the native Computer Use work plan.

**Do not suggest reinstalling OpenClaw, re-installing the Chrome extension,
re-enabling Debug Browser, broadening TCC/FDA, or repeating the same browser
diagnostic merely because a CLI cannot discover the extension.** First
reconcile what is user-observed versus CLI-observed and explain why it is
material to the native CUA task.

The operator expressly permits local AI to execute Mac terminal and desktop
actions with the relevant existing/user-approved capability grants. Do not
misrepresent that as a ban on computer control; conversely, an Ops terminal
grant is not a browser consent grant, a different Chat's grant or an
unrestricted Alice Chat send authorization.

## 2. Current verified state — distinguish evidence sources

- **Mac/App**: Mac M1 Pro, 32 GB; OpenClaw 2026.10.7; paired Mac native
  node has advertised `screen.snapshot` and `computer.act`; CUA provider
  `cua-computer`, contract v2 and background action descriptors were
  observed in the prior accepted native probes.
- **Native non-browser action**: 205C-48 **real** disposable AppKit fixture
  `set_value(deliveryMode:"background")` succeeded with fresh native
  readback and no observed foreground/pointer interference. This is not a
  general-purpose browser ChatGPT write proof.
- **Execution ownership**: 205C-67 one self-owned native CUA lease-cycle
  challenge succeeded (first admitted, overlap busy, own close acknowledged,
  next admitted, close acknowledged, stable provider generation). This does
  **not** mean every external execution owner is released or host is always
  idle. Fresh checks still apply.
- **Native Alice window/AX**: OS-attested exact AliceAI Chrome tab/window
  exists. Native AX observations found 3 editable candidates; one likely
  prompt `text_area`, but its value sometimes equals its label and neither
  truly empty draft nor unique Send action was verified. At 205C-73 the
  exact Alice tab was **not active within its Chrome window**; native
  foreground AX data therefore could not confirm its composer. **No
  verified Alice Chat message has been sent through CUA.**
- **Workers**: the main Ops Worker was actually rebound to Chat
  `6ae25a0b-9b38-83ec-b2df-9db1f40f9488`; exact-Chat
  `project-head` canary succeeded. Old terminal grant was revoked,
  new-chat `mac-terminal` permission explicitly enabled. The separate
  Alice Coordinator is bound to Alice Chat
  `6ade11a5-f0c0-83ec-add1-8a0cff00c938`; handshake
  `alice-coordinator-verify-20261027-103` was only `requested`.
  Do NOT repeat or convert it to a receipt without actual confirmation.
- **User-confirmed Chrome UI state (2026-10-29)**: Chrome extension is
  **already installed** and **OpenClaw Debug Browser is enabled**. This
  is operator-observed state; do not ignore it.
- **Conflicting CLI state (2026-10-29)**: `browser extension setup
  --action inspect --json` reported `extension_missing` and
  `installedProfiles:0` (0515), while native host registration is
  `owned` and one automatic External Extensions install request failed
  `EPERM` (0513). These are **profile discovery / permission results**,
  NOT proof that the user-observed extension is absent or native CUA
  unusable. No further extension installation loops without a specific
  operator request.
- **Chrome MCP**: independent bundled Node open/close test of
  `DevToolsActivePort` failed `EPERM` (0505, 0507, 0508) despite
  POSIX/ACL metadata allowing read; short tccd logs contained a
  denial-classified event but no dependable responsible identifier. It is
  an unresolved **alternate Chrome MCP transport issue**, not a native
  Computer Use blocker or authority to change macOS privacy settings.
- **Source vs runtime**: most recent accepted Mac protected update before
  this document: GitHub/runtime `d66f0fdc9e5f47ef3406c113455ed58dbd2c8839`,
  1111/1111 tests. A new docs commit is GitHub-only until a real
  `project-update-verify` receipt proves runtime synchronization.

## 3. Canonical architecture and ownership

```text
This ChatGPT AI-OpenClaw Ops Chat
  ↔ exact-bound main Ops Worker (transport + approved Mac terminal / checks)
  ↔ OpenClaw Gateway ↔ paired native Mac node (CUA v2 computer.act)
      ↔ OS-attested exact Mac window / fresh AX element observations
      ↔ optional explicitly authorized background window-element operation

Separate AliceAI ChatGPT Project (Alice project owner)
  ↔ existing Alice Coordinator (only Alice Chat writer)
  ↔ independently authorized CUA background adapter (not yet shipped)
  ↔ local AliceAI analysis/coding/testing Agents
  ↔ actual Alice Chat receipt / user approval / project DAG acceptance
```

The Ops Worker may develop and test the bridge but **must not become a
second writer of AliceAI Chat**. The Alice requirements DAG remained
revision 24, verification pending, not accepted. Model output, a CUA
ACK, a screenshot or a test fixture's success cannot approve that DAG.

## 4. What to implement next — native CUA, not Chrome setup

1. **Read-only acceptance first:** verify current paired Mac node,
   exact `cua-computer` provider generation, advertised native
   actions and the installed App's Computer Use capability state.
   Reuse existing scripts and receipts; do not unnecessarily replay
   successful fixture tests or restart services.
2. **Exact OS window identity + AX semantics:** reuse
   `scripts/alice-native-computer-window-readonly.mjs`,
   `scripts/alice-native-ax-semantic-readiness.mjs`, and relevant
   `stage2/alice-background-computer-handoff.mjs` planning gates.
   Improve private **native semantic identification** of the exact
   Alice chat composer, whether a draft exists, and a unique send
   action. Reconcile the last-known **inactive background tab**; a
   generic AX snapshot of another active tab is not proof. Do not
   switch the tab or activate Chrome without a separately approved
   foreground action.
3. **Safe execution ownership:** independently verify a fresh
   execution owner and provider generation; preserve execution-scoped
   `windowRef`, `observationId`, `elementRef`, no stale reuse.
   Never close another actor's lease or assume a close ACK proves
   global owner release.
4. **True concurrent background behavior:** require native
   `deliveryMode:"background"`, specific element target,
   authorization, noninterference proof and no unexpected cursor,
   keyboard, application activation or foreground fallback. The
   fixture passed **once**; Chrome background operation remains
   unverified and must be checked safely before chat mutation.
5. **Exactly one authorized Chat message:** only when the separate
   Alice owner authorizes the specific message, the Coordinator holds
   the sole-writer lease, draft emptiness and unique composer/send
   target are proven, and durable `press_intent` is written first.
   One operation only, then fresh user-role exact-chat receipt;
   uncertainty means freeze/reconcile, not automatic retry.
6. **Project acceptance:** downstream AliceAI development acceptance
   occurs in the separate Alice owner Chat and ledger, never from
   the Ops Chat or local model alone.

The immediate coding deliverable, if the remaining proofs fail, is a
**tested, bounded read-only native AX/ownership readiness improvement**,
not a new Chrome extension installer or a TCC workaround.

## 5. Operational rules for every subsequent AI in this Project

- Read this document, `AGENTS.md`,
  `docs/ALICE_CODEX_STYLE_BACKGROUND_COMPUTER_BRIDGE_20261029.md`,
  and `docs/OPENCLAW_ALICE_CURRENT_HANDOFF_20261029_205C78.md`
  before planning new desktop/browser work.
- Label each claim **user-confirmed**, **Mac receipt verified**,
  **source-only**, or **not yet proven**. Never convert a missing CLI
  discovery response into a claim that an operator-confirmed extension
  was not installed.
- **No install/reinstall loop, TCC reset, Full Disk Access change,
  Chrome takeover, raw CDP/DOM/AppleScript browser bypass, random
  browser profile change or service restart** as a shortcut to native
  Computer Use. A separately justified task may be authorized later.
- Native macOS Computer Use is the principal path; keep user desktop
  usable. Never move the global mouse/focus or type into an unrelated
  app as a fallback for failed background delivery.
- **Script First:** meaningful changes in reviewed `scripts/` or
  `stage2/` with tests, safe Git commit, `project-update-verify`
  full Mac regression, and a unique short Worker task. Do not paste
  large `node -e` scripts, silently expand scopes, or overinterpret
  zero exit codes.
- Separate Ops and Alice Chat boundaries, durable task IDs, pending
  sends and user-controlled authorization. Preserve all unrelated
  programs and Minecraft worlds.
- For permission/extension symptoms already investigated, consult
  `docs/OPENCLAW_REBIND_AND_CHROME_PASSIVE_20261029.md`; do not
  restart the diagnosis unless a new requirement makes it blocking.

## 6. Success criteria

**Not complete** until an independently attested exact Alice Chat window,
unique actual composer and send action, verified empty draft, current
CUA background capability and execution lease, exclusive Coordinator
write intent, and actual matching ChatGPT user-role message receipt
are observed without desktop interference. Until then report
`native_cua_partial_acceptance / alice_chat_delivery_unverified`.

Historical detail:
- [Native fixture and safety evidence](./MAC_CUA_NATIVE_OBSERVATION_20261028.md)
- [Noninterference contract](./MAC_COMPUTER_NONINTERFERENCE_20261028.md)
- [Background bridge design](./ALICE_CODEX_STYLE_BACKGROUND_COMPUTER_BRIDGE_20261029.md)
- [Current Alice handoff](./OPENCLAW_ALICE_CURRENT_HANDOFF_20261029_205C78.md)
- [Chrome MCP/TCC detour evidence](./OPENCLAW_REBIND_AND_CHROME_PASSIVE_20261029.md)

## 2026-10-29 Stage C implementation — exact background tab / CUA read gate (candidate)

After the 0515 CLI extension installation loop was explicitly deemed **out of scope**,
the native Mac task was resumed from the accepted 205C-48 fixture background
write and 205C-67 execution-lease transition.

New candidate `scripts/alice-native-stage-c-preflight.mjs` provides a single,
read-only Stage C check on the **existing installed Mac runtime**:
- Use the existing, verified OS Chrome URL/title metadata-only probe for
  the exact AliceAI Project + Chat (never inspect page DOM or tab content).
- Verify the paired native `cua-computer` v2 node and *advertised*
  `list_windows` / `get_window_state` plus background `set_value`
  capability metadata. A single provider status snapshot does **not** prove
  generation stability, own execution release, or actual input authorization.
- If Alice tab is **not selected within its own Chrome window**, return
  `blocked / select_alice_tab_in_own_window` WITHOUT calling
  `computer.act`. This is not an instruction to bring Chrome to the
  foreground, click, switch tabs programmatically or override another tab's
  composer. The owner may choose manually to leave Alice selected in a
  separate background Chrome window; no automatic change is permitted.
- Only when exact Alice tab is selected and native CUA read commands
  advertised, return `ready_for_native_ax_readonly`, which authorizes
  **zero** writes. The next separate, user-approved read-only action is
  the already implemented `scripts/alice-native-computer-window-readonly.mjs`.
- Output only fixed flags, enums and counts; no ChatGPT messages, Chrome
  URLs/titles, node IDs, opaque CUA refs, snapshots or local user content.

Added six mocked regression tests of active/inactive tabs, wrong targets,
CUA capability availability, failures and privacy. This candidate is **not
Mac-deployed or accepted** until the protected `project-update-verify`
returns full 0-failure test evidence. A successful test is still not a
live Computer Use send or desktop background-write proof. Do not repeat
Alice Coordinator's previously requested single-use handshake.

## 2026-10-29 0518 Mac live Stage C receipt: exact tab is inactive

Live Worker receipt `openclaw-native-cua-stage-c-live-20261029-0518`:
`Status: passed`, script returned
`audit=IOANT_ALICE_NATIVE_STAGE_C_PREFLIGHT`,
`state=blocked`,
`reason=alice_tab_inactive_in_own_chrome_window`,
`nextGate=select_alice_tab_in_own_window`,
`aliceTabActive=false`,
`providerReadAdvertised=true`,
`backgroundSetValueAdvertised=true`,
`computerActInvoked=false`, `tabSwitched=false`, `desktopInput=false`,
`chatMessageSent=false`.

This is **a successful fail-closed diagnosis**: the native CUA v2
capability descriptors are present, and the exact Alice Project Chat tab
is OS-attested, but it is **not the selected tab in its Chrome window**.
AX on the current Chrome window would describe a different page; it
cannot prove the inactive Alice draft is empty, a composer identity, or
a unique send action. Do not run native AX composer identification or
send/press while this gate is blocked.

Operator-controlled one-time arrangement: move the existing Alice tab
to its own Chrome window using normal Chrome UI, leaving Alice selected
**within that dedicated window**. That window may be behind another app
or Chrome window; no need to keep it frontmost. This is an optional
human-performed layout change, **not authority for the Worker to
activate a tab, open a duplicate chat, take focus, or inject browser
automation**. Keep existing Coordinator pending handshake unchanged.

After the operator has arranged the window, re-run the existing
`scripts/alice-native-stage-c-preflight.mjs` as a **new unique-ID**
read-only task. Only a new live `ready_for_native_ax_readonly` permits
the separate existing `scripts/alice-native-computer-window-readonly.mjs`
read-only native AX diagnostic. No success or chat-delivery claims
until the actual receipt exists. Do not reinstall extensions or
revisit Chrome MCP/TCC as a substitute.

## 2026-10-29 operator decision: Codex-style dedicated AliceAI browser with manual login

**Operator's explicit decision:** do not depend on active tabs of daily Chrome.
OpenClaw should own a separate, persistent **`alice-ai` managed browser profile
and visible window**. The operator will personally sign into ChatGPT in
**that new window when needed**; this is acceptable and preferred. No login
credentials, Chrome cookies, Keychain contents, existing daily browser
profile data or session tokens may be copied, read or printed by Worker,
Agent, or docs. Login completion remains user-observed until a separate
scoped verification; do not claim the login is already done.

Official OpenClaw supported mechanisms:
- `openclaw browser create-profile --name alice-ai` creates a named managed
  browser profile (subject to version and collision checks), isolated from
  `user`, `chrome`, and the default `openclaw` profile.
- Local managed browser profiles default to **headless**, so the user-login
  window requires explicit `browser.profiles.alice-ai.headless=false`
  or a verified equivalent. Do **not** change the global default profile
  or make all existing OpenClaw browsers headed.
- OpenClaw's managed Browser routes tab/page operations; OpenClaw.app's
  paired native `cua-computer` v2 routes desktop/native window operations.
  These are **distinct tools**. Do not treat successful managed-browser
  launch as proof that `computer.act` can target that browser. A fresh,
  independent native window/identity/capability check is required before
  any native CUA action.
- Native CUA `browser_prepare` requires a discovered `windowRef` and
  remains subject to existing consent. It is **not** a shortcut to creating
  a standalone profile or bypassing `browser_consent_required`.
- The existing Alice Coordinator's fixed Chat binding and one-writer
  handshake remain unchanged. Switching its delivery transport requires
  a separately tested adapter, durable write intent, exact-chat matching
  user-role receipt, and per-project authorization.

### Implementation gates

**Stage D1 (this candidate):** new
`scripts/alice-managed-browser-preflight.mjs` with inspect-only mode.
It asks the existing OpenClaw CLI for the registered profile catalog and
the exact `alice-ai` profile status *only if* that profile is already
registered as managed. The output contains only fixed enums/booleans.
No browser start, tab read, page open, config change, credential import,
native CUA call, or message send. Mocked tests cover missing profiles,
incompatible collisions, headless and stopped modes, and privacy.

**Stage D2 (after a real D1 Mac receipt):** safely provision only a missing
named `alice-ai` managed profile and **visible** browser mode; preserve
existing profiles and config. First inspect the current config/CLI and
whether a targeted headed setting requires a Gateway reload. No blanket
Gateway restart or service/user browser disruption. Open only the exact
AliceAI Chat URL in that isolated window. User then logs in manually.

**Stage D3:** after user login, verify exact Project/Chat identity within
the isolated managed browser using a **scoped profile and unique tab**,
with no message reading or writing beyond what is specifically approved.
Do not expose private login/session data or assume an AppleScript probe
of daily Chrome correctly describes the managed browser process.

**Stage D4:** implement a sole-writer Alice Coordinator adapter for the
isolated browser only after trusted Chat owner approval, durable
`press_intent`, no-existing-draft proof and independent receipt. Keep
Native CUA as the Mac desktop control path, and use managed Browser where
it is the correct independent web-control surface. No unapproved
fallback to foreground/global input.

References: https://docs.openclaw.ai/tools/browser/profiles ,
https://docs.openclaw.ai/tools/browser-login ,
https://docs.openclaw.ai/tools/browser/configuration ,
https://docs.openclaw.ai/nodes/computer-use .

Source candidate and docs commit are **not a Mac deployment**; require
`project-update-verify` and a real exact Worker receipt first.
