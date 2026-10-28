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

## 2026-10-29 0524 live: managed Alice browser started, navigation SSRF blocked

Mac Worker receipt `openclaw-alice-managed-browser-start-20261029-0524`
returned exit 1. The first chained `start` step reported
`browser [alice-ai] running: true`. The subsequent
`browser --browser-profile alice-ai open <exact Alice Chat URL>`
was **refused**:
`Navigation blocked: strict browser SSRF policy cannot be enforced while this browser profile is proxy-routed`.
The final chained `status` step did not execute because of `&&`.
**Do not label the entire managed-browser startup a failure or claim the
target page was opened or the user logged in.** The existing `alice-ai`
profile, CDP port 18801 and headed mode `headless:false` were previously
verified. There is no evidence of Coordinator, Gateway, Mac app, or daily
Chrome modification from this receipt.

Current OpenClaw documentation states:
- Browser navigation and browser launch are separate acceptance stages;
  navigation SSRF blocks may occur after a successful launch.
- Managed Chromium does **not** automatically inherit Gateway/provider
  `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY` as browser proxy routing.
  Explicit managed-browser Chrome proxy flags such as
  `--proxy-server=...` or `--proxy-pac-url=...` (often in
  `browser.extraArgs`) activate proxy routing. Under strict SSRF,
  routing the browser through an unverified proxy can hide its actual
  network destination from OpenClaw.
- **Do not set `browser.ssrfPolicy.dangerouslyAllowPrivateNetwork:true`
  as a shortcut**, turn off strict SSRF, reset browser profile, shut down
  ClashX Meta, or make broad Gateway/browser changes. With a managed
  proxy there may be legitimate network requirements; a safer targeted
  configuration must be evidenced and separately reviewed first.
- A non-proxied browser may not reach the desired host under the local
  network. Do not assume removing proxy flags restores ChatGPT access.
- Configuration of `browser.ssrfPolicy` can replace Browser control
  service, interrupt owned managed Chrome/tabs. Do not mutate it without
  a reviewed rollback/impact plan.
- A browser-only proxy routing error does **not** demonstrate failure
  of native CUA v2 `computer.act`, and must not redirect the work back to
  Chrome extension installation or TCC.

New **read-only** candidate:
`scripts/alice-browser-proxy-cause-readonly.mjs` inspects only
sanitized effective `config get browser --json`, exact
`alice-ai` status and, if owner CDP port 18801 is corroborated,
the related Chromium process command-line **in memory only**.
It publishes booleans/enums for proxy flags and SSRF opt-in state,
never endpoints, paths, cookie/credentials, raw process arguments or
config. Added nine mocked tests. It does not start/stop/navigate the
browser, modify profile or security policy, or invoke native CUA.
A result lacking explicit flag attribution is **inconclusive**, not
authority to modify proxies or security settings.

Protected `project-update-verify` and **real live Mac receipt** are
required before making a targeted network decision. The separate Alice
Coordinator and exactly-once requested handshake remain unchanged.

Official references:
- https://docs.openclaw.ai/tools/browser/configuration
- https://docs.openclaw.ai/tools/browser/troubleshooting
- https://docs.openclaw.ai/gateway/security/browser-control

## 2026-10-29 0527 live: direct-network probe did not establish connectivity

The exact Worker receipt `openclaw-alice-direct-egress-probe-20261029-0527`
ran a one-time `curl` to `https://chatgpt.com/` with proxy
environment variables removed and `--noproxy '*'`, `--proxy ''`.
It returned `curlExit=28` (timeout), `httpCode=000`, and
`httpResponseReceived=false` in 6029 ms. The probe did not change
browser config or SSRF. This is **not** proof that *all possible*
direct-network paths are unavailable; it only demonstrates that the
specific non-proxied probe did not obtain an HTTP response. Do not
remove `browser.extraArgs` and assume ChatGPT will become reachable.

Read-only 0526 also confirmed `globalExplicitProxyFlag=true`,
`processExplicitProxyFlag=true`, `profileExplicitProxyFlag=false`,
`privateNetworkSSRFOptIn=unset`, headed `alice-ai` process running,
and CDP ready. The browser refused navigation in 0524 under strict
SSRF, as documented at
https://docs.openclaw.ai/tools/browser/configuration .
The official strict browser policy rejects explicit Chrome proxy
routing by design unless more permissive access is intentionally
chosen. Do not enable `dangerouslyAllowPrivateNetwork` just to
bypass this refusal. `allowedHostnames` does not independently
prove an explicit proxy can enforce destination binding, and a generic
forward proxy is not automatically a strict SSRF security boundary.

