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
