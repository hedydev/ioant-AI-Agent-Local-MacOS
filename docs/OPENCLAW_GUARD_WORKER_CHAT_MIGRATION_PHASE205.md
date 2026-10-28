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

## 205B-3 Mac acceptance

The actual 2026-10-28 guarded deployment returned `updated` from
`05d1dc003558f302b21f32ade3ffc683f2b316f8` to
`2bf0cc3d7447b177aa6e74789df9314991faf6eb`,
with **1006/1006 Node tests passing** and `reloadRequired=true`.
The added isolated mock-Browser test and Guard receipt parser regression
passed as part of the suite. This is proof of the mocked delivery path,
not of injecting any real incident into production ChatGPT.

## 205C-1 current-Chat handoff readiness (candidate only)

New pure module `stage2/guard-chat-continuity.mjs` and the read-only
`stage2/guard-worker.mjs handoff-readiness <projectKey>` mode.
The CLI accepts ONLY `openclaw-workflow` or `alice-ai`; it does not
accept browser instructions, arbitrary shell, or new conversation URL.
It matches the current Chat against the *installed, independently
verified LaunchAgent plist*, checks the existing owned Chat state for
pending task feedback, Guard incident delivery, Maintainer notice
delivery and initialization, and compares the verified Project identity
with the bundled registration manifest.

Important real-world drift: `config/chat-projects.json` still contains
an older OpenClaw main conversation ID, while the installed service
was observed running on `6ae18e93-e2a0-83ec-aac9-88105079f208`.
Readiness therefore reports `registry_reconciliation_required`,
not a false assertion that the old registry entry is the active Chat.
No automatic registry rewrite, process stop, browser refresh,
Chat creation, task replay or permission transfer is permitted.

For each Chat the next authorized stages must establish a verified
project-specific handoff text (from the actual old Chat, not guessed
from Guard log metadata), a destination created under the same Project,
a validated new Chat DOM identity, an idempotent user-role receipt,
explicit operator approval, old Worker shutdown and a separate
operator-approved rebind/start. The existing `chat-handoff.mjs`,
`handoff-journal.mjs` and `ops-rebind.mjs` remain the building blocks.
A temporary Relay/browser fault does not prove context exhaustion.

Ten new tests in `test/guard-chat-continuity.test.mjs` cover live
manifest drift, real Alice binding, pending-message barriers,
cross-Project mismatches and no unapproved mutation. Candidate requires
Mac full `project-update-verify` of expected **1016 tests**
(1006 previously passed + 10 new), with real count authoritative.

## 205C-3: AliceAI missing state file — live evidence and first-run checkpoint fix

Live read-only Mac check `openclaw-alice-chat-state-evidence-20261028-205c3`
reported Ops `state=verified_file` with all four pending flags false,
but AliceAI `state=state_file_absent`. This does NOT prove an Alice
crash or that all work is settled. The Alice coordinator uses the
same Stage-2 `chatgpt-loop.mjs` as the main watcher. Its `loadState()`
previously returned the empty default IN MEMORY on ENOENT and did not
persist it until a later task or message update. A healthy idle
read-only AliceAI Worker could consequently have no `state.json`.

Fix candidate:
- `stage2/watch-state-bootstrap.mjs`: minimal default state is written
  owner-private, with exclusive `wx` creation and `fsync`; refuses
  existing state, symlink alias, unexpected fields or competing writer.
- `stage2/chatgpt-loop.mjs`: persist that initial state ONLY in `--watch`
  and ONLY after the exact Chat conversation lock is acquired. `--once`
  still does not write state. Existing session state and pending
  receipts are never overwritten, truncated or reset.
- `stage2/guard-worker.mjs` and `stage2/guard-chat-continuity.mjs`:
  distinguish a missing owner checkpoint from corrupt/unverified
  state. Missing state explicitly blocks migration with
  `reason=state_checkpoint_missing`; Guard NEVER writes a substitute.
- For AliceAI, check its separate `alice-coordinator-handshake.json`
  through the existing verified mailbox reader. `requested` or
  `press_intent` blocks handoff; absent or `confirmed` can only
  permit the **preliminary** readiness classification, not migration.
  An unreadable or mismatched mailbox also blocks migration.
- Four additional continuity tests and six new bootstrap tests
  cover missing state, pending handshake, exclusive private write,
  unchanged existing state and read-only `--once`.

**Deployment/restart distinction:** A successful repository update
does not demonstrate that the separately running AliceAI coordinator
has reloaded Node modules. The next inspection must check the
currently running Alice watcher and its handshake before any
operator-authorized reload. Do not blindly restart or write
`state.json` from Guard/ChatGPT; only the owning watcher may
create it at its next verified startup.