Next gate: **read-only** inspection of system proxy configuration,
default IPv4 egress interface, and scoped TUN/network-route
availability. Do not output proxy hosts/ports, secrets, DNS answers,
or Chrome contents. A `utun` interface alone does not prove a
ClashX Meta TUN path; Tailscale and other system services also use
`utun`. Before any TUN/network-mode change, inspect the expected
impact on existing Tailscale routes, local endpoints, daily Chrome,
Gateway and other managed browser profiles and prepare rollback.
A transparent, owner-side egress mechanism may let Chrome omit
`--proxy-server` while retaining OpenClaw URL/DNS SSRF checks,
but **must be validated** for policy enforcement, DNS rebinding and
routing; do not claim transparency automatically implies SSRF
safety.

Separate user-approved outcome remains a persistent headed `alice-ai`
profile with **operator-performed manual ChatGPT sign-in**. No user
login has yet been observed, and the Coordinator/Chat handshake
remains untouched.

## 2026-10-29 0528 Mac network routing receipt

`openclaw-alice-system-routing-readonly-20261029-0528` succeeded
in 67ms: `httpSystemProxyEnabled=true`,
`httpsSystemProxyEnabled=true`,
`socksSystemProxyEnabled=true`, `pacEnabled=false`,
`autoDiscoveryEnabled=false`, `ipv4RouteInterfaceClass=physical`,
`utunInterfaceCount=6`, `clashTunOwnershipVerified=false`.
The output was read-only and secret-free. Do **not** infer that TUN
is enabled or disabled from the physical default route or number of
`utun` adapters. On macOS, Tailscale and multiple unrelated VPN
and Network Extension services may create `utun` interfaces.
The next gate is to identify whether the **actual ClashX Meta app**
supports/enables TUN and whether its active Mihomo routing and DNS
configuration is effective. Do not capture or print proxy nodes,
subscription URLs or credentials.

Public upstream references:
- https://github.com/MetaCubeX/ClashX.Meta/issues/213 documents a
  reported UI/privileged-helper TUN mismatch in v1.4.43, so a
  preference bit alone is not live network-path proof.
- https://docs.openclaw.ai/tools/browser/configuration explains that
  globally explicit `browser.extraArgs` proxy routing is blocked
  under strict SSRF, and that full egress control requires owner-side
  isolation or a policy-enforcing proxy.

Do not switch ClashX Meta TUN, global System Proxy or Gateway
browser flags yet. **Transparent forwarding is not itself an SSRF
security guarantee**. Any planned transition needs both:
(1) a demonstrated browser route to ChatGPT while strict SSRF
remains enabled, and (2) documented containment/rollback for daily
Chrome, Tailscale, Gateway, other managed browser profiles and DNS.
Do not simply remove `--proxy-server` while macOS System Proxy
remains enabled and declare SSRF enforcement restored.

## 2026-10-29 0529 live: ClashX Meta TUN override is not TUN-enabled proof

The exact receipt `openclaw-alice-clash-tun-readonly-20261029-0529`
reported `clashProcessPresent=true`,
`mihomoProcessPresent=false` (process-name scan only),
`tailscaleProcessPresent=true`,
`clashAppBundleCount=1`,
`tunPreferenceKeysFound=["tunOverridden"]`,
`tunOverriddenFlagOn=true`,
`splitDefaultRoutePresent=false`,
`fakeIpRoutePresent=false`, and
`liveClashTunOwnershipVerified=false`.
No settings changed or secrets emitted.

**Important correction:** `tunOverridden=true` means explicit user
override/intent has been recorded; it does **not** mean the active
Mihomo `tun.enable` is true, a privileged helper installed routes,
DNS hijacking occurred, or that any one of six observed `utun`
interfaces is owned by ClashX Meta. A process-name-only negative for
`mihomo` does not prove the core is stopped. See the upstream
ClashX Meta v1.4.43 report
https://github.com/MetaCubeX/ClashX.Meta/issues/213 and investigate
the exact `restoreTunProxy`/effective-state distinction before a
network change. The upstream issue is a general behavior reference,
**not** proof that this host has the reported migration defect.

