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
