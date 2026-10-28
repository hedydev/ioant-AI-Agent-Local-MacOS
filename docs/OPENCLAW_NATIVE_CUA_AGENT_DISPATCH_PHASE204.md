# Phase 204A — fixed native CUA read-only Agent/Worker action

## 203F–203G accepted evidence (2026-10-28)

203F native CUA successfully wrote a synthetic value into the one
independently verified IOANT-owned AppKit fixture using
computer.act set_value, deliveryMode=background, with five passing
prewrite gates, exact native readback and unchanged foreground/pointer.
No browser, screen capture, global pointer or keyboard input occurred.
The scoped close acknowledgement did NOT independently prove execution
owner release.

203G independently invoked the existing
scripts/openclaw-native-computer-readonly-smoke.mjs from the exact
runtime using its OWN new execution ID, and returned:
- state=observed, reason=native_read_completed
- invokedComputerAct=true, requestedAction=get_cursor_position
- readOnly=true, mutatedDesktop=false, browserAccess=false
- ownExecutionClosure.attempted=true, acknowledged=true,
  ownerReleaseVerified=false; existingOwnerReleased=false

This confirms one subsequent read-only admission after the 203F write,
not release of every possible CUA execution lease. It repeats similar
187B/191B acceptance and must not be misrepresented as the first
historical successful background write.

## 204A implementation

Adds a new **parameter-free structured Worker action**:

{"protocol":"ioant-mac-ops-v1",
 "id":"native-cua-read-unique-id",
 "action":"openclaw-native-cua-readonly"}

- stage2/protocol.mjs recognizes this exact action as KNOWN, but not
  automatically authorized. Extra cwd, command, app, nodeId, target,
  params, coordinates or other caller fields are rejected.
- stage2/chatgpt-loop.mjs routes it only when the Mac-local watcher
  already has --enable-gui-readonly. It is excluded from the separate
  AliceAI Project scope.
- stage2/runner.mjs independently checks enableGuiReadonly===true
  before invoking one *fixed* Node script. It never executes a command
  from the ChatGPT message for this action.
- scripts/openclaw-native-cua-agent-readonly.mjs verifies the
  canonical connected cua-computer v2 Provider both before and after
  the existing proven one-shot native cursor smoke. It invokes
  scripts/openclaw-native-computer-readonly-smoke.mjs exactly once,
  preserving its fresh execution ID and scoped __close_execution
  attempt. It never retries after a failed or ambiguous call.
- Result is sanitized to fixed booleans/enums and prints no raw cursor
  coordinates, node identifiers, process IDs, window metadata, app
  names, security tokens, CUA observation IDs or native errors.
- If the Provider is unknown, changed, or the read lacks a verified
  native action envelope, it blocks or returns inconclusive.
- The wrapper deliberately returns providerGenerationVerified=false and
  computerOwnerReleasedVerified=false. Two separate provider identity
  checks do NOT prove unchanged generation or global lease release.

Tests: test/openclaw-native-cua-agent-readonly.test.mjs (11 cases).

The task does not include list_windows, get_window_state, set_value,
app inventory, screenshot, window manipulation, keypress, browser
control or file upload. It is only a minimal read-only Worker-to-native
CUA integration smoke, not general desktop-task orchestration.

## Deployment/acceptance

Before task execution, perform guarded project-update-verify of
the candidate source; the prior complete Mac suite was 955/955.
The current candidate adds 11 tests (expected 966). Do not declare
deployment until full Mac suite passes, and do not treat exit 0
without an IOANT_NATIVE_CUA_AGENT_READONLY audit as native success.

After deployment, send one new exact task ID containing only the
protocol, ID and action shown above. The watcher must have its
existing local --enable-gui-readonly opt-in. Expected:
- Status passed
- audit IOANT_NATIVE_CUA_AGENT_READONLY
- state observed, reason native_cua_readonly_completed
- requestedAction get_cursor_position
- ownExecutionCloseAcknowledged true or false (no release claim).

## Further work, separate approvals required

For *real third-party app* background writes, design an explicit
operator-approved app/window/element action allowlist, one-shot
persistent dispatch records, independent target attestation and
post-write verification, and enforce the existing background policy
in a real executor. The earlier fixture-only successful set_value is
not that authorization. Never use native CUA to bypass browser-host
restrictions or arbitrarily control the user's active desktop.