Immediate next gate is **read-only**, fixed-field collection of:
the app bundle's known TUN-enabled preference keys (without exporting
the rest of preferences), public vs Tailscale vs LAN vs fake-IP route
interface classes, and whether managed DNS contains 198.18/15 fake IP
addresses. A TUN preference and route alone still do not independently
prove actual ownership or safe transparent forwarding. Do not toggle
TUN or change system proxy, Browser global flags, Gateway, Tailscale,
Network Extension or firewall at this gate.

The goal remains owner-controlled manual ChatGPT login in an
OpenClaw-owned visible `alice-ai` managed browser, with independently
validated browser SSRF safety. The 0524 managed browser is running,
but the exact Alice Chat URL has **not** been navigated by OpenClaw
and no login was verified.

## 2026-10-29 0530: route findings and independent managed-browser CUA handoff

The live 0530 read-only receipt found public/fake-IP route class physical,
Tailscale DNS class utun and Mint LAN class physical. TUN ownership was
not verified. The reported 'tunOverridden=absent' conflicts with the
0529 read-only finding of 'tunOverridden=true'; no changes were
made. These observations do not authorize changing ClashX Meta,
macOS system proxy, Tailscale, OpenClaw global browser flags or
browser SSRF policy.

Priority returns to the operator-approved dedicated headed Alice
browser and paired native Mac Computer Use v2. The dedicated browser
was started in 0524, but browser navigation to the exact AliceAI
Project Chat remains policy-blocked by explicit proxy routing.
The operator may personally open the target URL and sign in within
the dedicated browser; that is not evidence of agent navigation
authorization. User authentication state must not be extracted.

Candidate stage E1 introduces a separate read-only
'scripts/alice-managed-native-readiness.mjs'. It checks the named
managed browser's actual status, counts exact registered Alice Project
Chat tabs only within that isolated profile, then reads paired native
CUA provider capability metadata. It emits only finite status labels
and booleans. It does not invoke native computer actions or navigate.
Nine mock tests cover URL identity, tab ambiguity, profile validation
and native capability classification. A positive result is only
permission to perform a later, separately attested read-only
window/PID observation; it is not authorization to read or overwrite
an Alice draft or deliver a ChatGPT message.

Previous Chrome AppleScript Stage C probes target the operator's daily
Chrome and do not attest the new managed browser. Stage E2 must
independently match the managed browser process and its native window.
If native window inventory lacks a PID, fail closed pending independent
WindowServer ownership evidence. Preserve Alice Coordinator's
single-writer lease and pending exact-once handshake.

Reference: https://docs.openclaw.ai/tools/browser/configuration .

## 2026-10-29 0532 managed browser / native CUA live gate

The protected update `openclaw-alice-managed-native-readiness-deploy-20261029-0531`
installed `abf27e6c93b08eb460a095ce8b2ae33207b7e4ee`, with
`tests.total=1143`, `passed=1143`, `failed=0` and
`reloadRequired=true` (requested, not independent restart proof).

Then `openclaw-alice-managed-native-readiness-live-20261029-0532`
completed exit 0, emitting `state=await_operator_manual_navigation`,
`reason=dedicated_browser_does_not_yet_have_exact_chat`,
`exactChatTabMatches=0`, `browserOwnedAndReady=true`,
`headless=false`, `cdpReady=true`,
`tabActivationVerified=false`. It performed no navigation, browser-page
read, computer.act, content read, config/network/SSRF mutation, or chat send.

**Precise interpretation:** the isolated managed Chromium is ready,
but there is **no exact Alice Project Chat tab in that profile yet**.
No evidence of ChatGPT login or native window ownership. Do not infer
the operator is logged out merely from a missing chat tab.

Next is the operator-approved human-only step: open the registered
AliceAI Chat URL in the already-running **alice-ai dedicated browser
window**, sign in there if prompted, and leave that exact page open:
`https://chatgpt.com/g/g-p-6acaef839af081919426a885b3209f54-ai-mc-alice/c/6ade11a5-f0c0-83ec-add1-8a0cff00c938`.
This human navigation is not OpenClaw Browser automatic navigation.
The strict SSRF refusal for automated proxy-routed Browser navigation
remains unsolved and must not be bypassed by secretly issuing equivalent
computer-act navigation. No credentials or session cookies are to be
read, copied or emitted.

