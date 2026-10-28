# Phase 202 — read-only file transfer journal audit and real-file handoff

## Evidence baseline

The existing Phase 201C acceptance is receiver-verified, not just a
browser confirmation. Sender reported status=passed, exit=0,
state=confirmed and byte hash
d856767434a418bc748e05763279ee9edcbbc34f51654ab4a2a638dffaa99b38.
The actual Markdown attachment in the ChatGPT conversation was independently
re-read at 134 bytes with that exact SHA-256. The prior 201C acceptance
record remains in docs/CHATGPT_MAC_FILE_TRANSFER_PHASE200.md, commit
ca995c1357dbbe5b987c1e49dc10d2a4292cc924.

## Phase 202 feature

Script: scripts/openclaw-chatgpt-file-transfer-status.mjs
Test: test/openclaw-chatgpt-file-transfer-status.test.mjs

Use this when the operator wants to know whether a particular exact Mac file
was previously submitted. The status tool:

- Takes ONE explicit absolute path (no directory walks or globbing).
- Enforces the uploader's same roots and file extension policy; checks
  canonical path, file ownership, no symlink/hardlink and byte size.
- Re-reads the file locally and computes SHA-256 (content never printed).
- Derives exactly the same PRIVATE idempotency key as the uploader, then
  opens only the matching protected record under
  ~/Library/Application Support/ioant-openclaw-ops/reports/file-transfer/.
- Never accesses ChatGPT, browser tabs, the upload control or message composer.
  Never writes a journal record, deletes files, sends or retries a message.
- Does not output marker, approval reference, private full path or journal
  content; only bounded state, name, bytes and digest.
- Fails closed on unreadable/unsafe journal or inconsistent file metadata.

### Interpret returned states precisely

- confirmed: sender's private journal has phase=confirmed for the exact
  current path + SHA-256 and consistent metadata. This is NOT independent
  ChatGPT receiver-side byte verification.
- inconclusive: an existing journal has prepared, upload_returned or
  press_intent. Do NOT automatically retry; inspect the conversation and
  pending UI condition before taking any new action.
- unknown: no matching journal exists, which does NOT prove no file has ever
  been uploaded or that a different file revision was not sent.
- blocked: path, runtime, journal permissions or record identity failed
  validation; do not relax the gate.

### Mac Worker invocation (read only)

Runtime directory:
~/Library/Application Support/ioant-openclaw-ops/runtime

Run only after project-update-verify passes for the HEAD containing this
feature, and with the file still present and unchanged:

node "$R/scripts/openclaw-chatgpt-file-transfer-status.mjs" \
  "$HOME/Desktop/IOANT-ChatGPT-General-Upload-20261028.md"

Expected after 201C: state=confirmed, reason=private_journal_confirmed,
size=134 and SHA-256=d856767434a418bc748e05763279ee9edcbbc34f51654ab4a2a638dffaa99b38.
No browser actions should be invoked.

## Real non-synthetic file handoff: approval first

1. Operator supplies ONE exact Mac path and specifically authorizes
   disclosure of that individual file to this bound ChatGPT conversation.
   No implicit selection from an entire folder or unrestricted scans.
2. The assistant uses the existing generic sender in --inspect mode first
   and checks the file digest/size + exact-chat composer readiness.
3. An authorized --send executes once, with the path and hash pinned
   explicitly in the Worker command; an audit approval-reference is included
   for provenance (it is not a security token).
4. Worker returns receipt evidence; the receiver independently reads the
   attached bytes and confirms SHA-256.
5. On failure/inconclusive, do not reissue the send. Use read-only status
   and focused browser diagnostics; preserve every pending journal entry.

Current limits remain: three allowlisted path roots, extension allowlist,
maximum 20 MiB, exact bound conversation, exclusive on-disk transfer journal,
random send marker, and no automatic retry.

**Do not run any --send on user documents just because phase 202 shipped.**
An exact-file, user-visible authorization remains essential.
