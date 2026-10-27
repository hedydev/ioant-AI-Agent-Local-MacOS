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