After that human step, run
`scripts/alice-managed-native-readiness.mjs` again with a new unique
Mac Worker task ID. Only `ready_for_native_window_observation`
allows the **separate read-only** E2 managed-process and native-window
owner attestation. Existing Alice Coordinator is still the sole chat
writer and has no delivery permission from these checks.

## 2026-10-29 0533: managed-browser chat tab still absent; inspect owned GUI window next

The Mac Worker receipt `openclaw-alice-managed-native-readiness-recheck-20261029-0533`
finished exit 0 in 5240ms with
`state=await_operator_manual_navigation`,
`reason=dedicated_browser_does_not_yet_have_exact_chat`,
`exactChatTabMatches=0`,
`browserOwnedAndReady=true`, `headless=false` and
`cdpReady=true`. No navigation, native computer invocation, screenshot,
chat content read, desktop input or message send. **This is not proof
that ChatGPT login failed**, only that the exact AliceAI project chat
is absent from the dedicated profile's tab inventory. Repeating the
same Stage E1 scan without a new action will not change the result.

The next independent admission check is **Stage E2a**:
`scripts/alice-managed-window-owner-readonly.mjs`. It checks the
already-running `alice-ai` managed Chromium `status.pid`
alongside local macOS `CGWindowListCopyWindowInfo` records filtered
to **that exact PID** and normal window layer. It returns only bounded
counts of owned normal windows and on-screen windows, plus the existing
privacy-bounded exact-chat tab count and paired native CUA capability
advertisement. It never outputs raw process identifiers, titles,
window references, URLs or screen pixels and never opens pages,
changes focus, invokes `computer.act`, alters browser/proxy/SSRF,
or sends a message. Nine mocked tests cover absent GUI windows,
normal/on-screen ownership, wrong PID, duplicate exact tabs, failure
sanitization and non-mutation. A positive GUI-owner result does
**not** yet attest a unique native CUA `windowRef` or composer,
and does not authorize a send.

If the managed browser really owns an on-screen window and the
exact target page is absent, the operator may manually open the
precisely registered AliceAI Project Chat in **that window**, sign in
if prompted and retain the page. A manual operator navigation is not
OpenClaw Browser automation permission. Prior strict Browser SSRF
refusal remains unresolved. Do not secretly route automated
navigation through Mac CUA to bypass that browser policy.

If zero owned normal windows are found, the next task is to
investigate launch/session visibility under the existing
`alice-ai` configuration, not to ask the operator to repeatedly
open the URL in a window not yet evidenced. Any future native
`list_windows` observation needs a separately scoped execution
and reliable WindowServer/windowRef binding.

## 2026-10-29 0535 live: dedicated browser GUI window owner attested

Mac Worker receipt `openclaw-alice-managed-window-owner-live-20261029-0535`:
`Status=passed`, exit 0; audit
`IOANT_ALICE_MANAGED_WINDOW_OWNER_READONLY`.
`ownedNormalWindowCount=13`, `ownedOnScreenWindowCount=1`,
`windowOwnerAttested=true`; `exactChatTabMatches=0`,
`exactChatTabUniquelyObserved=false`;
`nativeReadAdvertised=true`, `backgroundSetValueAdvertised=true`,
`targetPageActiveInOwnedWindowVerified=false`;
`state=await_operator_manual_navigation`,
`reason=managed_window_exists_target_chat_absent`.
No native `computer.act` was invoked; no browser navigation,
window-title read, screenshot, focus/input, credentials, config,
network, SSRF or Coordinator modifications; no chat send.

**Interpretation:** the headed `alice-ai` managed Chromium PID owns
macOS GUI windows including **one on-screen normal window**. Thirteen
normal WindowServer records do **not** imply thirteen displayed browser
windows or thirteen conversations. The target ChatGPT Project Chat is
**absent** from this isolated profile, so exact chat identity,
login state, target active tab, CUA AX composer and send authorization
remain unverified.

**Immediate human gate:** the operator should use that *already
running, visible* dedicated browser window to manually open the
registered AliceAI chat URL and sign in if needed. The user already
explicitly accepted doing the login personally. Do not make the
Worker navigate via native CUA as a hidden fallback around strict
proxy-routed Browser SSRF refusal. Do not ask the operator to keep
the browser foreground after login. Only after that human navigation
should a **new unique Worker task** rerun
`scripts/alice-managed-window-owner-readonly.mjs` and validate one
exact registered AliceAI Chat tab. A GUI ownership result alone
does not establish `windowRef` or computer-act write permission.
Preserve Coordinator single writer and pending exactly-once receipt.

