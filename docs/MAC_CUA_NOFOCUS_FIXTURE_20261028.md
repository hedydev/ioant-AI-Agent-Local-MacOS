# Native CUA no-focus proof — fixture preparation (2026-10-28)

## Evidence already accepted

153B on the operator's Mac reports provider `cua-computer`,
contractVersion 2, valid descriptor, background delivery advertised and
`list_apps` advertised. The active system cursor overlay capability
`agentCursor` is false. None of these advertised capabilities independently
proves a no-focus-steal background action.

Earlier get_cursor_position succeeded. `list_apps` had a CLI exit-1
failure before the v2 provider identity was properly recognized. Do not
retry unrelated browser/UI actions to compensate for this diagnostic.

## Official contract for the next test

- OpenClaw uses `nodes invoke --command computer.act` with a UUID
  `executionId` for each bounded native execution. It supports
  `list_windows`, `get_window_state` and `set_value` under
  `contractVersion: 2`.
- `get_window_state` needs an actual `windowRef`, with
  `includeScreenshot: false` supported by CUA. It returns an
  `observationId` and `elementRef` tokens.
- `set_value` requires `windowRef`, `elementRef`, `observationId`,
  `value`, and explicit `deliveryMode: "background"`.
- `list_windows` cannot be filtered by an app string at the OpenClaw
  `computer.act` protocol boundary, so the proof consumer must discard
  all raw titles except one exact synthetic fixture identity. No browser
  window inspection or browser content should be exported.
- Background only applies to exact window input. Desktop actions remain
  foreground regardless of a background hint. Never silently escalate.

References:
https://docs.openclaw.ai/nodes/computer-use
https://cua.ai/docs/cua-driver/reference/mcp-tools

## Prepared fixture

`fixtures/cua-noninterference/Fixture.swift` defines a synthetic AppKit
window with a single `IOANT CUA Fixture Editable` text field, no
activation and `NSApplicationActivationPolicy.accessory`. It orders
the window back and auto-terminates after 120 seconds.

`scripts/openclaw-cua-fixture-prep.mjs` only compiles a hash-scoped
binary in a private local fixture directory, performs a read-only
`--state` smoke, and never launches the GUI or invokes Computer Use.
The native compilation itself is NOT validated until run on the Mac.

## Next acceptance, not yet implemented or proven

1. Deploy and run the private compilation script. A passed Node test
   does not prove the AppKit compiler is available or that it ran.
2. A separately developed one-shot native proof must launch only this
   background fixture, verify its PID and exact window/element references,
   and record native `set_value` outcome through the existing paired
   node with its current CUA generation.
3. Before mutation and after verification, independently read only
   frontmost application bundle identity and physical cursor coordinates.
   Require no focus change, no pointer change, and synthetic text field
   value read back equal to the expected nonce. No foreground fallback.
4. On missing/ambiguous fixture identity, inaccessible AX element,
   unexpected provider generation, browser-scope conflict, or changed
   frontmost application, report an inconclusive or failed result. Do
   not retry input or move to a different app.
5. If macOS CUA is unable to complete background input without
   interference, keep the operator's shared desktop protected and
   evaluate a separate desktop/worker environment instead.

No mouse, keyboard, browser, WindowServer or fixture GUI operation has
been performed by the preparation commit.
