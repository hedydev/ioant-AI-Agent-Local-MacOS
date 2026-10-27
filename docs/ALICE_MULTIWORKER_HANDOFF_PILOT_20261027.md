# AliceAI separate ChatGPT Project / multi-Worker handoff pilot — 2026-10-27

## Verified registration inputs (not a running Worker)

- AliceAI user-selected Project URL: `https://chatgpt.com/g/g-p-6acaef839af081919426a885b3209f54-ai-mc-alice/c/6ade11a5-f0c0-83ec-add1-8a0cff00c938`.
- Project ID: `g-p-6acaef839af081919426a885b3209f54`; conversation ID: `6ade11a5-f0c0-83ec-add1-8a0cff00c938`.
- Repository: `hedydev/ioant-AI-Minecraft-Alice` main, confirmed present. OpenClaw Agent identity: `alice-ai`, **binding only**, no new tools granted.
- Existing `openclaw-workflow` Project, Chat, Agent and foreground Worker remain unchanged.
- Registry entry and unit tests are **source-only** until the Mac candidate suite and a controlled update are complete. URL identity is not Chrome DOM/Relay visibility evidence.

## Proposed architecture

One trusted Chat I/O coordinator per Project conversation owns browser writes and conversation locks; independent execution Workers (e.g., planning, code, test, review) do NOT send directly to the same composer. The coordinator uses a private durable lease/receipt workflow ledger, role-specific capability manifests, and a verification barrier before advancing the task DAG. Do not treat Agent identity as authorization for host commands.

## Phased test (isolation first)

1. Validate the repo registry and full node suite without changing live services. Confirm exact AliceAI tab visibility in existing authorized Chrome profile via read-only `tabs` then exact DOM probe, never guess target IDs.
2. Before starting a second coordinator, verify per-conversation lock identity, state/reports isolation, independent launcher lifetime, and per-Project capabilities. Audit any global flags shared with the existing Worker. Do not automatically reuse current `mac-terminal` privilege in AliceAI chat.
3. Start a **separately operator-approved** AliceAI coordinator only after an isolated canary. First use `project-head`/read-only probes pinned to the AliceAI repository; prevent the existing `project-head` handler from accidentally reporting the ops repository.
4. Rehearse the handoff state machine without browser writes. Later, user-approved real successor creation must be in the same AliceAI Project, with verified URL+DOM, private handoff content digest, journalled press intent and user-role receipt, verified successor canary, and confirmed retirement of the old coordinator before route promotion.
5. Never mutate live Minecraft, Mint BDS 17879/17880, production AliceAI, other Project chats or the OpenClaw Gateway during this pilot.

## Current non-goals

No browser clicking, chat creation, Agent model changes, LaunchAgent installation, local workflow scheduler deployment or restart of existing Worker. No reliable ChatGPT remaining-context percentage is exposed; manual handoff is the initial trigger. A registered URL is not yet a verified independent Worker.

## AliceAI isolated coordinator code (2026-10-27, candidate until Mac acceptance)

- `stage2/project-worker-scope.mjs` pins `alice-ai` strictly to the verified registered Project ID, conversation ID, repository and Agent. Chrome-only.
- `scripts/alice-coordinator-readonly.sh --once|--watch` opens no browser tabs, restarts no Gateway and has no host or repo writes. `--once` only confirms exact registered DOM/composer. `--watch` may return a bounded `openclaw-gui-readonly-probe` receipt to the *AliceAI* chat if and only if that chat independently emits the matching structured task. It refuses `--initialize` and all privileged opt-in flags.
- Any other action (even normally authorized `project-head`, `mac-terminal`, `mac-window-text`, self-update, SSH/Mint and model writes) is `approval_required` under the Alice scope; a new Alice-specific repo-pinned execution worker will be designed and tested separately.
- The existing `openclaw-workflow` invocation without `--project-key` is unchanged and retains its own operator-selected privileges. Per-conversation state and lock remain separate by exact chat hash. No new LaunchAgent is installed by this commit.
- Project identity is checked both in `browser tabs` and after targeted DOM evaluation; the same Chat ID inside another Project is rejected for Alice.
- **Candidate only**: do not claim a second live Worker until full Mac test suite, pinned project self-update and independent `--once` canary pass. Starting the watch loop is a separate task and must not launch via the current interactive Worker without lifecycle checks.

### 2026-10-27 — First Mac --once failure and candidate diagnosis

The first live `--once` result `openclaw-alice-coordinator-once-20261027-096` failed after ~1.2 s with `[loop-log] unexpected`, before a proven AliceAI browser read. The launcher had unconditionally supplied the external `PROJECT_DEV_CACHE/logs/chatgpt-loop` directory to the private diagnostic log initializer. The existing Mac Worker can inherit `IOANT_BACKGROUND_SAFE_REPORTS=1`, which makes `stage2/diagnostic-log.mjs` require `~/Library/Application Support/ioant-openclaw-ops/logs/chatgpt-loop`. This discrepancy is a code-level root-cause candidate, not yet a proven environment observation.

