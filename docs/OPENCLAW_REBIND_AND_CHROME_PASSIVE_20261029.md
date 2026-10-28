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
