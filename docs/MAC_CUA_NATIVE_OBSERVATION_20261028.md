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
