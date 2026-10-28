# ChatGPT exact-conversation attachment handoff — 2026-10-28

## Goal and scope

Transfer an operator-approved Mac file to the exact ChatGPT conversation via the
connected OpenClaw Chrome browser relay, then independently confirm that the
conversation received a real file attachment and ChatGPT can read its bytes.

Current implementation is **synthetic fixture only**; it is NOT an arbitrary-path
uploader or permission to disclose unrelated user files.

## Proven environment

- Repository: `hedydev/ioant-AI-Agent-Local-MacOS`.
- Bound ChatGPT Project conversation:
  `6ae18e93-e2a0-83ec-aac9-88105079f208` in
  `g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu`.
- OpenClaw Chrome browser relay profile: `chrome`.
- Source and runtime aligned previously at `a807f1232fd3a36e1e59cbc0b1283b010235250c`
  (both gated self-updates passed 897/897).
- Synthetic attachment script:
  `scripts/openclaw-chatgpt-fixture-upload.mjs`.
- Script tests: `test/openclaw-chatgpt-fixture-upload.test.mjs`.
- Deployment 196A updated the **private runtime** to
  `299c63ecb5b04d939d1090121f853b8a38c88ada`,
  full suite **904/904 passed, 0 failed**.

## Discovery and dry-run

- **193:** synthetic file created on Desktop; CLI upload command advertised;
  exactly one matching ChatGPT conversation tab.
- **194:** one `Add files and more` control in that conversation, read-only.
- **195:** one matching local upload menu item, inspection only, no upload.
- **196B:** deployed `--inspect` returned `state=observed`,
  `reason=unique_local_upload_ref_confirmed`,
  `uploadTriggered=false`, `messageSent=false`.

## 196C — receiver confirms actual delivery, sender receipt detector inconclusive

The exact ChatGPT conversation received a **user-role message** containing
the one-shot synthetic marker:

`IOANT-UPLOAD-FIXTURE-20261028-196`

The same user turn included a real file attachment:

`IOANT-ChatGPT-Upload-Fixture-20261028.txt`

ChatGPT was able to access the attached bytes (not just a filename), and a
separate container-side check established:

- Size: **92 bytes**.
- SHA-256: `9c9c63fe8a4c6239c5e602520d0e670d1b96dc0f088a293c8cdc24eb56483848`.
- Exact UTF-8 bytes:

```text
IOANT CHATGPT FILE UPLOAD TEST
Synthetic content only.
This file contains no personal data.
```

These prove the actual file reached this conversation and was readable.

**Separately**, the Mac Worker task
`openclaw-chatgpt-file-upload-send-20261028-196c` returned:
`Action=mac-terminal`, `Status=failed`, exit code 1, elapsed 60,257 ms;
script `state=inconclusive`,
`reason=attachment_receipt_unconfirmed`,
`uploadTriggered=true`, `messageSent="unknown"`,
`noAutomaticRetry=true`.

This is a **sender-side confirmation false negative** against independently
observed receiver delivery, NOT proof of transport failure and NOT grounds for
re-uploading. The sender's current receipt logic requires both synthetic
message marker and filename to occur in the *same role-scoped DOM element*
within six 1-second-spaced checks. The filename may appear in a separate
attachment component, or ChatGPT rendering/feedback may lag beyond that
window. The specific reason the sender DOM probe missed the received message
has not yet been independently diagnosed. Do not claim a proven root cause.

**Accepted**: exact-chat synthetic file upload, message delivery, and
receiver-side byte verification.

**Unresolved**: the browser-side receipt detector and the sender's persisted
`press_intent` state; the script's own status must NOT be retroactively
represented as `observed`. No automatic retries, second Enter, record
deletion, browser navigation, or upload of another file.

## Next safe work

1. Inspect only fixed Boolean structure around the already delivered user
   turn: marker found in role-scoped message, filename in same or separate
   attachment subtree, and exact conversation URL. Emit no raw chat content,
   arbitrary titles, tokens or unrelated filenames.
2. Improve receipt detection using that *observed* DOM topology, with pure
   regression tests and full guarded self-update. No re-send during diagnosis.
3. Before generalizing to specified local file paths, require explicit
   per-file user approval, strict root/path/type/size and symlink validation,
   staging and cleanup, exact-chat locking, idempotent send state, and
   independent receiver confirmation. Treat uploading as disclosure.
