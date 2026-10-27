# CUA test fixture: bounded native observation — 2026-10-28

## Accepted evidence

- 153B confirmed the paired Mac native provider `cua-computer`, a valid
  v2 descriptor and advertised background delivery (not proven execution).
- 157B returned `state=prepared`, `compileDriver=xcrun_swiftc` and
  `readOnlyStateProbePassed=true`, for source digest prefix
  `8371dd07643b3861`.
- No real window/element action or focus-preserving background input has
  passed yet.

## Stage 158: one-shot read-only CUA target discovery

New `scripts/openclaw-cua-fixture-native-observe.mjs` uses the exact
private prepared AppKit binary matching a freshly SHA-256 hashed
`Fixture.swift` source. It launches *only* this temporary, accessory-policy
non-browser test application. The fixture auto-terminates after 120 seconds,
and the script SIGTERMs only its own child at completion.

The observer:

1. Reads a pre-launch frontmost bundle ID and real mouse position from
   the test binary's `--state` mode; no GUI launched by this read.
2. Requires one selected paired macOS CUA v2 node, unchanged provider
   generation, advertised `list_windows` and `get_window_state`, and a
   background delivery capability.
3. Launches the fixture, waits a short fixed interval, and verifies it did
   not activate another application or move the real pointer. Abort on
   change (which might also be ordinary human activity).
4. Invokes `computer.act list_windows` once in a new UUID execution.
   It matches a window **only** by its exact synthetic title and the
   process ID of the just-launched fixture. It never reports other apps'
   names, window titles or opaque refs to chat.
5. If the window has exactly one reference, calls one
   `computer.act get_window_state` with that same execution ID,
   `windowRef` and `includeScreenshot:false`. It looks for exactly
   one `IOANT CUA Fixture Editable` field and a fresh observation ID.
   Other AX elements/text/identities are neither processed for tasks nor
   emitted.
6. Revalidates node generation, frontmost bundle ID and physical pointer.
   Reports only allowlisted evidence flags; removes the fixture process.

**No CUA input is allowed in this stage**, including `set_value`, click,
type, key, scroll, launch_app, bring_to_front or browser actions. No
screenshot, native browser page state or DOM is taken. If CUA refuses a
read, the program records a bounded error class and never falls back to
another provider or terminal/AppleScript UI manipulation.

The isolated macOS window remains part of the user's shared WindowServer,
not a second OS desktop. Observed focus/pointer stability alone is not a
proof of secure isolation or successful keyboard targeting. A separate
authorized subsequent one-shot mutation script may use the observation
semantics proven here to test **one** background `set_value` against this
fixture, with no foreground fallback, explicit non-interference checks and
independent readback.

Official OpenClaw docs: https://docs.openclaw.ai/nodes/computer-use

## Deployment

Deploy GitHub main with `project-update-verify`, require full tests and
confirm exact HEAD. Next run only this one-shot script as a scoped
`mac-terminal` action. If the native reply schema is unexpected, revise
only the parser based on bounded, non-sensitive metadata. Never broaden
to browser contents or arbitrary GUI automation to force the test to pass.

## 2026-10-28 — 158B Mac evidence and safer parser recovery

The 158B one-shot fixture observation returned
`launchedFixture=true`, `phase=window_list`,
`reason=fixture_window_not_found`, `matchedWindowCount=0`;
there were zero pointer/keyboard input actions and zero screenshots.
The CUA `list_windows` invocation returned to the script without a CLI
exception, but the original strict parser matched no synthetic window.
This does **not** prove whether WindowServer omitted the window or an
OpenClaw transport wrapper obscured its structured result.

The first parser omitted common OpenClaw `content[].text` and
`structuredContent` JSON wrappers, and recognized only `pid` and
`processId` as PID fields. The updated strict observer traverses those
wrappers and known PID/title aliases, without changing the native CUA
action surface.

On a missing window it now emits only bounded **synthetic fixture**
evidence booleans (exact fixture title seen, exact newly spawned PID seen,
joint PID + title record seen, valid opaque ref present, text-wrapper
presence, synthetically named fixture found in text). It never emits
unrelated window names, IDs, native text, screenshots, browser data,
errors, opaque tokens or other application inventory. It never authorizes
`get_window_state` without the title, same PID and exact windowRef in
one native record; it never fabricates a ref from freeform text or merges
the title of one window with the PID of another.

Acceptance for this repair is a full clean `project-update-verify`
followed by exactly one scoped one-shot read-only observer. Do **not**
run background `set_value` unless a verified window reference and
a fresh observation have first been established.

If the next live CUA list reports no record matching even the exact
fixture title/PID, inspect the test-app's own WindowServer exposure and
startup ordering without forcing foreground activation; do not weaken
the window identity constraint.

## 2026-10-28 — 159A blocked safely, bounded parser-depth correction

The first parser update was rejected by `project-update-verify`:
`candidate_tests_failed`, 707 total / 706 passing / 1 failing,
no failing locations returned. The worker did **not** install the
candidate; the last accepted Mac runtime remains HEAD
`902a0e078f490b870866d1fe0bbfe2591891bd84`.

Source review found a reproducible inconsistency: the added
`content[].text` test JSON wraps `result.details.windows`. Window row
objects are reached at depth **9**, whereas the old traversal had a
default maximum depth of **8**, so strict PID/title match returns zero.
A pure traversal reproduction returned 0 hits at depth 8 and 1 hit at
depth 12.

The updated walker permits depth 12 while retaining the 1,800-node
cap, 512 KiB JSON-string budget and same-record synthetic identity
check. Two tests cover the depth-9 fixture and blocked 16-level
arbitrary nesting.

This explains a likely single synthetic test failure; it does not
yet establish that Mac's **real** CUA response used that format. Next
gate is another clean full `project-update-verify`; only then attempt
another single read-only test fixture window observation. No CUA
background write is authorized before its own window and element are
uniquely confirmed.

## 2026-10-28 — 160B CLI-level refusal, not a parser miss

After 160A full deployment (709/709), a new one-shot read-only
fixture probe 160B reported `launchedFixture=true` but failed at
`window_list` with `native_read_refused_or_unavailable`, its
sanitized classifier returning `errorClass=unclassified` and
`cliExitCode=1`. No pointer, keyboard, browser or GUI input occurred.

