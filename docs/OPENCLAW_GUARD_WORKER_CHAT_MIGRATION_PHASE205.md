# Guard Worker 205A — crash monitoring, undelivered feedback and safe per-Chat migration

## Motivation / current incident

At 2026-10-28 16:19:30 +0800, the main Worker printed
\`Feedback send deferred: browser unavailable or delivery uncertain; task not repeated.\`
The main Worker had already saved a private runtime task report. This
log line is evidence of **uncertain chat receipt**, not proof of failure
of the task it had executed. The later independent
\`openclaw-watcher-multitask-fix-deploy-20261028-204r1\` receipt
confirmed \`project-update-verify\`: from
\`3ae8fb578cb2fa8e1aa67dd16ddab7c1dadb0d34\` to
\`0ca56ccfc37ddc739edea8eb53eb4354bf7e067b\`, 970/970 tests
passing and reloadRequested. A reload requested by the receipt is
not independent evidence of a successfully started new watcher;
check installed launchd state if relevant.

## Design boundaries

The main ChatGPT Ops Worker and AliceAI coordinator remain the sole
owners of their respective **exact ChatGPT Project conversations**.
The independent Guard observes their installed LaunchAgent identities,
process-state metadata, bounded stderr signatures and their own
private per-chat \`state.json\` pending-feedback metadata.

Never infer the true chat binding from an outdated
\`config/chat-projects.json\` entry: the main LaunchAgent currently
binds to \`6ae18e93-e2a0-83ec-aac9-88105079f208\`, which is not the
repository's historic manifest entry. The Guard reads and
authenticates the actual installed plist using existing
\`installedPlistBinding\` and
\`recognizeAliceCoordinatorPlist\` contracts.

There is no new computer-control implementation and no bypass of
OpenClaw Browser, gateway, CUA or chat permissions.

## Implemented 205A candidate

- \`stage2/guard-worker-core.mjs\`: pure, fail-closed classification for
  registered stopped/unloaded workers, untrusted service identities,
  unreconciled feedback aged at least 180 seconds (only the private
  state file's modification time is observed), recent bounded STOP /
  Relay diagnostic codes. No raw logs, app names, task text,
  credentials or file contents in reports.
- \`stage2/guard-worker.mjs\`:
  - \`scan\`: one-shot read-only summary of the two exact known services.
  - \`once\`: one-shot scan plus private incident-ticket persistence,
    used by launchd every 60 seconds. Healthy checks produce no
    periodic stdout spam.
  - \`watch\`: manually invoked once-per-minute continuous scan,
    using the same private incident ticket logic (not the planned
    launchd service default).
  - \`handoff-check <openclaw-workflow|alice-ai> <new Chat URL>\`:
    verifies installed exact source service, same Project and different
    destination conversation, and blocks while the old source has
    uncertain feedback. It does not create a chat, send a handoff,
    transfer approval, stop a worker, or change a route.
  - Incident tickets are scoped by Project key + conversation ID +
    error code + UTC date, persisted owner-private as
    \`~/Library/Application Support/ioant-openclaw-ops/guard/incidents.jsonl\`.
    Each ticket has \`delivery=queued\`, \`messageSent=false\`.
    Queued is **not** delivered. Guard does not send browser messages.
- \`stage2/guard-worker-service.mjs\`:
  - \`install | status | uninstall\` (explicit local operator only).
  - Separate LaunchAgent \`com.ioant.openclaw.guard-worker\` with
    \`StartInterval=60\`, \`RunAtLoad=true\`, \`KeepAlive=false\`,
    invoking the pretested private Runtime fixed script \`once\`.
  - No shell, sudo, service kills, watcher reload, Node/app rebind,
    clipboard, keyboard or Browser.
  - Uninstall preserves private incident history and does not touch
    main/Alice LaunchAgents.
- \`test/guard-worker.test.mjs\`: 15 tests covering classification,
  authorization boundaries, installed plist trust, incident
  deduplication, fixed service definition, and same Project handoff.

**Status:** GitHub *candidate* only until \`project-update-verify\`
returns full Mac test success, then a real \`scan\` is observed. The
prior verified suite passed 970 tests; the candidate adds 15, so
expected total is 985 (actual Mac report is authoritative). Do not
install Guard before the gated update.

## Safety and message-delivery phases

205A persists evidence even while an existing Worker is down, but
**cannot send a report into ChatGPT while its sole authorized writer
and Browser relay are unavailable**. It MUST NOT fake delivery or
blindly reuse an old ChatGPT task. Independent host telemetry is not
a ChatGPT user-turn receipt.

205B is the pending relay bridge: the exact authorized Worker may
consume Guard tickets from its own conversation after its prior
\`feedbackPending\` is reconciled, establish a fresh explicit user
message receipt and persist a write-ahead \`press_intent\`; once a
send is uncertain only read-only receipt recovery is allowed. If the
Worker itself is stopped, independent delivery needs a separately
approved, single-writer Guard messenger that proves the old writer
is inactive and atomically owns the exact-chat lock. Do not treat
either bridge as implemented by 205A.

205C is the per-Chat handoff workflow. Reuse existing
\`chat-handoff.mjs\`, \`handoff-journal.mjs\`,
\`ops-rebind.mjs\`, and
\`project-chat-routing.mjs\`. Transition:
\`requested -> handoff_ready -> new_chat_verified ->
receipt_verified -> agent_acknowledged -> promoted\`.
A manually requested handoff is valid; automatic context rollover
needs an independently observed explicit limit banner (not guessed
from chat length). A hung browser tab or temporary Relay outage
is not evidence that the model's context is full. Browser refresh
and new Chat creation are separate operations. No automatic copy
of old permissions; new Chat requires verified Project identity,
new receipt and its own authorization. Never remove an unknown
lock, replay a pending task, or kill a live watcher to force a switch.

## Suggested acceptance

After deploying the 205A candidate, run the read-only:

\`\`\`sh
R="$HOME/Library/Application Support/ioant-openclaw-ops/runtime"
node "$R/stage2/guard-worker.mjs" scan
\`\`\`

and check the exact live bindings and unresolved-feedback status.
Only after clean field verification should a separate approved task
install the independent periodic Guard service. Guard installation
is not part of \`project-update-verify\` and is not implied by a
GitHub commit.