The Stage E2a artifact and nine tests were protected-deployed with
`project-update-verify` at `ef25bb7b2f64a8d2ddc8525751b344b38f38854e`
in `0534`; Mac tests 1152 total, 1152 passed, 0 failed;
`reloadRequired=true` is a request, not independent reload proof.

## 2026-10-29 0536 after-login named recheck still lacks exact Alice tab

`openclaw-alice-managed-window-after-login-20261029-0536` returned exit 0
with `ownedNormalWindowCount=13`,
`ownedOnScreenWindowCount=1`, `windowOwnerAttested=true`,
`exactChatTabMatches=0`,
`state=await_operator_manual_navigation`,
`reason=managed_window_exists_target_chat_absent`.
Native CUA read and background set_value capabilities remain advertised;
no real computer.act was invoked. The task ID contains "after-login" but
the receipt does **not** attest user login or any ChatGPT page.
Do not infer unsuccessful authentication, retry the same owner-check,
or create another profile.

An easy operator trap: clicking a ChatGPT link in a different app
normally opens the **default/daily browser**, not the already-running
isolated `alice-ai` profile. The exact target URL must be pasted
manually into the address bar of the **dedicated managed browser
window** if the operator elects the human navigation path.

Next step: a privacy-bounded, **read-only** classification of the
`openclaw browser --browser-profile alice-ai --json tabs`
inventory, releasing only coarse category counts
(new-tab/blank, login-related, ChatGPT home, other ChatGPT,
Alice project but different chat, exact Alice chat, other origins).
Never print raw URLs, titles, cookies, profile paths or tab IDs.
No navigation, no background/foreground focus change, no chat send,
no Browser/SSRF policy mutations. If the target is absent, the
operator either has not navigated inside this dedicated profile, or
is on a redirect/other page; use the categories to distinguish.
The exact target tab identity alone still does not prove logged-in
state, native CUA windowRef/AX composer readiness, or permission to
deliver a message. Preserve strict Browser SSRF and Coordinator
single-writer gates.

## 2026-10-29 0537: Worker rejected oversized inline command; no execution

Mac Worker receipt `openclaw-alice-managed-tab-categories-20261029-0537`
returned `Status=invalid_task`, because the mac-terminal command exceeded
the Worker's **2048-character / 4096-byte** bounds. **No action was
executed.** This was an instruction transport rejection, not evidence
of a browser failure or any network/Chrome/Coordinator state change.
Do not reuse that task ID or issue multiline inline Python exceeding
the limit. New tasks must have fresh IDs and a short private-runtime
entrypoint; always pass `project-update-verify` first for code updates.

New committed Stage E1 diagnostic:
`scripts/alice-managed-tab-categories-readonly.mjs`, with ten mocked
tests. It reads only the running, owned `alice-ai` browser profile
status and that same profile's tab **URL metadata**, classifying rows
strictly into bounded predefined categories:
`exactAliceChat`, `otherAliceProject`, `chatgptHome`,
`otherChatGPT`, `loginRelated`, `blankOrNewTab`,
`otherOrigin`, `unknown`. It emits counts and fixed reasons,
never raw URLs, titles, tab IDs, user profile paths, URL query tokens,
cookies or page content. It does not navigate, focus, call native
CUA, send chat messages, change config or relax SSRF. An observed
login-related URL is **not login verification**. A precise target URL
can be counted only as a metadata match; it does not authorize
composer interaction. Do not infer no login from the target-chat count
remaining zero.

When `project-update-verify` succeeds on the new commit, invoke
only this short entrypoint under the private Mac runtime:
`node "$HOME/Library/Application Support/ioant-openclaw-ops/runtime/scripts/alice-managed-tab-categories-readonly.mjs"`.
Interpret the resulting category counts before deciding whether the
operator should type the exact Alice Chat URL in the **already
running dedicated window**. Never use the default browser as a
fallback; do not re-run E2a window ownership until a change warrants it.

## 2026-10-29 0540: dedicated tab URL is currently empty

`openclaw-alice-tab-shape-20261029-0540` was a successfully
executed bounded **read-only** Mac Worker command. It reported:
`tabArray=true`, `tabCount=1`, `tabIsObject=true`,
`urlType=string`, `urlEmpty=true`, `urlTooLong=false`,
`urlScheme=empty`, `fields.url=true`,
`fields.targetId=true`, `fields.title=true`,
`fields.type=true`, `fields.id=false`,
`fields.webUrl=false`, `fields.lastCommittedURL=false`,
`state=observed`. Raw tab URLs, titles and browser content were
not emitted. No browser mutation was attempted.