Unlike 158B, `list_windows` did **not** return a successful JSON body
for the parser to inspect. Therefore do not interpret 160B as
`fixture_window_not_found`, or adjust PID/title matching again.
A provider advertised capability does not prove that the app-owned
CUA Driver daemon is initialized or that the Gateway approved command
and macOS permissions are good.

New `scripts/openclaw-cua-native-runtime-readiness.mjs` performs
**one** read-only `nodes status --json` and a bounded exact process-
name check (`pgrep -x cua-driver`). It emits only verified
advertisement flags and a daemon-process-observed boolean, never
PIDs, command lines, node identities, windows, browser details,
raw error text or input actions. `driverProcessObserved=false`
is only point-in-time evidence: macOS may launch this app-owned
driver lazily; it does not prove the provider is permanently broken.
Likewise process presence does not prove the private endpoint is
healthy. This script does not query macOS TCC grants or node
pairing-approval records, both of which remain unverified.

Use full project-update-verify and inspect this read-only readiness
before any additional fixture launch. Depending on that result,
design a future narrowly scoped diagnostics pass that classifies the
original native CLI error response while still retaining exact
non-browser read scope. Do not restart services, modify permissions,
switch providers, bypass policy, or enable a foreground fallback
merely to force success.

Authoritative references:
https://docs.openclaw.ai/nodes/computer-use
https://docs.openclaw.ai/nodes/command-policy
https://docs.openclaw.ai/nodes/troubleshooting

## 2026-10-28 — 161B Driver running, isolate per-action native invoke

161B read-only Mac inspection: `nodeConnected=true`,
`cuaDescriptorValid=true`, `driverProcessObserved=true`,
`listWindows/getWindowState/getCursorPosition/setValue` all advertised,
`backgroundDeliveryAdvertised=true`. Crucially, it still reports
`cuaDriverEndpointVerified=false`,
`pairedCommandApprovalProven=false`,
`accessibilityGrantIndependentlyVerified=false`, and
`safeForBackgroundInput=false`. A process PID observed at this instant
does **not** prove the driver socket or action execution works.

New `scripts/openclaw-cua-readonly-invoke-diagnostic.mjs` compares
`computer.act get_cursor_position` and `computer.act list_windows`
on the **same selected node and executionId**; it invokes each action
at most once and does not start a GUI or touch the browser. It returns
only fixed result/effect types, error classes, allowlisted native
codes, the CLI exit code and an error digest; it discards all native
window/application content and other potentially private output. A
recognized pairing/policy/permission denial on the first action
short-circuits the second.

This can separate a general native invoke failure from an action-specific
`list_windows` failure. It does not attempt to fix permissions or approve
new command surfaces, switch providers, restart services, re-pair
devices or use a new browser-control channel. A positive cursor probe
also does not establish background window input or Mac keyboard/focus
non-interference.

Source references:
https://docs.openclaw.ai/nodes/computer-use
https://docs.openclaw.ai/nodes/command-policy
https://docs.openclaw.ai/nodes/troubleshooting

Next: deploy via full project-update-verify, then execute exactly one
bounded read-only diagnostic. Do not re-run the GUI fixture until the
native caller can return actionable structured results or refusal codes.

## 2026-10-28 — 162B both native reads fail (Gateway error envelope)

The deployed 162B read-only native comparison returned:

- `get_cursor_position`: `state=failed`, `exitCode=1`,
  `category=unclassified`, `structuredErrorBody=true`,
  `stdoutPresent=true`, `stderrPresent=true`, error digest prefix
  `cf464ded5722`.
- `list_windows`: same state, exit and coarse classification, digest
  `c071c8f51e7a` (different). Both used one execution ID.
- No mouse/keyboard input, test-app launch, screenshot, browser access,
  or native window details reported.

These results rule out classifying this particular run as a pure
window-matching error. They do **not** prove the CUA Driver socket is
unavailable: Gateway operator scopes, node pairing approvals,
command deny policy, transport errors or driver dispatch could all
reject before a native action runs.

The OpenClaw operator-scopes reference requires `operator.write` for
`node.invoke` command relays, including read-only computer actions;
read-only status queries can succeed with `operator.read`. Pairing
approval is separately needed for the `computer.act` node command.
A capability advertisement alone does not prove either approval.

The revised `scripts/openclaw-cua-readonly-invoke-diagnostic.mjs`
adds a strictly allowlisted structured-error shape (JSON error keys,
types, recognized public code categories, boolean scopes/pairing/
driver markers). All raw JSON error messages, arbitrary keys,
native return data, device tokens, and window titles are discarded.
Its `--cursor-only` mode issues **one** `get_cursor_position` native
read at most, with no GUI fixture or `list_windows`. The report
only classifies the denied call, not attempts to change authorization.

Next: deploy under `project-update-verify` requiring full clean tests;
then run `node scripts/openclaw-cua-readonly-invoke-diagnostic.mjs
--cursor-only` against the pinned version. If it identifies a missing
scope, pairing approval or command policy denial, do not silently
override it; stop and handle authorization through the proper
operator-controlled channel.

Sources:
https://docs.openclaw.ai/gateway/operator-scopes
https://docs.openclaw.ai/nodes/computer-use
https://docs.openclaw.ai/cli/nodes

## 2026-10-28 — 163A safe-update rejection and classifier compatibility fix

The 163A update candidate was rejected by the Mac worker's safe-update
gate: `candidate_tests_failed`, 737 total, 735 passed, 2 failed,
no failing locations exposed. The previously deployed runtime remains
`12ca30aafcea489a2318c632fabe184fa04c5442`. No new native
Computer Use action was performed during this rejection.

Review of the new error classifier revealed two reproducible
classification inconsistencies:

1. Explicit `command denied by policy: computer.act` was classified
   as generic `computer_act_approval_or_policy` before reaching the
   more specific existing `gateway_command_policy` rule.
2. The harmless diagnostic `node pairing not approved` did not set
   `nodePairingMentioned` because the original pattern only recognized
   `pair` with a word boundary, not `pairing`.

