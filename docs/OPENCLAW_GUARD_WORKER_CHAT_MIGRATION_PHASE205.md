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


## 205A-3 installed service live receipt

The operator's 205A-3 result showed
\`IOANT_GUARD_SERVICE state=installed, reason=guard_scheduled\`, followed
by a separate status call \`state=running, registered=true,
startIntervalSeconds=60, periodic=true\`; observed PID 39257 is
point-in-time only. No browser message or worker restart was performed.
This validates LaunchAgent installation and initial process status;
it is not yet a two-interval liveness or incident-queue acceptance.

## 205B-1 candidate: exact-Chat incident notification when owner Worker is alive

- \`stage2/guard-incident-outbox.mjs\`: reads the owner-private Guard
  incident journal (bounded, symlink-protected), validates every entry,
  independently recomputes the deterministic ticket digest,
  requires a strictly recognized installed **main Ops Worker plist**
  with the exact same ChatGPT Project and conversation as the
  running Watcher. An outdated repository \`chat-projects.json\` is
  never considered sufficient evidence of the current Chat binding.
- Only \`openclaw-workflow\` incidents for the exact bound conversation
  qualify. AliceAI's isolated coordinator remains read-only; no
  cross-project reporting through the Ops Worker's browser.
- Only allowlisted incident codes and fixed sanitized text are
  forwarded, never a raw error, shell output, browser content,
  credentials or state-file details.
- \`stage2/chatgpt-loop.mjs\` integrates the outbox with the
  **existing single-chat lock and browser send routine**. The
  ordinary pending task receipt has higher priority; an unexecuted,
  ambiguous or generating assistant turn is never preempted.
  The Guard can only request a notice during a safe idle/already-
  handled assistant-turn slot.
- A new \`state.guardNotice\` is saved before using Browser. The
  existing sender writes \`press_intent\` durably BEFORE Enter.
  On a failed/uncertain press, subsequent attempts are **read-only
  receipt checks**, not another Enter. The verified exact
  user-role bubble receipt is
  \`[IOANT-GUARD-INCIDENT <24-hex-ticket-key>]\`.
- \`state.guardDeliveredKeys\` retains bounded per-Chat proof that a
  ticket was delivered; a completed ticket is never selected again.
  Exhaustion or invalid state blocks future Guard notices rather
  than deleting proof or accepting unknown IDs.
- Test suite \`test/guard-incident-outbox.test.mjs\` has **16**
  regression cases covering authenticity, cross-Chat restrictions,
  journal trust, state transitions, no replays, exact matching,
  source-code guard and not preempting existing tasks.

The Guard's own scheduled LaunchAgent still **does not send Browser
messages**. The recipient is the trusted already-running Ops Watcher
after its own task feedback is clear. A crash of that Watcher means
only that the Guard can queue the event locally; it does not magically
give Guard independent Browser delivery permission.

205B-1 remains a **candidate** until a new full Mac test-gated
\`project-update-verify\` succeeds. Prior observed deployment was
985/985; 16 new tests imply expected 1001/1001, subject to the Mac
test runner's authoritative count. Deployed code alone is not proof
of a live incident notice or of correctly handling an uncertain
Browser delivery. Do not deliberately crash production Watchers
or manufacture errors on the real user desktop to test 205B.
Use controlled mock-browser tests and an explicitly consented
synthetic incident only after dry-run acceptance.

## Still outstanding

205B-2: independently authorized *Guard messenger takeover* when the
bound Worker is definitely stopped, using exact conversation identity,
a globally exclusive Chat writer lease, verified Relay availability,
durable press intent, no task replay, and conservative failure
handling. This is not implemented and must not be approximated by
unrestricted native CUA/browser control.

205C: same-project Chat migration using the pre-existing
\`chat-handoff.mjs\`, \`handoff-journal.mjs\` and
\`ops-rebind.mjs\` with signed-off work summary, user-approved new
Chat, independent exact Chat DOM witness, receipt proof and old
Worker stop. Never claim that merely refreshing a stuck page has
created a new conversation or reset its context limit.

## 205B-1 candidate failure diagnosis and repair

Mac gated updater refused the first 205B-1 candidate: 1001 tests, 998 passing, 3 failing. Runtime remained on the previously verified revision.
Independent isolated-candidate diagnosis found three existing tests:

- single existing Alice watcher alone handles fixed request while other pending work has priority (test/alice-coordinator-handshake.test.mjs)
- existing allowlisted execution remains gated by a structured task and two stable reads (test/chatgpt-watch-idle.test.mjs)
- existing watcher does not accept model-supplied Chrome commands or auto repair (test/maintainer-protocol.test.mjs)

Root cause: changing the canonical source-contract parser statement 'const a=extractWatchedAction(page)' to an alias when introducing Guard notifications. The repair restores the original single-pass statement and shares 'a' with the Guard scheduling check; it neither parses twice nor relaxes any of the three existing safety tests.

Additional functional issue found: the shared incident journal may legitimately hold AliceAI and Ops events. Ops previously rejected the entire journal if any AliceAI record was present. The fix validates both known project records, but restricts Ops message selection, staging and sending exclusively to the exact authorized Ops conversation. Three new tests cover mixed journals and cross-project prohibition.

Current fix is a GitHub candidate only. The next full Mac test-gated update is expected to run 1004 tests (original 1001 + three), subject to actual evidence. No automatic Guard service restart, synthetic production incident or forced task replay is authorized.

## 205B-2 live health and 205B-3 isolated Browser-mock acceptance candidate

Mac live 205B-2 read-only response confirmed installed Guard launchd
`registered=true`, `periodic=true`, `StartInterval=60`,
`runs=21`, `last exit code=0`. Because this is a short periodic job,
`state=not running` between runs is expected and not a service crash.
Both registered exact-chat Workers were running, had identities verified,
no pending feedback, and no currently detected incidents. This validates
periodic host monitoring, not a live Guard notification delivery.

205B-3 adds two isolated tests in the repository:
- `test/guard-incident-browser-mock-e2e.test.mjs`: spawns the real
  `chatgpt-loop.mjs` under a temporary canonical HOME with a strictly
  locally generated, installed-plist-shaped service binding, a private
  one-ticket Guard journal and a fake executable standing in for
  the OpenClaw Browser CLI. It checks exactly one type/Enter, the
  fixed `IOANT-GUARD-INCIDENT` user receipt and a durable delivered
  ledger entry, without touching real Chrome, ChatGPT or CUA.
- `test/chatgpt-new-layout.test.mjs`: checks the actual ChatGPT
  user-role DOM extraction recognizes the exact Guard receipt prefix
  without leaking the incident message body.

205B-3 is still a candidate until full Mac `project-update-verify`
passes. Last full Mac suite was 1004/1004, so the expected total
is 1006/1006. The live installed Guard is not restarted or modified.

Important distinction: a simulated Browser-CLI success proves the
tested local code path and receipt logic, not production ChatGPT
delivery reliability or permission to inject synthetic incidents
into a real user's conversation. Independent Guard-to-Chat takeover
after a crashed main Worker and safe per-Chat rollover remain future
separate authorization and acceptance phases.
