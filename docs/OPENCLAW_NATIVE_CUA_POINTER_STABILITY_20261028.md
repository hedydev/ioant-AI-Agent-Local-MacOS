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


## Field results: 203D-1, 203D-2, 203E and 203F — accepted

203D-1 private Runtime self-update passed **955/955 tests**, 0 failed, at
Git revision \`3ae8fb578cb2fa8e1aa67dd16ddab7c1dadb0d34\`.

203D-2 task \`openclaw-cua-pointer-stability-probe-20261028-203d2\`
returned \`state=observed\`, \`sampleCount=12\`,
\`frontmostChangeSteps=0\`, \`pointerChangeSteps=0\`,
\`subpixelChangeSteps=0\`, \`largestStepBand=none\`,
\`strictlyStable=true\`. No fixture GUI was launched and no
\`computer.act\` was invoked. This proved stability during one
launch-free sample window only.

203E task \`openclaw-native-cua-fixture-readonly-20261028-203e\`
returned \`state=observed\`,
\`reason=fixture_background_observation_passed\`; fixture launched,
fresh CUA native window/element match, self-attested target,
independent WindowServer PID, stable provider generation and
\`focusAndPointerUnchanged=true\`. No mutation occurred.
Its own scoped \`__close_execution\` request was acknowledged, but
\`ownerReleaseVerified=false\`.

203F task \`openclaw-native-cua-background-write-20261028-203f\`
exited 0 (12,175ms), audit \`IOANT_CUA_FIXTURE_BACKGROUND_WRITE\`,
\`state=observed\`, \`reason=fixture_background_write_verified\`.
The verified, fixed AppKit fixture was the **only** mutation target.
The native \`computer.act\` \`set_value\` used
\`deliveryMode=background\` with fresh window, element, observation,
execution and nonce identity. It returned:

- \`performedComputerInput=true\`,
  \`mutatingActionAttempted=true\`,
  \`backgroundDeliveryRequested=true\`, \`writeIssued=true\`.
- \`fixtureWindowMatched\`, \`fixtureElementMatched\`,
  \`fixtureSelfAttested\`, \`independentOSPidVerified\` all true.
- Five independent prewrite checks all true: fixture process alive,
  independently validated owner, unchanged provider generation and
  capability set, unchanged frontmost app and pointer.
- \`nativeReadbackMatched=true\`, \`fixtureStillOwned=true\`,
  \`providerGenerationStable=true\`,
  \`focusAndPointerUnchanged=true\`.
- No browser access, ChatGPT content read, screenshots or global
  pointer/keyboard events were performed.
- \`ownExecutionClosure.attempted=true\`,
  \`acknowledged=true\`, **\`ownerReleaseVerified=false\`**.
  \`existingComputerOwnerReleased=false\`.

**Accepted:** the current native CUA provider can perform an independent,
verified background element write without visibly altering the shared
foreground/pointer state, and independently read back that synthetic
value in the same scoped test execution.

**Historical comparison:** a successful native fixture background write
was already observed in 187B and a separate subsequent read-only
native reacquisition in 191B, documented in
\`docs/MAC_CUA_NATIVE_OBSERVATION_20261028.md\`. 203F is a
**repeat acceptance**, not the first historical success.

**Limits:** this is not general third-party app authorization, arbitrary
screen or mouse control, and not a proof of effective execution-owner
release. Do not clear the owner, bypass permission guards, weaken focus
or pointer equality, automatically retry a write or target Chrome or
ChatGPT via native CUA.

Next: one independent read-only \`get_cursor_position\` invocation with
its own fresh execution ID, via the existing
\`scripts/openclaw-native-computer-readonly-smoke.mjs\`, to verify
that a follow-on CUA request can be admitted after 203F. A successful
subsequent read confirms *that particular later admission*, not the
general release of the provider's ownership registry. A failure is
not permission to force-close existing executions or restart services.
