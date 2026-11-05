# MCP console: execution queues, slots and resource evidence

## Behavior

The Activity navigation is now Task queue / 任务队列. Both the global list and
project views have In progress, Queued, Needs review and Finished history tabs.
Project names are displayed above their stable routing keys, and tracked task
definition names identify script work. Filtering includes project names, task
files, operation IDs, actions and reasons. Viewing never submits execution.

The overview and queue page distinguish three unrelated capacities:

- Native Computer Agent: one shared inference lane, four total admission slots
  including the active task. Waiting reservations follow the real reservation
  timestamps, not the order of recently completed receipts. Queue wait and Agent
  execution each have a separate 300-second budget.
- Repository fixed executor: one operation per project lease. Different projects
  can execute independently; another operation in a busy project is blocked, not
  silently placed on the native inference queue.
- Receipt storage: 500 hot repository receipts per project. This is neither
  concurrency nor the Tunnel transport buffer. Existing explicit archival and
  report pagination remain unchanged.

The console reads private native reservation/active metadata and project leases.
It never changes locks, checks/kills business processes, replays jobs or asks a
model to infer progress. An uncertain result retaining the lane is shown as held
for review, not as live model inference. Legacy started receipts without an
asynchronous job are also uncertain, not automatically called running. Historical
held flags cannot override the current reservation snapshot.

Recent finished rows are capped at 150 globally; active, queued and uncertain
records are retained independently so newer history cannot hide an older task.
The existing project history dialog pages older repository/archived records.
Computer history remains bounded by its existing 500-record ledger. Unknown
historical outcomes remain labelled uncertain even after a separately reviewed
lease release; this UI does not rewrite their results.

## Resource reporting

Cards show occupied lane, waiting reservations, available total admission slots,
fixed tasks recorded in progress, and Ollama-reported model residency. Model
residency uses only the existing loopback `/api/ps` metadata query; it does not
load, generate with, or unload a model. Engine residency is not system RAM or
per-task memory attribution.

Rows show submission-to-finish/current elapsed time (including waiting), recorded
Agent invocation duration when present, model invocation evidence, successful
tool names and script step exit status. The fixed executor itself does not invoke
a model; this is not a meter for arbitrary calls inside user scripts. Token,
monetary cost and ChatGPT subscription usage are not recorded by this console and
are explicitly unavailable, never synthesized as zero. No raw Agent prompts,
answers, reservation tokens, lease digests or runtime credentials are exposed.

## Validation and deployment boundary

- Full Node regression: 1391 passed; zero failed/skipped/cancelled.
- Added fixtures cover real ordering, retained/absent/corrupt lane metadata,
  missing receipts, current-vs-historical held flags, unknown model consumption,
  and retaining an old queued row behind more than 150 finished rows.
- Real browser preview with actual read-only Mac data verified Chinese/English,
  queue/finished-history tabs, project names and existing report links. The observed
  snapshot had one uncertain native owner, no waiting reservations and no loaded
  model, correctly presented as lane retention rather than active inference.
- Preview listener binds loopback only and rejects lifecycle, removal and archival
  mutations. It is temporary; production port remains 18489.

Production Web backend must be reloaded to serve the new queue metadata/modules.
The Web process holds the Runtime Key only in memory and stops its owned Tunnel
on shutdown. Do not recover the key or silently restart while other Chats are
working. Coordinate a brief interruption and let the operator enter the existing
key privately in the local page afterward. This change does not require a new MCP
tool catalog, plugin Refresh, Gateway/Ollama restart or replay of business tasks.
At source commit time, production Web reload is still pending.

## Production rollout verified — 2026-11-06 (Asia/Shanghai)

The operator explicitly requested immediate upgrade and then privately entered
Runtime Key and started the Tunnel in the local page. The Web service now runs
PID84619 at the original loopback port18489, loading source9c48472. Both new UI
modules returned HTTP200, the actual production browser showed all four tabs,
SSE stayed connected with advancing timestamps, and no persistent UI error was
visible. Real cloud MCP capabilities returned successfully with readOnly=true and
modelInferenceInvoked=false. Local health independently reported ready=true.

The old Web PID64450 had already written its closed receipt and released18489,
but remained alive, so start initially returned loaded=true/ready=false for that
old process. After checking its exact saved PID/start identity, matching closed
session and absent listener, maintenance terminated only that closed Web process
with SIGHUP, then used the standard service start. No Agent/job PID or execution
lease was terminated, removed or replayed. The new entrypoint explicitly exits
after graceful shutdown; no service-manager code was changed in this rollout.