The updated classifier gives explicit Gateway-policy denials precedence
over generic computer.act mentions, and accepts `pair`, `paired`,
and `pairing` as bounded node-pairing metadata. Two targeted tests
protect both boundaries; sanitized error codes and `--cursor-only`
fail-closed read limits are unchanged. The rejected candidate's exact
two failing assertions were not exposed by the worker, so these are
code-review findings, not a claim of verified failing test names.

Next action: deploy only the new GitHub main through the standard
`project-update-verify` gate and require all tests passing. If any
candidate tests still fail, do not invoke real CUA diagnostics until
the test failure is fixed.

## 2026-10-28 — 164B standardized CLI error and 165A safe lexical signals

The one-shot 164B `--cursor-only` probe returned the standard CLI
JSON failure envelope: `ok=false`, `error={message,type}`;
`exitCode=1`, `category=unclassified`, with no public native
error code. The shape classifiers found no `operator.write`,
pairing, permission/scope, command denial, driver or Gateway keywords.
`windowListRead.state=skipped`, no fixture app, screenshot, mouse,
keyboard, browser access or desktop input.

The error remains **unclassified**. Do not infer operator.write is
missing, that pairing has been revoked, or that the app-owned Driver
is broken. OpenClaw documents that the CLI's standard JSON failure
uses `error.type="cli_error"`, which is a generic wrapper, not
the underlying node/driver failure category; the accompanying
`error.message` is where the useful reason usually appears.

Updated the existing read-only diagnostic to decode `error.message`
**locally only** into `safeErrorShape.cliErrorSignals`:
a known CLI error type (`cli_error`, etc.), a fixed message-length
bucket, and at most 24 **unique words selected only from a hard-coded,
nonpersonal operational vocabulary**. No raw text, private token,
home directory, host, path, app/window name, arbitrary error type,
device identity, or URL may be included in the returned report.
Unmatched strings are ignored. This is diagnostic evidence, not
permission to bypass or repair any authorization automatically.

Re-test is **one** non-mutating `get_cursor_position` invocation
(`--cursor-only`) following a passing full safe-update test gate.
No further window enumeration or set_value until the original
command path can return meaningful classified evidence. Even a
successful cursor read is not proof of safe background text input.

Source: https://docs.openclaw.ai/cli/index

## 2026-10-28 — 165B host-busy lead, upstream execution ownership lifecycle

The one-shot `--cursor-only` native diagnosis from deployed HEAD
`9e1c76c6ce52cdf598ad35143f438c351f273a65` failed with
`error.type=cli_error`, `exitCode=1`, with safe allowlisted words:
`error`, `computer`, `host`, `busy`, `provider`, `execution`.
There was no window enumeration, GUI interaction, browser access, or input.