Prior passing Mac test total: 1016. Candidate adds 10 tests, so
the expected complete count is 1026; actual Mac evidence governs.

## 205C-15–17: AliceAI uses the functioning native Computer provider (2026-10-28)

Real, unchanged Mac evidence:
- The separately running AliceAI coordinator still waits for the exact Chat tab in its legacy `browser --browser-profile chrome --json tabs` path; 9 Relay-exposed tabs (4 ChatGPT) contained no Alice conversation ID. This is NOT proof that OpenClaw Computer Use or Chrome is broken. OS Chrome enumerated 13 tabs including exactly one Alice Project/Chat tab in a non-incognito window.
- Native paired Mac Computer Use advertises `cua-computer` v2, `list_windows`, `get_browser_state` and `get_window_state`. No browser writes are authorized.
- 205C-16 returned `list_windows` but its parser incorrectly assumed `app.bundleId` would exist. 205C-17 received `ok:true`, 255 walked records, 251 CUA window references, and 38 title-based Chrome hints; actual window records contain `title`, `bounds`, `windowRef`. Scoped CUA close was acknowledged, which is NOT proof of global owner release.

New, **candidate only** `scripts/alice-native-browser-readonly.mjs` performs a single, operator-invoked read-only vertical. It independently verifies a unique active Alice Project/Chat tab via Google Chrome AppleScript URL metadata (no navigation or activation), requires that window's OS title to match exactly one CUA-listed window title, then invokes `get_browser_state` with that **fresh** `windowRef` within the same new UUID execution. It processes browser/page references in memory and emits only safe booleans/counts, never titles, URLs, tabs, screenshots, page content, refs or raw native payload. On any ambiguity it fails closed, does not probe other browser windows and never sends the pending handshake. A best-effort `__close_execution` is scoped only to its own UUID. The existing `stage2/chatgpt-loop.mjs` and Alice service are unchanged.

Five source tests verify unique URL/Project identity, exact window matching, duplicate-title refusal, page identity and nested transport decoding. The next step is an explicit `project-update-verify` guarded full Mac suite, then one pinned script invocation. Do not claim an end-to-end CUA browser read until that live result is received. If the OS active-tab or title projection check fails, improve the narrowly scoped attestation based on **sanitized evidence**; do not loosen it to a generic Chrome title or scan all browser windows. If native discovery succeeds, design the coordinator read adapter and separate human-authorized, receipt-preserving message-write pathway. No unapproved worker restart or chat handoff.

## 205C-19 Chrome OS metadata error and bounded correction (2026-10-28)

First live invocation of the CUA browser discovery script exited in **372 ms**, before calling CUA. Chrome AppleScript returned `-1728` for `index of t` on a `tab` element. This is an AppleScript tab-object property error, NOT an OpenClaw extension/Relay failure or a native CUA denial. No browser mutations or chat messages were attempted.

The corrected `chromeAppleScript()` uses the 1-based numeric `repeat with j from 1 to (count of tabs of w)` loop and compares `j` with `active tab index of w`. It reads `title of t` instead of `name of w` (window name is not a verified active tab title). Regression tests assert those rules and prohibit tab activation/navigation. OS-script stderr is no longer forwarded raw; a sanitized `chrome_os_metadata` phase distinguishes this from future native window-list/browser-state failures.

**Status: candidate source only until guarded Mac update and full suite.** No Alice Coordinator reload, handoff or handshake was performed. On a repeated `os_active_target_unverified`, do not silently activate Alice's tab; diagnose the requirement for target-window matching without changing Chrome. Do not loosen the exact Project+Chat identity check or perform exploratory browser writes.

## 205C-21: background Alice tab required — no foreground takeover

Live Mac receipt `openclaw-alice-native-browser-retest-20261028-205c21`: 1033/1033 had already passed on HEAD `c4350e0981b1c06a401c6365861141934668d642`, but the native browser observer exited in 760 ms with `os_active_target_unverified`; no CUA call or user input was made. The original AppleScript required the target Alice tab to equal the Chrome window's active tab. That assumption is inappropriate for an autonomous background Coordinator; the receipt itself did not distinguish an inactive tab from an absent or unreadable tab, so it is a code-level limitation, not independent proof of tab selection state.

New source candidate: enumerate Chrome windows/tabs with read-only AppleScript, count exactly one target conversation, capture the current active tab's title **from the containing window** and separately record whether Alice itself is active. The exact Alice Project ID and conversation ID remain mandatory, as does a unique CUA `windowRef` matched to that containing-window title; no generic Chrome-title fallback, no tab activation, no permission changes. Send `get_browser_state` only for the uniquely matched window within the same new CUA execution ID, never to exploratory windows. No browser data, user titles, URLs or opaque refs are printed. On ambiguity stop; a scoped close acknowledgement still does not prove owner release. The current isolated Alice Coordinator has NOT been modified or restarted; its handshake remains untouched.