The production snapshot matched actual MCP metadata: one retained uncertain Alice
native owner, zero waiting reservations, three available admission slots, zero
fixed tasks recorded in progress and an observed empty model residency. The UI
keeps this lane blocker visible; successful UI/transport upgrade does not resolve
that separate native operation. The39 Needs review rows include historical
unknown/legacy receipts; they are not39 running tasks or39 occupied slots.
Completed history displayed150 recent rows, with older repository history still
accessible through each project's history browser. No business execution task,
model inference, permission change, plugin Refresh or Gateway restart was used
for acceptance. Runtime Key was not inspected, recovered, persisted or sent to Chat.

## Compact navigation and settled native-run recovery

The default landing view is now Task queue. Overview contains only transport
status/control, three transport metrics and recent communications; it no longer
repeats project task queues or history. Queue/overview explanatory paragraphs and
banners moved into accessible ? dialogs. Dialogs close with Escape or Close and
restore focus across live snapshot updates. Critical blocked state remains on the
actual task/card instead of a wall of explanatory text.

Replaced admission-slot terminology with computer-task count/limit and waiting
count. Empty physical slots are no longer drawn; only actual current/queued tasks
appear. The lane reads Idle/Busy/Blocked by old run, rather than implying a retained
lock means an actively working ChatGPT conversation. Interrupted/abnormal records
show concrete timeout, invocation-error, missing-receipt, login or legacy badges.
They remain distinct from confirmed failed/blocked history. Help reports the real
reason breakdown and the number of current resource holders.

A new local maintenance script, scripts/reconcile-computer-lane.mjs, implements
inspect then resolve with a five-minute review digest. It verifies the exact
original immutable receipt and reservation, original runner ESRCH, and exact native
sessions.describe terminal status with hasActiveRun=false and empty activeRunIds.
The native call is pinned to loopback Gateway18789 and never invokes a model or
reads a transcript. A private audit is written before compare-and-release; the
original receipt, operation claims, task effects and other queue entries remain
unchanged. Missing, changed, active or expired evidence blocks recovery. A lost
resolve response must be reconciled by reading its audit, not resubmitting work.

New detached computer-job runners also perform one bounded native settlement
query if a CLI exited without reliable terminal answer metadata. Only exact-session
terminal evidence releases their own lane; otherwise the original hold remains.
This does not turn an unknown business effect into success and never replays it.
Each new detached runner loads current source on launch, so this fix requires no
Tunnel/Web/Gateway restart or tool-catalog change. Frontend changes need only a
page refresh. Runtime Key and existing model configuration remain untouched.

### Actual recovery and acceptance

Full Node regression with test concurrency4: **1395 passed**, zero failures,
skips or cancellations. The earlier default-concurrency attempt had one20-second
legacy browser-loop fixture deadline failure under load; that fixture passed
alone, and both subsequent bounded-concurrency full runs passed (1394 then1395
with the new settlement test). Targeted recovery tests additionally verify no
release with live/missing/changed evidence and preservation of another project's
queued reservation.

Maintenance inspected the one retained Alice operation. Its original local
runner PID63130 was absent; exact native session07d01e0b-54ae-41b0-94fc-d1819faa4935
reported status=timeout, hasActiveRun=false and activeRunIds=[]. Resolve rechecked
that evidence and released only the matching active/reservation pair. The source
receipt SHA256 remained096745a53e72d7111e23ad7bc654ef088d6fa563dccde2e420050140c931e454.
The private audit records released/timeout/effectsVerified=false/doNotRepeat=true.
No model, Agent/game task, client/BDS restart, world change or operation replay
was invoked. The original unknown-effects receipt remains unchanged.

Independent real cloud MCP capabilities then returned laneStatus=idle,
admittedJobs=0, waitingReservations=0 and activeOrUnsettled=false. Production
browser displayed Idle,0 waiting and0/4 total computer tasks; explanation blocks
were absent. The default URL lands on Task queue; overview no longer duplicates
queue/history. The39 abnormal records consist of18 Agent timeouts,11 missing
receipts,8 CLI/channel failures,1 unverified client login and1 unfinished legacy
record. They are historical evidence, not39 current jobs or permission failures.
Read-only dialogs show the current holder count separately (now0).

Frontend is live after page refresh. Existing Web/Tunnel and Runtime Key remain
unchanged. Future detached workers load the new settlement logic on launch;
actual native terminal/active-refusal decisions were covered by injected native
RPC fixtures. No new real computer operation was submitted just to test it.