**What this proves:** at that moment, the running managed
`alice-ai` browser's only enumerated tab had `url=""`. This
completely explains the E1/E2a exact Alice Chat match count of zero
and the tab-category audit's `unknown=1`. The URL string is
empty, not an invalid ChatGPT URL parser projection. It does not
prove the operator's authentication status, that the tab has
*never* navigated historically, or that a different browser window
was used.

**Immediate operator action is no longer another diagnostic:** the
operator agreed to manually navigate/login in the isolated browser.
Use the existing `alice-ai` managed GUI window (one on-screen
window independently owner-attested in 0535), paste the **exact
registered Alice Project Chat URL directly into that window's
address bar**, press Enter, and personally sign in if prompted.
A ChatGPT link clicked in another app may open the default daily
browser and will not satisfy this specific profile's tab identity.
Do not request passwords, browser cookies or copied session data.

Navigation via OpenClaw Browser CLI in 0524 was explicitly blocked
by strict proxy-routed browser SSRF. Do not change SSRF or use
unapproved CUA browser navigation as an alternate automated bypass.
Human-performed navigation is not an automated-browser permission
grant. Once the user has acted in the dedicated window, run a
**fresh** short read-only `scripts/alice-managed-native-readiness.mjs`
task to verify a single exact chat tab. Even success does **not**
verify login/AX composer or authorize Alice Coordinator to send.
Preserve existing Coordinator sole writer and handshake.

## 2026-10-29 0541 recheck remains at zero exact Alice tabs

The Mac receipt `openclaw-alice-managed-chat-after-manual-navigation-20261029-0541`
returned exit 0 and `state=await_operator_manual_navigation`,
`reason=dedicated_browser_does_not_yet_have_exact_chat`,
`exactChatTabMatches=0`, `browserOwnedAndReady=true`,
`headless=false`, `cdpReady=true`. It explicitly reported
`navigationAttempted=false`, `tabFocused=false`,
`nativeComputerActInvoked=false`, and `chatMessageSent=false`.

The phrase "after-manual-navigation" in the task ID is **not proof
the human manually navigated** or completed ChatGPT login. The
operator has not separately stated that they pasted the URL into
the *managed Alice* window. Prior 0540 diagnosed one dedicated
tab with empty URL. Do not continue repeating E1/E2a scans without
a change. Ask the operator one specific question: did they personally
paste the exact target address into the dedicated browser address
bar and press Enter, or did they only run the Worker task? If they
did navigate and the managed tab remains missing, inspect how the
window/profile was selected (e.g., default Chrome confusion) using
privacy-bounded OS metadata, not secret URLs or login data. Do not
invoke browser navigation as an unapproved workaround to the existing
strict proxy-routed SSRF refusal; do not alter global proxy/TUN or
Alice Coordinator. The goal remains managed independent browser,
manual first login, native CUA v2 background operations later.

## 2026-10-29 operator screenshot: ChatGPT navigation fails at proxy connection

The operator supplied a Chrome screenshot showing the precise AliceAI
Project Chat path in the address bar, but the page body displays
`No internet`, `There is something wrong with the proxy server, or
the address is incorrect`, and `ERR_PROXY_CONNECTION_FAILED`.
This is direct evidence of a **browser-facing proxy connection failure**,
not proof of a failed ChatGPT login or a malformed Alice Project URL.
The screenshot alone cannot independently establish which Chrome
profile/process owns that pictured window.

Previous live receipts established the OpenClaw-managed `alice-ai`
profile has a headed Chromium with one on-screen normal window
(`0535`), a global explicit proxy in both OpenClaw browser config
and that Chromium's process arguments (`0526`), an unsuccessful
proxy-free direct `curl` to ChatGPT (`0527`) and its tab URL was
empty when checked (`0540`). Do **not** assume the screenshot was
taken at the same instant as the last tab metadata scan.

Immediate next gate: a **bounded, read-only local socket comparison**
of the `alice-ai` managed process's `--proxy-server` loopback port,
the global `browser.extraArgs` proxy loopback port, and macOS
System HTTPS Proxy local port, checking whether each localhost TCP
listener is reachable. Return only fixed booleans and port-match
flags: never raw proxy URIs, addresses, port numbers, process argv,
credentials, subscription URLs or Chrome content. This can
differentiate a stale legacy proxy endpoint from a live ClashX Meta
system endpoint. A successful local TCP connection is not proof that
the proxy forwards ChatGPT. The screenshot and current evidence do
**not** authorize editing proxy configuration.