Two new regression tests cover inactive Alice tab recognition and fail-closed window matching. Before a live retest, guarded `project-update-verify` must pass the complete Mac suite. The native Browser state may expose only the window's active page; success for a **background** Alice page is not assumed until independent CUA page identity evidence is returned. Do not switch/activate the Alice tab to force acceptance.

## 205C-24: AppleScript wire-protocol mismatch — source-only fix

Mac read-only task `openclaw-alice-os-target-field-diagnostic-20261028-205c24` returned normally in 683 ms but decoding `osascript` stdout with `split('\\t')` yielded `fields=1` instead of the 5-field protocol. No real native CUA call or browser mutation was attempted. This is evidence of an output-format mismatch, not proof of target absence. A plausible cause is the bare AppleScript identifier `tab` within the `tell application "Google Chrome"` dictionary context; this is a hypothesis, not independently confirmed AppleScript semantics.

The candidate replaces the ambiguous bare `tab` boundary with an explicit fixed literal `|IOANT-ALICE-205C25-WIRE|` in the AppleScript return and Node parser. Exactly 5 fields, one target tab, one containing-window match, allowed activity bit, safe title and exact Project/Chat URL are still required. A title containing the delimiter adds fields and fails closed; no raw URL, page text or title is disclosed. On failure the new `chromeOSWireEvidence()` returns only counts, booleans and bounded field cardinality, avoiding another opaque failure.

Three additional focused regression tests cover the rendered AppleScript delimiter, injection/old-protocol rejection, and sanitized failure evidence. Existing Coordinator and CUA scripts are unchanged. Candidate source is **not yet deployed or proven on Mac**; deploy only with `project-update-verify` and 1038 expected tests, then invoke this pinned one-shot read-only script. If Chrome OS attestation succeeds, continue to actual native window/browser state observation rather than reopening extension installation diagnosis.

## 205C-26: OS/browser window identity accepted, native browser state call failed

Mac live task `openclaw-alice-native-browser-wire-acceptance-20261028-205c26` reached `phase=native_browser_state` after the Chrome OS identity, one native `list_windows` and exact title-to-`windowRef` matching. It returned `native_browser_observation_unavailable` with `preAdmissionDenied:false`. The own CUA execution's close request was acknowledged, but **ownerReleaseVerified=false**. This does not establish that the next native action is safe or that the target page is accessible. Existing OpenClaw Computer Use continues to be treated as functional, and the Chrome extension is not a repair target.

The official CUA computer contract uses `get_browser_state` with the fresh `windowRef` from `list_windows` inside the same execution; the current source already sends that shape. The thrown CLI error was previously collapsed into a generic message, masking whether this is an invalid request, driver/provider refusal, ownership conflict, or other native error.

New candidate uses the repository's pre-existing `classifyInvokeFailure` taxonomy. It returns only a recognized error category, safe typed native code, CLI exit and presence flags; never raw stdout/stderr, URLs, Chrome titles, page contents, driver error prose or native refs. It also differentiates malformed JSON or output-size failure, and handles a structured `ok:false` refusal. Two regression tests cover an invalid-request envelope containing sensitive text and a host-busy classification. This does **not** change the `get_browser_state` arguments, open a new browser profile, start an extra execution, or automatically retry. The existing Alice Coordinator, its pending handshake and all services remain untouched.

Next gate: guarded full Mac `project-update-verify` of this candidate (previous accepted count 1038, expected 1040), then a **single** fresh, read-only pinned invocation. Use the sanitized native failure class to decide whether a further source change is justified. Do not conclude that a close ACK independently proves the prior execution owner was released.

## 205C-28: one-shot native browser refusal classification and adapter limit

The Mac receipt `openclaw-alice-native-browser-error-acceptance-20261028-205c28` again passed unique Alice Chrome OS tab, `list_windows` and title-to-`windowRef` mapping; `get_browser_state(windowRef)` threw a structured, unknown CLI error after ~5.3s. Its diagnostic contained `phase=native_browser_state`, `failureCategory=unclassified`, `cliExitCode=null`, `structuredErrorBody=true`, `stdoutPresent=true`, `stderrPresent=true`. Own execution close was acknowledged, with `ownerReleaseVerified=false`. No page binding, Computer DOM read or handshake was established. No browser mutation was attempted.

Official OpenClaw computer docs explain that its current CUA adapter **does not expose attachment to an existing user Chrome profile**. In contrast, upstream Cua Driver supports existing-profile CDP attachment through an explicit `browser_prepare` grant. Do not conflate the upstream SDK with the OpenClaw adapter. Thus native window discovery does **not** prove it can read the existing logged-in AliceAI Chrome tab's DOM. Do not invoke browser_prepare against the personal profile or launch isolated browser for Alice without a separately authorized workflow, and do not weaken the exact Alice Project/Conversation binding. Do not switch the Alice tab to the foreground as a substitute for background automation.

