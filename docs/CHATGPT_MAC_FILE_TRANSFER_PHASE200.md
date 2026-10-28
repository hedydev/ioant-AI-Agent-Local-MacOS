# Exact-chat Mac file handoff — Phase 200

## Validated foundation

The synthetic file handoff sent a real attachment into the exact bound ChatGPT
conversation, and the receiving assistant read and verified the file. The
historic 196C sender reply was inconclusive due to a same-role-node receipt
predicate. The subsequent read-only 199B test verified a unique marker,
file attachment in its own user-turn container, and exactly one associated
user turn. The 199A full test suite passed 922/922.

## Phase 200 implementation

- Script: scripts/openclaw-chatgpt-approved-file-transfer.mjs
- Shared scoped verifier: stage2/chatgpt-upload-scoped-receipt.mjs
- Tests: test/openclaw-chatgpt-approved-file-transfer.test.mjs
- Bound conversation remains the exact Project chat ending in
  6ae18e93-e2a0-83ec-aac9-88105079f208 in Chrome relay profile chrome.
- No ChatGPT conversation switching, other app control, screenshot or
  global mouse / keyboard actuation is used.

The script provides:

1. INSPECT: validate an exact absolute canonical file path, owner, symlink
   status, hardlink count, permitted extension, 1..20MiB size, and read the
   file locally for a SHA-256. Verify the existing exact chat is available
   and its composer is empty. No upload and no message sent.
2. SEND: only after the user explicitly authorizes the exact file in the
   ChatGPT conversation, the assistant may run the same script with an
   approval-reference label. That label is for audit only: it does NOT
   grant access, perform cryptographic attestation or replace consent.
   Stage the immutable read bytes into the OpenClaw uploads directory, use
   its exact UI upload input, verify the attachment is in the composer,
   type a content/path-bound marker, persist press_intent, press Enter ONCE,
   and confirm one user-turn-scoped filename attachment.
3. No retries after an uncertain send. A durable private record keyed by
   exact conversation, canonical file path, and content hash prevents
   accidental repeat attempts. Existing ambiguous records are not deleted.
   Do not clear pending records to force another send.

Permitted roots initially: ~/Desktop, ~/Downloads, and
~/Documents/workspace (including their subdirectories). Files outside
these roots require a separate scoped review; do not silently expand roots.
Permitted extensions: txt, md, log, json, jsonl, csv, tsv, pdf, zip,
png, jpg, jpeg, webp, gif, docx, xlsx, pptx. Maximum: 20 MiB.
Use only explicitly selected files; do not recursively scan directories.

## CLI invocations

- Readiness (no upload):
  node scripts/openclaw-chatgpt-approved-file-transfer.mjs --inspect /ABS/PATH/FILE.pdf
- Approved one-time delivery:
  node scripts/openclaw-chatgpt-approved-file-transfer.mjs --send /ABS/PATH/FILE.pdf --approval-reference operator-approved-task-id

Only execute within the exact validated private Worker Runtime and after
project-update-verify passes the complete test suite.

## Acceptance phases

- 200A: full private Runtime update and test suite; no file disclosure.
- 200B: inspect a synthetic generated .md test file using the generic script.
- 200C: separately authorize that exact synthetic file and test sending it
  to the bound conversation; confirm it on the receiver. No other file is
  in scope.
- 200D: first user-approved non-synthetic file transfer, after the user
  provides or explicitly approves its exact full path.

Never claim a successful Mac-to-ChatGPT receipt from the browser command
return alone. The receiver must independently confirm the attachment
exists and its actual bytes can be read.


## 200B passed; 200C blocked before upload — receipt spoof regression

- 200A-R1 deployed the generic script successfully with **935/935 tests**,
  Runtime revision f4b25ef0d0b698e4443df310207eef14fbdc9af0.
- 200B exact-file inspect succeeded for
  /Users/ted/Desktop/IOANT-ChatGPT-General-Upload-20261028.md;
  134 bytes, SHA-256
  d856767434a418bc748e05763279ee9edcbbc34f51654ab4a2a638dffaa99b38,
  no upload.
- 200C returned **blocked** / delivery_already_visible during **preflight**;
  uploadTriggered=false, messageSent=false. No attachment was sent or received.
- Root-cause code review: the original scoped receipt accepted
  localAttribute OR localFile (ordinary body text containing the filename).
  Previously printed 200B feedback in the ChatGPT user role included BOTH
  the deterministic marker and filename; the DOM-only pre-send existence
  check mistook this plain feedback for a delivered attachment.
- This is a **false-positive receipt vulnerability**, not success; do not
  clear a journal or force uploads as a workaround. This preflight error
  occurred before the per-file private send lock was created.

### Safety repair

1. Scoped receipt confirmation now requires a filename-bearing
   title/aria-label in a distinct element *outside* the marked user text
   bubble, inside its unique, bounded single-user-turn parent. Plain pasted
   file names and attributes inside the marked text bubble cannot confirm.
2. Content/path SHA-256 remains the deterministic **private journal key**.
   Each authorized send generates an unpredictable, **new 128-bit random**
   delivery marker. Inspect reports do not expose that marker.
3. The previously unsafe pre-send browser-delivery test was removed; a
   private create-exclusive journal record provides fail-closed duplicate
   prevention. The marker is never echoed in worker feedback, even after
   successful delivery, to avoid creating a second user-role marker.
4. Regressions include the exact 200C log-text false-positive, an attribute
   in user text, an attachment in another user turn, shared multi-turn
   wrapper, duplicate marker, wrong chat, and malformed proof.

### Next verification

Run full candidate tests and guarded self-update; inspect the same original
134-byte synthetic file on the updated Runtime, then use a fresh explicitly
authorized one-time send. The old 200C failure remains recorded as a failure.
The new sender should not disclose files outside the exact approved scope.
