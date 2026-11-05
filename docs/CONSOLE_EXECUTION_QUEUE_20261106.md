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
