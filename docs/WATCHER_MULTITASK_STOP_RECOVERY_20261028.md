# Watcher STOP after two executable ChatGPT JSON task blocks — 2026-10-28

## Incident

At 16:10:08 +0800, the existing per-login-session Mac watcher
logged:

\`\`\`
[loop] STOP: More than one executable task in latest assistant turn; refuse ambiguity.
\`\`\`

The previous assistant turn contained two fully executable structured
\`ioant-mac-ops-v1\` code blocks: a \`project-update-verify\` deployment
task (204A-1), and the follow-on \`openclaw-native-cua-readonly\`
task (204A-2). They were incorrectly placed in the SAME assistant turn
instead of one task per turn. The parser properly refused to choose
either task and executed neither, but raised a known ambiguity exception
which propagated to main().catch and terminated the watcher (launchd
KeepAlive=false).

This was a TASK PRESENTATION ERROR, not a CUA provider failure and not
evidence that an update or native action was executed. The relevant
Phase 203G native read-only reacquisition succeeded independently
before this incident.

## Minimal fail-closed repair

1. Keep \`stage2/protocol.mjs extractAction\` strict: it still throws on
   multiple valid executable task blocks; it never picks one silently.
2. \`stage2/task-observation.mjs extractWatchedAction\` converts only
   this exact, trusted ambiguity error into
   \`{status:'rejected_ambiguous_task'}\`; no task/ID/report is returned.
   Unknown failures and missing assistant role provenance still throw.
3. \`stage2/chatgpt-loop.mjs\` handles that status before the dispatch
   branch; resets stable fingerprint, emits a single bounded status and
   privacy-safe diagnostic event, stays alive on its existing exact chat,
   and waits for a NEW single-task assistant turn. No action execution,
   feedback send, navigation, retries, file writes to user data,
   Gateway restart, or CUA invocation occurs in the ambiguous branch.
4. \`stage2/diagnostic-log.mjs\` allows only the new bounded
   \`ambiguous_task_refused\` event. No task code, raw DOM, or chat text
   is logged.
5. Regression tests cover ambiguity refusal, new single-turn recovery,
   invalid role provenance still fatal, three simultaneous tasks,
   and no accidental dispatch in the watcher branch.

The existing project-update-verify mechanism must test this candidate
fully before installation. The last successfully deployed runtime was
\`3ae8fb578cb2fa8e1aa67dd16ddab7c1dadb0d34\` at 955/955 tests.
The pending 204A candidate added 11 tests, this ambiguity patch adds
four more, for expected 970/970 tests (subject to actual Mac evidence).

## Recover stopped watcher without clearing locks or changing configuration

This is a local macOS operator maintenance step, NOT an executable
ChatGPT structured task. An assistant cannot send it to a stopped watcher.

1. Use the existing trusted private runtime (not the ahead-of-runtime
   GitHub candidate) to inspect:

\`\`\`sh
R="$HOME/Library/Application Support/ioant-openclaw-ops/runtime"
node "$R/stage2/ops-supervisor.mjs" status
/bin/launchctl print "gui/$(id -u)/com.ioant.openclaw.safe-watcher"
\`\`\`

2. Only if the supervisor reports \`state=stopped\`,
   \`registered=true\`, \`running=false\`, and the launchd printed
   service is the known \`com.ioant.openclaw.safe-watcher\`, start that
   already registered instance once with
   \`/bin/launchctl kickstart gui/$(id -u)/com.ioant.openclaw.safe-watcher\`
   (WITHOUT \`-k\`). Do NOT restart a running watcher.
3. If the service is unregistered/unloaded, inspect its existing
   plist and exact conversation binding separately before choosing
   a recovery method; do NOT blindly run \`bootstrap\`, force-kill, or
   delete \`watch.lock\` / state / pending receipts. The existing
   \`stage2/ops-rebind.mjs start\` accepts only a verified exact chat
   and requires source/runtime revision parity, so it may refuse
   during an upgrade.
4. Check the new stdout tail and supervisor status; the latest
   assistant turn must contain only ONE executable task. After
   restart, send the single \`project-update-verify\` task with a
   NEW ID and wait for its guarded 970-test result. If it passes,
   the watcher should perform the existing controlled reload after
   the feedback is confirmed.
5. Only AFTER that result has been observed can a separate turn
   contain the one fixed \`openclaw-native-cua-readonly\` task.

Do not delete the prior test evidence, reset Git, loosen the
\`extractAction\` rule, or interpret successful manual restart as
proof that the new candidate patch has deployed.