The words strongly resemble
`COMPUTER_HOST_BUSY: another provider execution owns this computer`,
which is documented in upstream OpenClaw issues
[#126373](https://github.com/openclaw/openclaw/issues/126373)
and [#147420](https://github.com/openclaw/openclaw/issues/147420).
Upstream PR [#151127](https://github.com/openclaw/openclaw/pull/151127)
merged on 2026-10-11 to release run-owned computer executions in one
MCP control path. The user's prior installed OpenClaw version was
2026.10.7, which predates that merge; current installed version must
be read on the Mac before treating that assumption as fact. These
issues span Codex and MCP on Windows/Linux and Gateway-host desktops.
They show a relevant class of bug, NOT proof that the same lifecycle
bug is active in this paired macOS node.

Updated the native failure classifier to recognize exact
`COMPUTER_HOST_BUSY` as `computer_execution_occupied`.
Added `scripts/openclaw-cua-host-ownership-passive.mjs` to read the
official **bounded, already-redacted Gateway log tail** and
`openclaw --version`; it emits only a sanitized version,
occurrences/booleans for the exact known host-busy code and fixed
ownership wording, and explicit uncertainty flags. It never emits
raw logs, node/owner/execution IDs, app/window content or credentials.
It never invokes `computer.act` or starts/stops a GUI, Gateway,
node, driver, or computer execution.

**Do not send random `__close_execution` calls.** The upstream issue
documents that after 2026.9.6 mismatched execution IDs cause a silent
no-op even when `ok:true` is returned. Likewise do not restart the
Mac Node/Gateway, switch providers, or manually clear locks while
an authorized execution might genuinely be active.

Next operator gate:
1. Candidate `project-update-verify` must pass all tests.
2. Run the passive script with exact HEAD guard. A missing log match
   remains inconclusive (bounded retention); a match establishes only
   that the code occurred in the log, not current owner identity or
   whether it is stale.
3. If confirmed and no legitimate active owner exists, plan a separate
   explicit, owner-aware cleanup or controlled maintenance window
   using upstream lifecycle fix, preserving other active work.

References:
https://docs.openclaw.ai/cli/logs
https://docs.openclaw.ai/nodes/computer-use
https://github.com/openclaw/openclaw/issues/147420
https://github.com/openclaw/openclaw/pull/151127

## 2026-10-28 — 166B passive logs exceeded observer's post-JSON cap

166B on Mac returned `installedOpenClawVersion=2026.10.7` and
`logTail.state=inconclusive`, `reason=log_tail_unavailable_or_oversized`.
The CLI log call itself **did not fail**: the script only enters this
branch after `readCLI(LOG_ARGS)` succeeded and returned a string.
Therefore its output was longer than the diagnostic's previous
300,000-character ceiling. It was still under the CLI call's existing
450,000-byte `maxBuffer`, or the call would have thrown a separate
`gateway_log_tail_unavailable` branch.

The official OpenClaw `logs --max-bytes` option limits log-file bytes,
whereas `--json` emits line-delimited structured events and can
produce larger escaped/wrapped stdout. The previous 300k check was
premature for this existing 450k read buffer.

The passive parser now permits at most 450k characters and emits a
safe output-size band (`at_most_300k` or
`between_300k_and_450k`), never raw logs. Input larger than 450k
remains inconclusive. The CLI `maxBuffer` is unchanged, as are the
1000-line/250000-source-byte request cap, the 1000-line scan cap,
strict exact `COMPUTER_HOST_BUSY` token, and no-owner-release guard.
Two tests cover JSON-expanded logs between 300k/450k and rejection
above the cap.

This is a **diagnostic bound correction**, not a workaround for
`COMPUTER_HOST_BUSY`. No ownership conflict was proven by 166B.
After a clean deployment and passive rerun, a bounded log tail with
no match remains only an absence in that sampled tail, not proof
of no stale execution.

Reference: https://docs.openclaw.ai/cli/logs

## 2026-10-28 — 167B verified host ownership conflict; upgrade readiness gate

The deployed 167B bounded passive Gateway log audit completed successfully:

- Local OpenClaw CLI: **2026.10.7**.
- Inspect 287 log lines within the 300–450k JSON output band.
- **Exact `COMPUTER_HOST_BUSY` occurred 4 times.**
- Exact provider-execution-ownership phrase observed.
- No `COMPUTER_EXECUTION_*MISMATCH` or `__close_execution` mention
  in the bounded tail.
- `currentOwnerVerified=false`, `staleOwnerVerified=false`,
  `activeExecutionVerified=false`, `safeToReleaseOwner=false`.

This establishes that real Computer Host ownership conflicts reached the
Gateway at least four times in the sampled logs. It **does not**
establish when the owner first started, who owns it, whether it remains
active or stuck, or whether a release is safe.

Upstream OpenClaw
[issue #147420](https://github.com/openclaw/openclaw/issues/147420)
documents that a missing run-lifecycle cleanup leaves a provider-owned
`executionId` blocking new executions and records a fix in
[PR #151127](https://github.com/openclaw/openclaw/pull/151127), merged
2026-10-11. This does not prove the Mac's node has the same original
path, and updating binaries alone does not prove or release an old
owner. A random `__close_execution` can silently no-op; attempting
direct or forced cleanup without owner identity may disrupt other
legitimate work. No cleanup/restart is authorized.

New `scripts/openclaw-cua-upgrade-readiness-passive.mjs` reads only
official CLI `--version`, `update status --json`,
`gateway status --json`, and `status --json --timeout 15000`;
its output is a tightly allowlisted status summary, never raw
session/state/log or token data. The summary reports CLI-vs-Gateway
version agreement and update availability where those facts are
supported, plus an explicit UNKNOWN where not. Even if the
`status` projection has zero running tasks, that does **not**
certify no active computer execution. Any next move that mutates
the version, node/provider, Gateway or owner requires a separately
reviewed maintenance plan and active-run safety check.

The installed CLI is older than the upstream fix date and a potential
upgrade candidate exists in current release notes, but the candidate
must be grounded in **local** `openclaw update status --json`
before selection. Official updater guidance says updates can activate
managed services, Doctor maintenance and restarts. An earlier user
upgrade attempt failed with shared SQLite offline-maintenance busy;
do not repeat it blindly.

Authoritative references:
- https://docs.openclaw.ai/cli/update/status-and-history
- https://docs.openclaw.ai/install/updating
- https://docs.openclaw.ai/cli/status
- https://github.com/openclaw/openclaw/issues/147420
- https://github.com/openclaw/openclaw/pull/151127

## 2026-10-28 — 168B and 169 root cause: our one-shot reads could strand execution ownership

168B upgrade-readiness evidence: CLI and Gateway both
`2026.10.7`; RPC healthy; the local updater advertises candidate
`2026.10.8`; update active-run status remains **unknown**; agent task
summary is unavailable. No rollback backup, maintenance window,
or proof of no active Computer execution exists. There is **no**
approval for an update, restart, forced shutdown or owner release.

Review of upstream OpenClaw source at **both tags**
`v2026.10.7` and `v2026.10.8` shows
`src/gateway/tool-resolution.ts` and
`src/agents/tools/computer-tool.ts` are byte-identical and both
already include the admitted-run computer execution cleanup from PR
`#151127`. Thus the earlier theory that 2026.10.7 lacks this fix
was **incorrect**. Updating to 2026.10.8 is not an established fix
for the observed busy owner; the new release may have independent
security value, but requires a separate maintenance decision.

The more important source evidence lies in
`src/plugins/computer-use-registration.ts` at v2026.10.7:
- Lines 44–48 hold an in-memory `execution` object for the
  registered node-local provider.
- Lines 69–93 open a provider execution and reject a different UUID
  while the owner exists, producing the literal `COMPUTER_HOST_BUSY`.
- Lines 95–126 close the current execution only for the matching ID.
  A mismatched close resolves without changing the owner.
- Lines 203–225 implement `computer.act`; any action with an explicit
  `executionId` uses the cached execution, even for harmless reads,
  while `__close_execution` is an explicit lease close with the same
  execution ID.

Our earlier read-only scripts were **incomplete** in this lifecycle:
they sent fresh random UUIDs through `computer.act`, but did not close
the same ID on early return. In particular, 158B
`list_windows` returned successfully, then the observer reported
`fixture_window_not_found` and exited **without any matching close**.
This is a plausible concrete source of the four later host-busy errors,
although it does not independently prove current owner identity or
exclude earlier/simultaneous sessions.

Corrective source work:
- Add `scripts/openclaw-cua-owned-session-guard.mjs` with a strict
  two-read maximum, exact v4 UUID and fixed one-owner cleanup
  `__close_execution` builder, plus pure regression tests.
- Modify `scripts/openclaw-cua-readonly-invoke-diagnostic.mjs`
  and `scripts/openclaw-cua-fixture-native-observe.mjs` to
  avoid abandoning their own new execution IDs.
- Add `COMPUTER_HOST_BUSY` to the safe native error classification
  and skip any speculative release when the new request is refused
  because another execution owns the host.
- Preserve the precise distinction:
  `closeAcknowledged=true` is **not** proof that a current owner
  was released. No existing owner ID is recovered by these changes.

**DO NOT RUN older read-only Computer Use scripts again.** Existing
owner(s) may still be present. Deploy these source fixes via the
normal full-test safe update only. That deployment runs no
`computer.act`, does not touch the Mac UI and cannot clear the
old owner.

Remaining recovery must be a separate, owner-safe maintenance
procedure that confirms no other legitimate provider execution or
Agent task is in progress. Never send random `__close_execution`
UUIDs. An explicitly approved coordinated node disconnect/restart
could retire a stranded in-memory owner, but cannot be attempted
until current-work safety and recovery checks have passed.

Source:
https://github.com/openclaw/openclaw/blob/v2026.10.7/src/plugins/computer-use-registration.ts
https://github.com/openclaw/openclaw/pull/151127
https://github.com/openclaw/openclaw/releases/tag/v2026.10.8

## 2026-10-28 — 169A accepted; 170 full legacy read-only audit and safe recovery preflight

169A deployed GitHub commit `8daeffe9ab84866890d80cbad53940915a2ceb12`;
the Mac's full test gate passed **777/777**. This update installs
source guards but **does not** release an old CUA lease or clear
`COMPUTER_HOST_BUSY`.

Further source review discovered two more pre-169 legacy paths that
could independently abandon their own provider sessions:
`scripts/openclaw-native-computer-readonly-smoke.mjs` (cursor read)
and `scripts/openclaw-native-app-inventory-readonly.mjs`
(`list_apps`). The combined noninterference-readiness script may
indirectly call the latter. They have now been modified to use
exactly matching `__close_execution` for the UUID **they** created,
after a successful or ambiguous read, and to skip closing an
unrelated owner after a clear `COMPUTER_HOST_BUSY`, unsupported-action,
or Gateway policy denial. Never infer actual owner release from
`ok:true`.

New `scripts/openclaw-cua-owner-recovery-readiness.mjs` is passive
and read-only. It asks only for one connected Mac status, the
last 30 minutes of bounded **session metadata only**, the Gateway
RPC status, and the exact project's Watcher status. It reports
coarse booleans/counts and no agent/session IDs, user data, browser
content, commands, processes, windows, or execution lease values.
A recent session count of zero, a connected node, and a Watcher
`running` or `stopped` state **cannot prove** the Computer provider
has no live owner. If an endpoint is unavailable, that check is
inconclusive; the script cannot grant restart permission.

Read-only recovery path:
1. Deploy with the normal exact-HEAD `project-update-verify`;
   require a complete passing test suite and no uncontrolled service
   restart. The source-only deployment must not attempt CUA.
2. Invoke the new passive readiness script once under the pinned Mac
   runtime. It must report `attemptedOwnerRelease=false`,
   `restartedNode=false`, and
   `safeToDisconnectOrRestartNode=false`.
3. Review whether another active Agent has legitimate Computer
   ownership before arranging a **separately explicitly approved**
   maintenance window for any graceful node reconnect. The paired
   OpenClaw node-side provider registers `onDisconnect` to close
   its current execution, but neither an arbitrary `__close_execution`
   nor an unverified node restart is appropriate.

Official source: https://github.com/openclaw/openclaw/blob/v2026.10.7/src/plugins/computer-use-registration.ts

Do not re-run old deployed `computer.act` read scripts if the
full 170A rollout has not passed. No active-owner ID has been
recovered, and the old lease remains untouched.

## 2026-10-28 — 170B passive recovery readiness and 171 Mac host topology gate

Mac 170B passed at deployed HEAD
`a66c0791a41a74153653459b57bd289646907a74`
with **792/792 passing regression tests** beforehand.

- Paired Mac Node connected and native computer capability advertised.
- Gateway RPC healthy.
- Watcher reported `running`, and **must not be interrupted
  without separate maintenance authorization**.
- Bounded `sessions --all-agents --active 30 --limit 50` reported
  0 recent sessions; `snapshotLimited=true`. This is **not**
  a proof of no active tools, queued jobs or other Agents.
- `nodeStatusIncludesExplicitComputerOwner=false`:
  neither current owning ID nor whether the owner is still live/stale
  is known. `safeToDisconnectOrRestartNode=false`.
- No CUA action, UI interaction, browser access, owner release, node
  restart, Gateway restart or Watcher stop occurred.

A crucial operational distinction from official OpenClaw
`docs/cli/node.md`: `openclaw node restart` controls **installed
headless node services**; the macOS `OpenClaw.app` normally supplies
a native app-owned Mac Node with its own TCC identity and bundled
CUA driver. Headless node service operations must never be assumed to
restart the app-owned Node, and the Gateway should not be restarted
just to reset a node-local in-memory owner.

New `scripts/openclaw-cua-node-host-topology-readonly.mjs` uses only:
1. One `openclaw nodes status --json` to classify a connected
   Mac Node and the canonical CUA v2 descriptor.
2. One `openclaw node status --json` to inspect whether a
   *separate headless Node service* is installed.
3. Exact process-presence checks (`pgrep -x OpenClaw` and
   `pgrep -x cua-driver`) without returning PIDs.

This **does not** prove which process owns the selected Node. It
only makes app-owned vs headless hypotheses visible without
perturbation. It never invokes `computer.act`, obtains a screenshot,
enumerates windows, queries Chrome, restarts a service, or releases
any execution. All owner-safety and restart flags remain false.

Gate before recovery: deploy with exact HEAD and complete test suite,
then run the passive topology check. A live-app result guides which
proper node-specific maintenance procedure should be prepared but
**does not authorize any restart**.

Official references:
- https://docs.openclaw.ai/cli/node
- https://docs.openclaw.ai/nodes/computer-use
- https://github.com/openclaw/openclaw/issues/147420

## 2026-10-28 — 171A blocked by comment-only source test false positive

The Mac project-update-verify gate correctly refused the 171A
candidate with 802 tests, 801 pass, 1 fail; the installed runtime
remained on the previously accepted `a66c0791a41a74153653459b57bd289646907a74`.
The candidate's newly added
`test/openclaw-cua-node-host-topology-readonly.test.mjs`
searched the complete text of the passive script for prohibited
`launchctl` use, and matched the *documentation comment*
`// launchctl, CLI restart, owner close, or config mutation.`
No executable `launchctl` call exists.

The test has been fixed to remove standalone line comments from
the subject before enforcing the unchanged prohibited-call regex.
The safety assertion remains enabled and continues to reject real
`launchctl`, `nodes invoke`, `__close_execution`, GUI input and
CLI restart statements. Static recheck confirms the real-code-only
scan has zero matches while the full-source scan still sees only
the documentation comment.

Retest through the normal exact-HEAD `project-update-verify`
candidate gate. No service, Node, Gateway, Watcher or Computer
owner should be changed by this test-only correction.

## 2026-10-28 — 171B app-owned CUA hypothesis; 172 exact parentage preflight

The Mac 171B passive topology probe on HEAD
`feec3ef9ffae84b1fb37f6f4eca9920500450f1f`
reported `connectedMacNode=true`, `computerActAdvertised=true`,
`cuaProviderV2Advertised=true`;
both the exact `OpenClaw` application process and exact
`cua-driver` process were observed. The separately managed
`openclaw node status --json` CLI returned but its service state
and installed status were unrecognized (`null`/`unknown`);
there is no positive proof that a headless node service owns this
selected Mac Node. `hostKindIndependentlyVerified=false`,
`safeToRestartNode=false`.

Official v2026.10.7 macOS source reinforces the hypothesis:
- `apps/macos/Sources/OpenClaw/CuaDriverHostCoordinator.swift`
  declares the embedded CUA daemon is launched as a **direct
  OpenClaw.app child** so macOS TCC responsibility remains with
  the application. This is a source-level architectural statement,
  not independent verification of the running Mac processes.
- `apps/macos/Sources/OpenClaw/NodeMode/MacNodeModeCoordinator.swift`
  coordinates the app Node Worker and serializes route
  disconnection, cancellation, and worker restarts on provider
  changes or daemon stop. The app's Node must not be treated as
  equivalent to a separately installed headless node service.
- The CLI `openclaw node restart` applies to a managed headless
  node service and must NOT be attempted against the app-owned
  Node without independent host identity proof.

New `scripts/openclaw-cua-app-parentage-readonly.mjs`
queries one paired Mac Node metadata status and the exact
`pgrep -x OpenClaw` / `pgrep -x cua-driver` process sets,
then privately resolves only driver parent IDs via
`ps -p ... -o ppid=`. It reports only whether at least one
driver is a **direct child of one observed OpenClaw.app process**,
plus whether all observed drivers match; it never emits PIDs,
paths, command lines, labels, window titles, browser or screen
content. An unknown process parent or cross-process ambiguity
is reported as inconclusive. Even a matching child does **not**
establish which `computer.act` UUID currently owns the host,
whether a legitimate execution is active, or whether restart is
safe. Explicit safe-recovery flags remain false.

Only after a pinned-head full test-gated deployment, run that
passive query once. Do not restart `OpenClaw.app`, the node host
worker, its CUA daemon, the full Gateway, or the running Watcher.
A later recovery procedure requires a separate operator-approved
maintenance window and a specific, verified app-owned Node
lifecycle boundary with preserved identity and pairing.
No guessed execution ID or forced process termination is allowed.

Source:
- https://github.com/openclaw/openclaw/blob/v2026.10.7/apps/macos/Sources/OpenClaw/CuaDriverHostCoordinator.swift
- https://github.com/openclaw/openclaw/blob/v2026.10.7/apps/macos/Sources/OpenClaw/NodeMode/MacNodeModeCoordinator.swift
- https://github.com/openclaw/openclaw/blob/v2026.10.7/docs/cli/node.md

## 2026-10-28 — 172B mixed CUA driver parentage; 173 passive ancestry

172A shipped in GitHub commit
`306a454c3ca3edff2a934018bc41a3712a90ce36`
with **813/813** Mac candidate tests passed.

172B real Mac:
- Connected paired macOS Node advertises native CUA.
- `OpenClaw.app` and `cua-driver` processes both observed.
- `driverDirectAppChildVerified=true`: at least one CUA driver has a
  `OpenClaw` process as its **direct parent**.
- `allObservedDriversDirectAppChildren=false`: not every observed
  CUA driver has an OpenClaw process as its direct parent.
- `selectedNodeHostAttributionVerified=false`;
  `computerExecutionOwnerVerified=false`;
  `computerOwnerStaleVerified=false`;
  `safeToRestartOrDisconnect=false`.
- No input, browsing, app quit, Gateway restart, process signal or
  owner release was attempted.

A driver with a different *direct* parent may still be a **grandchild**
of the app, or may belong to another process tree; the one-hop
observation does **not** prove orphanhood, a conflicting driver, or
which host maintains the currently busy Computer execution.

173 adds `scripts/openclaw-cua-driver-ancestry-readonly.mjs`.
It reads only the unique selected Mac Node's capability metadata,
exact-name process IDs for `OpenClaw` and `cua-driver`, and at most
eight `ps -p PID -o ppid=` ancestor hops for at most eight drivers.
Local PID values never appear in the output. The report contains
only aggregate counts of direct app children, indirect descendants,
chains reaching PID 1 without an observed app ancestor, unknown and
depth-limited chains. Output also explicitly marks current execution
owner, orphanhood and restart safety **unverified**. A parent chain
is a point-in-time observation subject to process exit/PID reuse.

The real Mac run must follow a clean pinned-code update gate.
This is a topology investigation, **not permission to stop, quit,
kill, reset, disconnect or close anything**. Preserve Gateway,
Watcher, other Agent tasks and the user's active desktop.

Source context:
https://github.com/openclaw/openclaw/blob/v2026.10.7/src/plugins/computer-use-registration.ts
https://docs.openclaw.ai/nodes/computer-use

## 2026-10-28 — 174B recovery confirmed; fixture own-execution cleanup hardened

Live 174A and 174B native reads were successful without any
`COMPUTER_HOST_BUSY` response:
- 174A: one `get_cursor_position` observed; self-owned
  `__close_execution` acknowledged.
- 174B: the same freshly generated execution UUID was accepted for
  `get_cursor_position` **and** `list_windows`; both returned
  provider-effect envelopes, with no window list or cursor coordinates
  emitted to ChatGPT. The self-owned close was acknowledged.
- Neither result independently verifies physical release of the
  earlier owner or proves safe background input, but both prove a
  new CUA read-only execution was admitted and serviced.
- No UI input, screen capture, browser interaction, service restart,
  Driver kill or speculative old-owner release occurred.
- **Do not restart OpenClaw.app, Gateway, Watcher or CUA Driver to
  resolve a historical Busy error that current reads no longer show.**

Next acceptance stage is the dedicated temporary native AppKit
`IOANT-CUA-Noninterference-Fixture.app`, with exactly matching
PID + title window matching, then read-only `get_window_state`.
Fixture launches as an accessory, orders its window back, self-quits
after 120 seconds and is normally terminated when its own proof ends.
The observer verifies the frontmost app and mouse coordinates remain
unchanged. No Chrome window or chat tab may be a target.

Before launching this fixture, fix an additional execution lifecycle
edge: if its first `list_windows` native call returned successfully
and a subsequent `get_window_state` call failed with an
unsupported-action or policy classification, the old blanket
`preAdmissionRejected` test suppressed even the self-owned close.
The corrected `shouldCloseOwnFixtureExecution` requires exact-UUID
closure whenever the first call returned, regardless of subsequent
refusals. Only a clear initial pre-admission refusal skips closure.
Three new regression tests protect this invariant; the full Mac
candidate gate must pass before native fixture execution.

The fixture observation phase remains strictly **read-only**; it does
not prove background text entry until a separate non-browser
`set_value` test executes and independently verifies the target value,
focus and mouse unchanged, with precisely scoped authority.

## 2026-10-28 — 175B live fixture title visible, PID identity unrecognized; 176A schema fix

175A deployed `8d601bd8814b782846782fb41bc38035cb903fc0`
with 828/828 Mac regression tests.

175B real Mac after fixture preparation `prepared`, `reused=true`,
source digest `8371dd07643b3861`:
- The dedicated AppKit fixture did launch.
- Native CUA `list_windows` returned `fixtureExactTitleSeen=true`.
- `fixtureProcessIdSeen=false`,
  `fixtureTitleAndPidSameRecord=false`, and
  `fixtureWindowRefSeen=false` (the last is dependent on the exact
  title **and** PID match). The exact target was not accepted:
  `fixture_window_not_found`, `matchedWindowCount=0`.
- `get_window_state` was NOT invoked; no UI input occurred.
- Scoped execution close was attempted and acknowledged, but
  effective owner release remains unverified.
- There was no historical `COMPUTER_HOST_BUSY` or Driver-unavailable
  error in this run. Do not restart OpenClaw.app or Gateway.

The fixture matching code accepted only **flat** per-window PID
properties (`pid`, `processId`, `ownerPid`, etc.).
The official CUA SDK WindowInfo schema represents its owner as
`WindowInfo.app: AppInfo` with `AppInfo.pid`, meaning a genuine
window with an exact title and a nested `app.pid` could fail the
existing matcher. This is an evidence-informed schema hypothesis,
not yet a proof that the user's live 175B payload had that shape.

176A adds strict nested `app.pid` support while preserving all
identity and safety gates: exact known fixture window title, actual
just-launched fixture PID and valid opaque windowRef must coexist
**on one window row**. If flat and nested PID coexist but disagree,
the whole record is refused. Title-only matches and data fused from
different rows remain prohibited. The next synthetic-only report
includes safe flags indicating whether the exact-title row had nested
app.pid, a flat PID, a PID match or a conflict, with no raw process
IDs, other window names, paths or window references.

The 176A Mac full test gate must pass before rerunning fixture
preparation/observation. Still no background input; the pending
`set_value` acceptance requires a later separately reviewed script.

SDK schema:
https://cua.ai/docs/cua-sdk/reference/protocol/env-computer

## 2026-10-28 — 176B investigation and 177A independent WindowServer PID attestation

176A installed `21dd13d6609cf838c772e97c5a6dcf7b2f798abc`
with **833/833** Mac tests. The subsequent 176B live Mac read was
`state=inconclusive` at `phase=window_list` with
`fixtureExactTitleSeen=true`, `fixtureTitleHasNestedAppPid=false`,
`fixtureTitleHasDirectPid=false`, `fixtureProcessIdSeen=false`.
No `get_window_state` or input was executed, the fixture was
terminated by its own scope, and its own native execution close was
acknowledged (effective owner release still not independently proved).
No COMPUTER_HOST_BUSY was observed.

**Root cause source-confirmed:** the OpenClaw 2026.10.7 macOS CUA
projection in `extensions/cua-computer/src/driver-result.ts`,
`projectWindows()`, intentionally constructs a projected row with
`windowRef`, optionally `appName`, `title`, `bounds`,
`isOnScreen` and `minimized`, but does **not** export `pid`.
The underlying native SDK window record *has* a PID, which the OpenClaw
provider consumes to mint the opaque `windowRef`. The OpenClaw
macOS window action executor likewise projects
`windowRef/appName/title/bounds/isOnScreen/minimized` without PID.
The earlier 176A assumption that `app.pid` could appear in the
projected `list_windows` output was based on the lower-level CUA
SDK `WindowInfo`, not on OpenClaw's *actual* output contract.
Do not keep trying to extract a PID from this projected response,
and do not adopt title-only selection.

177A corrects the identity contract without changing any OpenClaw
application binary:
- The disposable AppKit fixture gets a fresh 96-bit random token on
  each launch and displays `IOANT CUA Noninterference Fixture [token]`.
  The token is never logged or returned.
- Its existing compiled binary has a non-GUI `--prove-window` mode:
  use the macOS WindowServer read-only
  `CGWindowListCopyWindowInfo` metadata to ensure **exactly one**
  window with that unpredictable title exists, owned by the exact
  PID returned by this invocation's `spawn` and at layer zero.
  The helper reports only `{"verified":true|false}`, no PID, title,
  other app/window data or screen capture.
- This independent proof must succeed before the first CUA read,
  after CUA `list_windows`, and after CUA
  `get_window_state`; otherwise fail closed.
- From `list_windows`, require exactly one row with the same
  unpredictable title and a valid opaque `windowRef`. A supplied
  flat or nested native PID (on another provider/version) must not
  disagree with the WindowServer owner. A direct/nested PID conflict
  is always rejected.
- Input, browser access, screenshots, focus activation and pointer
  movement remain prohibited. The only process terminated is this
  invocation's own temporary fixture child. Own UUID closure after
  native reads continues to apply.
- If WindowServer cannot read the synthetic title (including due
  to macOS permissions), refuse instead of falling back to title.
- The fixture source fingerprint changes; running
  `openclaw-cua-fixture-prep.mjs` after 177A deploy builds a new
  private AppKit binary. The existing pre-177A fixture is never reused
  under the new fingerprint.

Full Mac candidate tests must pass before running the new fixture.
This remains **read-only**. Later background `set_value` acceptance
is separately gated and not yet authorized by these observations.

Exact OpenClaw provider source:
https://github.com/openclaw/openclaw/blob/v2026.10.7/extensions/cua-computer/src/driver-result.ts
https://github.com/openclaw/openclaw/blob/v2026.10.7/apps/macos/Sources/OpenClaw/ComputerWindowActionExecutor.swift

## 2026-10-28 — 177B real Mac WindowServer proof unavailable; 178A restricted diagnostics

177A installed `b549e35848df9ba78f0aca64ed2061cf3866b9d9`
with 839/839 passing tests. The 177B Mac execution:
- Rebuilt and compiled the new nonce-window AppKit fixture successfully,
  source digest `79a233cac0a4a149`, `reused=false`,
  `compilerFound=true`, `readOnlyStateProbePassed=true`.
- The temporary window was launched without a browser, screenshot,
  keyboard/pointer action or focus activation from the observer.
- At `phase=independent_ownership_proof`, the standalone helper
  returned `window_server_pid_proof_unavailable`, so native
  `computer.act` was **not invoked**, and there is no new Computer
  execution from 177B to release.
- The fixture child was signaled only by its own observation script,
  which retains the 120-second self-termination safeguard.
- The result does **not** prove a macOS permission denial: it could
  reflect missing/redacted window title, missing target owner window,
  incorrect layer, or a startup timing issue.

Apple confirms window names in `CGWindowListCopyWindowInfo` can be
restricted without Screen Recording permission; it does not request
authorization when reading window metadata. Permission state should
be obtained through the supported non-prompting
`CGPreflightScreenCaptureAccess()` rather than inferring it from
which keys were returned. See
https://developer.apple.com/videos/play/wwdc2019/701/
and
https://developer.apple.com/forums/thread/839069

178A adds only a diagnostic branch for **failed pre-CUA ownership proof**:
the precompiled disposable fixture helper supports
`--diagnose-window <pid> <nonce>` and emits one bounded JSON object
with `metadataAvailable`, `screenRecordingGranted`, whether **the
known synthetic PID** owns any normal-layer window or has a
nonempty/title key, and whether the exact synthetic nonce title
was observed at the correct owner/layer. Window counts are only
`none/one/multiple`; no actual PID, title, bounds, window ID,
other process details or WindowServer rows leave the helper.

The Node observer permits a fixed whitelist of these booleans and
count buckets, never raw stdout or an error message. It still
refuses any Computer Use action until an exact owner proof succeeds.
There is no TCC permission request, service change, browser access,
screenshot or desktop input. Changes to the Swift source require
rebuilding the private fixture under the new digest after the full
test gate passes.

**Do not grant extra permissions or widen target selection** without
first examining the safe diagnostic; if the title cannot be read
from outside the target process, consider a non-screen-capture OS
attestation path rather than bypassing identity checks.

## 2026-10-28 — 178B definitive TCC window-title redaction; 179A nonce self-attestation

178A-R1 was deployed at `ba2c0f9a5c69f4706421ae5a2d0a7cbe328841c3`
with 843/843 tests. In real Mac execution 178B:
- AppKit fixture preparation compiled successfully with new digest
  `33433dee9ba6473e`, `readOnlyStateProbePassed=true`.
- It launched without CUA invocation or input, but the independent
  WindowServer exact-title proof failed:
  `phase=independent_ownership_proof`,
  `nativeReadAttempted=false`.
- Redacted `fixtureOSDiagnosis` was available:
  `metadataAvailable=true`,
  `screenRecordingGranted=false`,
  `targetPidWindowCount=multiple`,
  `targetPidNormalWindowSeen=true`,
  `targetPidWindowNameVisible=false`,
  `exactTitleWindowCount=none`,
  `exactTitleOwnerMatched=false`.
  Thus the target process is visible to WindowServer and has normal
  windows, but its title is privacy-redacted in the independent helper.
  It is **not** evidence that CUA failed, nor that the fixture
  failed to create a window.
- No CUA lease was acquired, no driver restart or process reset needed.
- Do not grant Screen Recording permission to the Worker merely to
  validate this disposable fixture, do not remove window ownership
  checks, and do not fall back to an unqualified static window title.

179A replaces the TCC-dependent title check for this **synthetic,
hash-pinned, disposable fixture only**:
1. Launch exactly the private, hash-pinned AppKit binary as one owned
   subprocess with a fresh 96-bit nonce title. Capture *only its own*
   stdout via a private parent-owned pipe.
2. In the fixture process, inspect **its own** `NSWindow`: title exactly
   equals the per-run nonce title, window is visible, not key,
   nonfrontmost; its actual `windowNumber` appears in
   `CGWindowListCopyWindowInfo(.optionIncludingWindow, windowNumber)`
   with owner PID equal to `getpid()` and layer 0. This uses
   WindowServer ID/PID/layer metadata **without accessing window
   title through WindowServer**.
3. The child emits exactly one bounded
   `IOANT_FIXTURE_READY_V1 <nonce> <own-pid> 1|0` line on its
   parent-owned stdout pipe. The observer validates the exact token,
   exact `spawn.pid`, success marker, length and grammar and does
   not log the line, token or PID. The child self-quits within 120 s;
   the parent cleans up only that child.
4. Independent external WindowServer verification uses the binary's
   `--prove-owned-window <pid>` mode: only asserts that the same PID
   currently owns a normal-layer window. This is possible under the
   observed restricted TCC environment and does not read title or
   request Screen Recording permission. It is repeated after CUA
   `list_windows` and `get_window_state` to guard lifetime.
5. Native CUA still must return **exactly one** window with the same
   unpredictable nonce title and a valid `windowRef`, and must
   not report a contradictory PID. Next CUA call targets only this
   ref; no screenshots, browser actions, keyboard or pointer input
   allowed. An uncertain result or any changed foreground/pointer/
   provider generation fails closed.
6. Only a newly acquired execution UUID belonging to this invocation
   is closed. Return acknowledgement is not misrepresented as proof
   that all existing sessions were released.

This proof is explicitly **not** an authorization pattern for any
existing user application or unknown window. Those require
independent, authorized target identity and input scope.
A full 179A Mac test gate and Swift compile are required before the
next read-only live observation. Only after a successful read-only
fixture proof may a separately implemented, scoped, verifiable
background `set_value` test be considered.