Preserve the strict OpenClaw Browser SSRF boundary: as official
OpenClaw browser configuration documents, a healthy explicit Chrome
proxy still does not automatically permit agent Browser navigation
under strict SSRF. Manual user navigation/login and later agent
navigation are separate gates. Do not disable SSRF, restart the
Gateway, toggle ClashX TUN, change daily Chrome or migrate Alice
Coordinator merely to hide the original error.

## 2026-10-29 0542: stale managed-browser proxy endpoint confirmed

The exact Mac Worker receipt `openclaw-alice-proxy-port-check-20261029-0542`
reported:
`browserRunning=true`, `configProxyLocal=true`,
`processProxyLocal=true`, `systemHttpsProxyLocal=true`,
`configProcessPortMatch=true`,
`processSystemPortMatch=false`,
`processProxyListening=false`,
`systemProxyListening=true`. Port/address values were redacted,
and no settings or SSRF policy were changed. These are strong
local-layer evidence that `alice-ai` Chromium is using the same
**non-listening loopback proxy endpoint** specified in OpenClaw's
global browser flags, whereas macOS system HTTPS Proxy points to a
different **listening** loopback endpoint. The user screenshot
showed `ERR_PROXY_CONNECTION_FAILED` while the correct AliceAI
Chat address appeared in the address bar. A local TCP listener does
not independently verify ChatGPT forwarding, proxy protocol,
authentication, or end-to-end TLS connectivity.

The official browser configuration docs identify
`browser.extraArgs` as **global** managed Chromium launch flags.
The field is not a proven per-profile setting. Altering it may
change other OpenClaw-managed browser instances on their next launch.
Do not blindly replace or discard unrelated launch flags, user
profiles or credentials. Make a verified backup and a targeted,
reversible patch only after checking other running managed profiles
and whether the actual **system HTTPS proxy** can reach
`https://chatgpt.com/`. Reference:
https://docs.openclaw.ai/gateway/config-browser-ui-desktop .
If a targeted repair is authorized/verified, close/relaunch only the
owner-proven `alice-ai` browser where possible, and confirm its new
process flag matches the listening endpoint; do not discard its
persisted isolated profile or login state.

**Distinct security gate remains:** even with a healthy local
proxy, OpenClaw strict Browser SSRF rejects managed-browser
*automated* navigation through an explicit proxy. Repairing Chrome's
`ERR_PROXY_CONNECTION_FAILED` enables **human manual sign-in**;
it does **not** prove or grant the later Codex-style autonomous
Browser navigation. Preserve strict SSRF and separately develop a
policy-enforcing egress approach/native CUA authorization and exact
Coordinator sole-writer handshake. No broad ClashX Meta or
Tailscale/global-network modifications are authorized by this
diagnosis.

## 2026-10-29 0543: current system proxy forwards to ChatGPT; scoped repair planned

The Worker receipt `openclaw-alice-proxy-forward-check-20261029-0543`
returned exit 0 in 615ms, `systemHttpsLocal=true`,
`proxyForwardVerified=true`, `httpResponseReceived=true`,
`curlExit=0`, `httpCodeClass=4xx`, with no config, credentials
or SSRF changes. This confirms the **current macOS HTTPS loopback
proxy can establish a forwarding connection and receive an HTTP
response from chatgpt.com**. A 4xx response is not an authenticated
ChatGPT page, nor proof that Cloudflare/application login succeeded.
Combined with 0542, the managed `alice-ai` browser inherited a
stale **global** Chromium `--proxy-server` port that is no longer
listening, whereas the current system HTTPS proxy port is listening
and forwards.

Official current OpenClaw CLI documents:
- `openclaw config set browser.extraArgs <json> --strict-json --dry-run`
  validates an authored patch with no write.
- `--expect-current-json <old-json>` guards a later **single-path**
  conditional write against stale configuration; this is not combined
  with `--dry-run`.
- `browser.extraArgs` is global for managed Chromium, so a change
  may affect other managed profiles when they next launch. Profile
  and default launch settings hot-reload, and owned browsers may
  be replaced; do not claim unchanged process state from a config
  write alone. Sources:
  https://docs.openclaw.ai/cli/config and
  https://docs.openclaw.ai/gateway/config-browser-ui-desktop .

