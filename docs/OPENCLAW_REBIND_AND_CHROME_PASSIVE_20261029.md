# OpenClaw Ops Worker Chat rebinding & Chrome MCP passive probe — 2026-10-29

## Verified migration and tests

- Installed Mac Ops Worker was originally bound to conversation `6ae18e93-e2a0-83ec-aac9-88105079f208`. Operator used scoped `launchctl kill SIGTERM` and independently verified the service and its observed children exited.
- Protected `project-self-update.mjs` advanced runtime to `fbbfbd52946fa2e12b2b087fa0c1d0026bb83fbd`; 1099/1099 tests passed. Source and runtime aligned, clean.
- Operator-only `ops-rebind.mjs rebind` returned `rebound_unloaded` for successor Chat `6ae25a0b-9b38-83ec-b2df-9db1f40f9488` in the same Ops Project. Separate `start` took effect. Host status verified PID `78113` running with the new conversation ID (point-in-time).
- Exact new Chat `project-head` canary `openclaw-rebind-canary-20261029-0491` returned real user-role feedback `passed`, HEAD `fbbfbd52946fa2e12b2b087fa0c1d0026bb83fbd`. This proves one read-only task roundtrip, not unrestricted browser or Alice Chat access.
- After old terminal grant was explicitly revoked, operator enabled terminal grant for **new** Ops conversation; `mac-terminal-access.mjs status` reported `enabled` for `6ae25a0b-9b38-83ec-b2df-9db1f40f9488`. No other Chat grant transferred.
- Alice Coordinator `com.ioant.openclaw.alice-coordinator` remains separate; last observed PID `3199`, exact Alice Chat `6ade11a5-f0c0-83ec-add1-8a0cff00c938`. No handshake replay or confirmed Alice message delivery.

## Chrome MCP investigation (still unresolved)

- Protected GitHub update `openclaw-chrome-mcp-passive-deploy-20261029-0492` installed `83d2e26d6bb73f5a903dfa4c1b95aca0b346bcc1` with 1103/1103 tests passing; runtime reloading requested (not independently proven by the same update receipt).
- Initial `mac-terminal` probe `0493` was `approval_required: grant_bound_to_other_conversation` — correctly blocked. New-chat grant was separately enabled.
- Probe `openclaw-chrome-mcp-passive-probe-20261029-0494` reported exit 0 but **no JSON output**. Source analysis found CLI entrypoint compared `process.argv[1]` to URL `.pathname`, which encodes literal spaces in `~/Library/Application Support` as `%20`. Thus this probe is **not** evidence of successful port permission inspection.
- Fix replaces URL pathname with `fileURLToPath(import.meta.url)` and adds an actual CLI subprocess regression executed from a temp path with spaces. This documentation and fix are only GitHub candidates until the next full Mac test-gated deploy.
- Pending next: protected project-update-verify; then a **new ID** passive probe from the freshly deployed Runtime. Only metadata and process identity, never port contents, raw CDP/browser permission bypass, TCC database mutation or Gateway/browser restarts.
- Existing evidence proves the Chrome `DevToolsActivePort` exists but the Worker could not read it; neither Gateway read permission nor TCC/ACL root cause has yet been independently proven.

Do not treat the GitHub code commit itself as a deployment or as acceptance of Chrome MCP access.

## Follow-up test-gate failure and bounded path fix

- Real Mac Worker receipt `openclaw-chrome-mcp-cli-fix-deploy-20261029-0495`: protected candidate update **blocked** with `candidate_tests_failed` (1104 total, 1103 passed, one failed). The failure evidence did not include an assertion location or raw logs; it does **not** prove which test failed. Runtime must remain at the last accepted `83d2e26d6bb73f5a903dfa4c1b95aca0b346bcc1`; no partial deployment should be claimed.
- Strong candidate root cause: on macOS, the temp location used by the new subprocess test may use the `/var` alias for `/private/var`; `fileURLToPath(import.meta.url)` decodes space but a literal equality with `process.argv[1]` is not robust across this alias. The fix compares `realpathSync` of both paths and adds a deterministic symlinked-directory-with-spaces CLI test. This remains a **hypothesis** until the next protected suite confirms it.
- The probe `0494` still has no diagnostic JSON; do not infer any DevToolsActivePort/Gateway/TCC conclusion from its zero exit code. Do not retry the failed deployment task ID or inspect Chrome via unauthorized browser/CDP surfaces.

## Passive permission audit — real Mac receipt 0498

- `openclaw-chrome-mcp-passive-probe-20261029-0498`: **passed**, exit 0, 181 ms, bounded `IOANT_CHROME_MCP_PERMISSION_PASSIVE` JSON returned after successful tested update to `840f0684cfe6311ca2bb2f213bc5bff2698cd485` (1105/1105 PASS).
- Diagnostic process UID=EUID=501. Chrome profile and ancestors are UID 501 and have POSIX traverse/read permission according to metadata. Chrome profile dir `700`; `DevToolsActivePort` file `644`; both ACL count 0. Home and Library each have one ACL entry. This is **not evidence of TCC cause**, actual port opening, or successful browser attachment.
- Gateway returned `process_identity_unavailable`, so matching Gateway and Worker EUID is **not proven**.
- Source review plus macOS `ps(1)` documentation identifies a script bug: existing `ps -o uid=,euid=` asks for an unsupported Darwin keyword. On macOS, `uid` is the effective UID and `ruid` is the real UID. Next candidate uses `uid=,ruid=` and preserves labelled return fields. The `ps` cause remains to be verified by an actual new Mac run.
- New sanitized ACL classification distinguishes ordinary `deny delete` ACEs from a rule that mentions `deny read` or `deny search`, without releasing identities/principals or raw `ls` output. It does **not** establish effective TCC/sandbox privileges or interpret complex ACL principal matching.
- Next steps: GitHub guarded update and full tests (new candidate only); a fresh unique-ID passive probe. Do not change permissions, scrape Chrome, open/read `DevToolsActivePort`, or restart Gateway/Chrome to force this result.
