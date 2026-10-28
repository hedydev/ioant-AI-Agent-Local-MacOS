# 203C -> 203D native OpenClaw CUA: pointer stability isolation

## Confirmed observation (203C)

203C ran the repository's read-only native AppKit fixture observer on
OpenClaw 2026.10.7, with the connected canonical cua-computer v2 provider.
Its result:

- state=blocked
- reason=foreground_or_pointer_changed_on_launch
- interferenceStage=fixture_launch
- frontmostUnchanged=true
- pointerUnchanged=false
- launchedFixture=true
- performedPointerOrKeyboardInput=false
- performedComputerInput=false
- screenshotTaken=false

The guard triggered before native computer.act actions. There is no evidence
of a failed CUA action in 203C, because it was never invoked. This result
alone does not identify the source of pointer motion. Do not infer that the
CUA driver moved the mouse, that the user moved it, or that the guard was
incorrect.

The previous 203B passive checks saw a living cua-driver process and a
matching socket/PID, with no COMPUTER_HOST_BUSY code in the bounded log
tail. Driver presence and log absence do not prove execution ownership or
permission health. No owner release or service restart is authorized.

## 203D: launch-free passive pointer stability probe

- Script: scripts/openclaw-cua-pointer-stability-passive.mjs
- Test: test/openclaw-cua-pointer-stability-passive.test.mjs
- Fixed read path: the previously prepared, source-fingerprint-specific
  IOANT-CUA-Noninterference-Fixture.app binary, invoked ONLY with --state.
- The helper queries NSWorkspace.frontmostApplication and
  NSEvent.mouseLocation, locally; only bounded statistical results leave
  the Mac, not app names or screen coordinates.
- Twelve sequential --state samples, with 130ms spacing; no AppKit GUI
  window is launched by this command, no native CUA invocation is made.
- Reports whether frontmost app stayed identical, counts of pointer
  coordinate changes, and the largest per-step displacement **band**
  (none, subpixel, under_5px, under_50px, 50px_or_more).
- No change to the existing strict equality guards, sample thresholds,
  ownership gates, CUA driver, or Gateway configuration.

A stable reading would only show that the *launch-free* helper observed
no pointer motion during this sample. It would NOT authorize background
write. Nonzero changes warrant investigation before repeating the
launch test. A failed or inconclusive reading is not permission to disable
the guard.

## Next action

Run project-update-verify; the prior suite had 947 tests and this change
adds eight, so the expected candidate count is 955. Only after a full pass,
invoke the new script from the exact private Runtime and inspect the
bounded JSON output.

Do not automatically re-run the fixture background write. It requires
fresh owned-window proof, stable foreground/pointer state, generation
matching and separate verification that any native invocation has no
unknown outstanding execution owner.