### Candidate Stage F1/F2 fix

`scripts/alice-stale-proxy-repair.mjs plan` is read-only:
attests headed `alice-ai` status/CDP/process, refuses unrecognized
non-local/protocol or multiple explicit proxy flags, examines all
other managed profiles and refuses if any are running/unverifiable,
compares one stale loopback HTTP proxy flag to current *listening*
system HTTPS proxy loopback port, confirms exact Chrome PID's
proxy flag and executes a strict-json **dry run**. It outputs only
bounded flags/counts, never ports, raw URLs, launch arguments or
proxy subscription credentials.

Only after a successful real `plan` receipt, separately invoke
`scripts/alice-stale-proxy-repair.mjs apply` as an explicit
reviewed task. It re-runs **all** preconditions, saves the original
authored `browser.extraArgs` privately in
`~/Library/Application Support/ioant-openclaw-ops/private-recovery`
(permission 0600), then conditionally changes **only that config
path**. Readback verifies the intended array and publishes
`scoped_config_updated` if confirmed. Failure after a write is
reported `inconclusive` rather than a fabricated rollback/success.
It does not restart browsers, Gateway, system proxy, Tailscale,
Chrome, native CUA or Coordinator, and never navigates ChatGPT.
Any later restart must be **owner-scoped to alice-ai**, preserve its
persistent profile, and re-attest new Chromium process proxy
flags and actual manual navigation.

The global launch-flag change does not fix strict Browser SSRF
rejection of *automated* proxy-routed navigation. Keep
`browser.ssrfPolicy.dangerouslyAllowPrivateNetwork` unset,
retain one-writer Alice Coordinator and independently review
a truly policy-enforcing egress/native-CUA workflow before
agent-initiated navigation or chat send.

## 2026-10-29 0544-0546: guarded proxy fix is applied, browser process pending

The protected Mac runtime update `0544` moved the deployed source to
`4910547daa68d937fe268722bf7858f892588e8b` with
`1173/1173` tests passing. `reloadRequired=true` means a reload
was requested, not independently verified.

`openclaw-alice-stale-proxy-repair-plan-20261029-0545` returned
`state=ready_for_scoped_apply`, with one other managed profile
`otherManagedProfileCount=1` but `otherManagedProfilesRunning=0`,
old proxy listener absent and current loopback listener present,
`originalFlagCount=1`, `unchangedFlagCount=0`,
`dryRunPassed=true`. The plan did not write a config or backup.

The separate authorized `openclaw-alice-stale-proxy-repair-apply-20261029-0546`
returned exit 0 and `state=scoped_config_updated`,
`backupSaved=true`, `configChanged=true`,
`browserProcessRestartRequired=true`,
`ownedBrowserRestarted=false`, `loginVerified=false`,
`browserAutomaticNavigationAuthorized=false`.
This is **confirmed config change**, not confirmed Chromium process
replacement or browser network/login readiness. Existing system
proxy, Tailscale, daily Chrome, Browser SSRF policy and Alice
Coordinator were not changed by the script. The private original
`browser.extraArgs` backup was saved on Mac with restrictive
permissions. No backup contents/ports should be pasted into Chat.

The next operator-authorized task may use the official per-profile
OpenClaw lifecycle commands:
`openclaw browser --browser-profile alice-ai stop` then
`openclaw browser --browser-profile alice-ai start`, followed by
bounded `alice-ai` status. Official CLI reference
https://docs.openclaw.ai/cli/browser states that a locally managed
profile's `stop` stops that managed browser process; it does NOT
require `reset-profile`. Use the **same named profile**, preserve its
user data, and never touch daily Chrome or other managed profiles.
A named `stop` or `start` may affect visible focus briefly; no
automation should enter ChatGPT credentials or send a message.

After a fresh, headed and CDP-ready managed process is observed,
verify that its actual startup proxy port matches the system's
listening and forwarding HTTPS loopback proxy, with endpoints
redacted. A healthy proxy permits the user to retry **manual**
ChatGPT login in this independent window, but **does not resolve**
the separate strict SSRF rejection of *automated* Browser navigation
under explicit proxy routing. Continue the native CUA v2/Coordinator
safety gates; do not relax `dangerouslyAllowPrivateNetwork`.
