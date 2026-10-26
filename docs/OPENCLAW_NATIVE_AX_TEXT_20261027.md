# OpenClaw App native AX text field — 2026-10-27

## Evidence
Actual `mac-terminal` diagnostic (operator-approved) returned `APP_COUNT 1`, `AX_TRUSTED true`, `AXWebArea` at depth 4 and **exactly one `AXTextArea` at depth 9**. No text contents were read or sent. The previous `mac-window-text` AppleScript `entire contents` traversal took 20 seconds and timed out; foreground checks also failed while the user was in ChatGPT/Chrome.

## Change
Only for the already enrolled exact bundle ID `ai.openclaw.mac`, `runWindowText` first uses `/usr/bin/swift` to run `stage2/openclaw-native-ax.swift`. The Swift helper:

- Requires Accessibility trust and one running `ai.openclaw.mac` process, one window.
- Traverses **window children** rather than application menu bar, with bounds on depth (16), nodes (360/400) and children per node (100), and uses bounded AX messaging timeouts.
- Requires exactly one `AXTextArea`/`AXTextField`, rejects disabled or ambiguous editors, and refuses to type when the accessible editor's existing value is non-empty. No editor value or chat content appears in stdout.
- Has a **read-only** `probe` mode that reports role, candidate count, focus settable flag, existing draft presence (boolean) and visited node count without returning any text.
- In `focus` mode verifies the specific app identity, activates it, waits until foreground, sets and rechecks focused editor role, and returns only `AX_FOCUS_READY`.
- Only after success does a short AppleScript verify the exact frontmost app name, bundle ID and focused editor role, then `keystroke` bounded text. `submit:false` sends no Return. It does not use the clipboard or disclose text in the Worker reply.

The previous AppleScript flow is retained for other operator-enrolled apps, unchanged. Existing user consent, per-conversation binding, terminal grants and LaunchAgent remain unchanged. Failure after partial input is **inconclusive** and must not be blindly retried.

## Deployment and acceptance

1. `project-update-verify` runs the full Node suite. A macOS-only regression checks Swift type-checking via `/usr/bin/swiftc -typecheck`, preventing silent distribution of invalid native source.
2. On the authorized Worker, run read-only:
   `/usr/bin/swift "$HOME/Library/Application Support/ioant-openclaw-ops/runtime/stage2/openclaw-native-ax.swift" probe ai.openclaw.mac`
   This should report one editor and `focusSettable=yes`. If not, do **not** type; fix the precise failure.
3. Only after this proof, call `mac-window-text` with `app=openclaw`, `submit=false`, a unique test phrase and observe the draft in the real App. Do not claim actual text entry based on a helper's returned status alone.
4. After the operator visually confirms draft content, optionally test `submit=true`, then inspect actual Agent response. `keys_sent` is **not** delivery proof.

Current state until real UI proof: **source-level implementation only, not successful App input yet**.