The candidate source extends existing safe CLI classification to include strictly allowlisted native refusal tokens (`browser_requires_setup`, `browser_consent_required`, `browser_not_attached`, etc.), only enumerated error-envelope key names, a fixed vocabulary of safe signal words and process exit status. It never emits raw CLI errors or browser content, and it does not change `get_browser_state` parameters or increase the number of native calls. Two additional unit tests exercise a browser setup refusal containing private URLs and a separate host-busy error. Next: run guarded `project-update-verify` (1042 tests expected), followed by at most one pinned, read-only native test. If refusal means existing profile unavailable, retire this CUA browser-DOM route for Alice and design Coordinator against the existing functioning browser integration; no extension reinstall, no bypass.

## 205C-30: final CUA browser authorization finding (2026-10-28)

**Real Mac acceptance evidence:** The pinned `openclaw-alice-browser-refusal-final-20261028-205c30` returned the following allowlisted facts only: `phase=native_browser_state`, `state=inconclusive`, `browserRefusalSignals=["browser_consent_required"]`, CLI `processExitStatus=1`, `cliErrorType=cli_error`, structured error envelope `{ok,error:{message,type}}`, with safe signals `error,computer,refused,required,profile,approval,cua,endpoint`. The prior read-only Chrome OS Project/Conversation check, unique CUA windowRef matching and native `list_windows` succeeded. The `get_browser_state` request was rejected for missing browser/profile consent. This is neither evidence of a broken extension nor proof that CUA cannot read any existing Chrome profile **after a valid grant**. This attempt did not get DOM, send a message or modify browser state.

The own-session `__close_execution` request was acknowledged but `ownerReleaseVerified=false`; never forcibly release another session. The existing AliceAI watcher remains independently configured to use its already-authorized single-writer `openclaw browser --browser-profile chrome` transport. Earlier Relay evidence had no **exact Alice Project Chat** among visible tabs, despite the Chrome OS census seeing that Alice tab. A connected extension for some other tabs does NOT establish Alice's exact tab is attached and authorized. The private Alice handshake `alice-coordinator-verify-20261027-103` remained `requested` at last independent check; no evidence of actual delivery. Do not promote it to `press_intent` or `confirmed` without the real owner receipt.

**Decision:** Stop repeated native `get_browser_state` testing against this consent boundary. Do NOT auto-invoke `browser_prepare`, use raw CDP or AppleScript to scrape ChatGPT DOM, activate Alice's Chrome tab, scrape another profile, fake a receipt, broaden isolated Project scope, or reconfigure/reinstall the working Chrome extension. Do not restart Gateway or the existing Workers to conceal access denial. Browser consent must come from an explicit legitimate approval for the exact resource; an owner-approved Relay attachment/visible exact chat would alternatively allow the existing single-writer Coordinator to proceed after its own independent DOM checks. Neither approval is asserted to have happened.

New source-only policy `nativeBrowserAccessDisposition()` treats recognized `browser_consent_required`, `browser_requires_setup`, or `existing_profile_unsupported` as `state=blocked`, `retryAllowed=false` and `operatorBrowserAuthorizationRequired=true`. A separate pair of tests ensures the authorization refusal does not get mislabeled transient, nor trigger fallback. This does NOT grant consent, implement a new browser writer or stop the existing Alice watcher by itself. No further native probe is scheduled.

**Actual project objective:** have the ChatGPT Alice Project owner coordinate OpenClaw local AliceAI/analysis/coding/testing/review workers. Existing components `stage2/chatgpt-loop.mjs` single-chat writer and durable send intent/receipts, `stage2/alice-coordinator-handshake.mjs` pending exact-once handshake, and `stage2/alice-owner-review-packet.mjs` bounded local model advisory evidence provide a viable basis without a second browser writer. Before chat delivery, require an explicitly authorized view of the **exact** Alice Project/Conversation via the existing browser interface, matching page URL, DOM composer and same-chat single-writer lock. Reconcile the prior requested handshake once, and require ChatGPT user-role receipt; never replay an ambiguous Enter. Continue local DAG/advisor work and prepare review evidence independently of ChatGPT DOM, but do not claim two-way ChatGPT collaboration until both directions have live receipts. The protected ops-chat Worker and Guard are out of scope and must not acquire Alice's writer lock.

This source and documentation update is **not yet deployed to the Mac**. Previous Mac acceptance: 1042/1042 on `7c53380e1ffa04dedea0291d352f7dac018b3bc3`. Protected `project-update-verify` must pass before any future source-level runtime change.
