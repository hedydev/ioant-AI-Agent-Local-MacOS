# Self-update end-to-end canary — 2026-10-24

This documentation-only commit is a live canary for the already-running, explicitly authorized macOS OpenClaw Stage-2 watcher.

## Before this canary

The operator completed a controlled one-time bootstrap to `7b57a83d0b780cbde0e1f664680b9a689e35dcde`, passing the repository's full isolated test suite before starting the foreground launcher. The launcher confirmed the existing Chrome extension profile, exactly one authorized ChatGPT conversation, `--enable-self-update`, and the read-only Mint diagnostic opt-in, and printed `Waiting for a structured ChatGPT task`.

The preceding unattended updates had correctly aborted on `dirty_worktree` (untracked Python caches) and then `candidate_tests_failed` (the watcher-owned `IOANT_LOOP_LOG_FILE` leaked into test fixtures that use a different `PROJECT_DEV_CACHE`). Both were addressed without weakening any Git, test, permission or receipt gates. Independent isolated `node --test` on the preceding candidate `c9541733ce380bc065c388123b2363dbea240439` passed 156/156 on Mac; that historical count is **not** the test count of this canary.

## Live acceptance protocol

The assistant submits exactly one new structured task ID, `self-update-20261024-e2e-005`, action `project-update-verify`, from the authorized ChatGPT conversation after this commit is on `origin/main`. The watcher must not execute any page-supplied shell code, arbitrary Git SHA or URL, Mint action, or test bypass. Its fixed updater must verify clean local main and the approved origin; fetch and pin the new target SHA; safely archive only that Git tree; run all candidate tests in private LunaDrive staging with watcher-only diagnostic log path removed from the test environment; and only then `git pull --ff-only origin main` to exactly the pretested commit.

Success needs **two independent kinds of evidence**:

1. One matching user-role result message from the watcher with `Status: passed`, an audit of `state: updated`, exact `from` and `to` 40-character Git SHAs, fully passing test counts and `reloadRequired: true`.
2. The foreground launcher logs a controlled worker exit/reload and a new live watcher that is again waiting for the next structured task. The first result message alone is not proof of the actual process reload.

No update is considered complete if a test fails, the worktree is dirty, remote HEAD races, browser receipt remains unconfirmed, or the controlled watcher reload fails. The old canary task IDs must never be replayed. Keep production Minecraft BDS 17879 and laboratory 17880 entirely untouched. Nothing in this document authorizes a new action.

## Real Mac acceptance results — 2026-10-24 (completed)

**Outcome: accepted for the bounded opt-in Stage-2 self-update workflow.** These facts are from two separate user-role `[IOANT-MAC-OPS RESULT ...]` messages observed in the same authorized ChatGPT conversation, following the user's foreground launcher output. This is **not** a claim of generally autonomous browser recovery, arbitrary Mac command access or Minecraft gameplay verification.

| Check | Observed evidence | Assessment |
| --- | --- | --- |
| Launcher ready | Chrome extension profile; one exact target ChatGPT tab; explicit `--enable-self-update`; idle watcher waiting for structured task | PASS |
| New action | `self-update-20261024-e2e-005`, `project-update-verify` | PASS |
| Execution result | `Status: passed`; audit `IOANT_PROJECT_SELF_UPDATE`; `state: updated` | PASS |
| Base revision | `7b57a83d0b780cbde0e1f664680b9a689e35dcde` | MATCH |
| Target revision | `e12f14a5f504b60b2631d63de043f4877074dfcc` | MATCH |
| Candidate tests | `total: 159`, `passed: 159`, `failed: 0` | PASS |
| Reload requested after receipt | `reloadRequired: true` | PASS (requested) |
| First watcher session | `ec435fb1` in update result | OBSERVED |
| Follow-up action | `self-update-20261024-reload-check-006`, `project-head`, `Status: passed`, exit code 0 | PASS |
| New watcher session | `843eadac` (different from `ec435fb1`) | PASS |
| New process reports HEAD | `e12f14a5f504b60b2631d63de043f4877074dfcc`, exact target SHA | PASS |
| Continues in same conversation | Worker result ends with `waiting for the next structured task in this same conversation` | PASS |

The different session ID, successful follow-up task and matching target HEAD together substantiate the controlled worker reload and readiness after update. They are **strong application-level evidence**, not an independent operating-system PID/parent-process trace.

### Operator burden and safety boundary

The final canary needed **no manual terminal commands**: ChatGPT posted only one allowed fixed-action JSON message, the Mac worker pretested a pinned Git candidate, fast-forwarded `main`, posted the bounded result in the existing conversation, reloaded, and accepted the independent `project-head` check. The earlier **one-time operator bootstrap** was necessary to install the fix for the broken test environment. Do not describe the earlier recovery phase as unattended.

Keep all safeguards: exact selected ChatGPT conversation and task ID, explicit action authorization, clean Git main, approved origin, verified fast-forward only, complete candidate `node --test` gate, bounded redacted feedback, user-role receipt confirmation before exit 75, persistent pending-feedback state, no arbitrary shell, and no Mint/BDS/world modifications by this action.

### Remaining work (not accepted yet)

- **Chrome/OpenClaw CDP disconnect recovery:** an earlier snapshot timeout interrupted the old watcher. The revised pre-send snapshot retries and durable `prepared` / `press_intent` state have tests, but a real repeated transient disconnect/reconnect acceptance has **not** been performed.
- **Supervisor resilience:** the foreground launcher still relies on the user keeping its terminal alive; crash resilience across machine restart or unpaired Chrome extension is not proven.
- **Broader permissions:** neither AliceAI world mutations nor a repeatable 17880 BDS probe is authorized by the self-update acceptance. Mint diagnostics remain read-only and separately opted in.

### Source of truth

- GitHub canary commit: `e12f14a5f504b60b2631d63de043f4877074dfcc`
- Successful update task: `self-update-20261024-e2e-005`
- Reload/HEAD validation task: `self-update-20261024-reload-check-006`
- Full feedback and launcher excerpts are in the authorized ChatGPT conversation, not committed to Git because they are runtime records. No local secrets, cookies or raw browser content are stored in docs.