The launch script now mirrors the established Stage-2 launcher branch for background/private local logs versus foreground/LunaDrive logs; the separate operator-facing acceptance trace remains on Desktop. Added fixtures exercise both exact diagnostic initialization modes without Chrome/Gateway access. Do not claim live success before Mac worker confirms the background flag and reruns `--once`. No changes to normal OpenClaw worker, Gateway, ChatGPT binding, AliceAI production, BDS or world.

## 2026-10-27 — AliceAI per-user LaunchAgent candidate (independent service)

The read-only-on-host AliceAI coordinator has passed one-shot live Mac acceptance (513/513 tests, exact AliceAI Project+Chat DOM and composer). The first standalone user-service candidate adds the **separate** label \`com.ioant.openclaw.alice-coordinator\`, with \`stage2/alice-coordinator-service.mjs\` as the sole fixed installer/status/uninstaller.

- Launch from the current verified **private runtime** under \`~/Library/Application Support/ioant-openclaw-ops/runtime\`; never a Git candidate archive, Documents checkout, download, arbitrary file, or ChatGPT-supplied argument.
- Fixed \`/bin/bash .../scripts/alice-coordinator-readonly.sh --watch\`. This script resolves only the registered AliceAI Project/Chat, pins Chrome profile and makes no Gateway restart, Minecraft BDS, SSH or unrestricted terminal calls. The watcher can send bounded task denial or a read-only GUI observation *receipt* to the AliceAI Chat; “read-only” describes host capabilities, **not** zero ChatGPT message writes.
- Zero privilege inherit: AliceAI scope rejects existing \`mac-terminal\`, \`mac-window-text\`, Mint, self-update and all other host actions. Project uniqueness and per-conversation lock are independent from OpenClaw workflow.
- Private launchd stdout/stderr logs: \`~/Library/Logs/ioant-openclaw-ops/alice-coordinator/{stdout,stderr}.log\`, mode 0600. Node diagnostic logs remain private under local \`Application Support\` when \`IOANT_BACKGROUND_SAFE_REPORTS=1\`. A separate **operator task** exports a sanitized acceptance report on Desktop; do not assign Desktop as launchd log output, which would fail TCC.
- \`RunAtLoad=true\`, \`KeepAlive=false\`; no looped relaunch on failure. No changes to \`com.ioant.openclaw.safe-watcher\` and no automatic installation from Git checkout.
- The service manager's only operations are \`install\`, \`status\`, \`uninstall\`, with exact own-label/template matching before modification; uncertain launchctl state, foreign plist, existing Alice lock or non-private runtime stops without force/cleanup.
- For the first installation, require all Mac native tests, protected \`project-update-verify\`, then explicit delegated Mac Worker install command. Verify two distinct running PIDs **and** AliceAI exact-tab logs, followed by a real Alice Chat only-read task/receipt before claiming functioning dual Worker chat roundtrip.
- To stop AliceAI only: \`node stage2/alice-coordinator-service.mjs uninstall\` from the verified private runtime (reports are preserved). Do not uninstall/restart the existing OpenClaw safe-watcher. No new handoff permissions are implied by this service.

### Evidence boundary

This code is an unverified candidate until Mac reports a full green test suite and live \`install\` + \`status\`. \`--once\` passing does not establish concurrent-watch success; a PID does not prove successful ChatGPT feedback. The next stage is role-scoped multi-executor orchestration and same-Project handoff, still pending.

## 2026-10-27 — Exact-Chat handshake mailbox (candidate; Mac validation pending)

The user verified simultaneous registered LaunchAgents: ops PID 99222, Alice PID 78658; Alice logs reported an idle heartbeat and no stderr. These facts prove live dual watchers but not Alice chat receipt delivery.

A single-writer test avoids using the **ops** conversation's window-text authorization to type into the **Alice** chat. A trusted, exact-once operator task calls `node stage2/alice-coordinator-handshake.mjs request` **inside the existing private runtime** after candidate tests and protected self-update. The request creates one owner-private `alice-coordinator-handshake.json` with `wx` in the *existing Alice-specific* chat state directory. No caller-supplied text, target URL, command or flags are accepted.

Only the already-running Alice watcher sees this request. Only when the latest assistant turn is idle, it sends a fixed user-role handshake to its own strictly validated AliceAI Project Chat, recording `press_intent` before entering the send path. If the user-role receipt is uncertain, the watcher never retries sending and only checks whether the exact receipt is present; on verified receipt the request becomes `confirmed`. The fixed text asks AliceAI ChatGPT to emit exactly one `openclaw-gui-readonly-probe` structured task. The coordinator then processes and reports that task, using its existing per-conversation feedback journal; no additional browser writer is created.

Run a separate read-only status, Alice LaunchAgent log inspection, and DOM observer after the task request. Do not claim handshake success merely from a `confirmed` user-role message; require the exact `[IOANT-MAC-OPS RESULT alice-coordinator-verify-20261027-103]` *in Alice Chat* and verify action/status. This candidate adds no launchctl installation, PID manipulation, SSH, BDS or world operation.
