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
