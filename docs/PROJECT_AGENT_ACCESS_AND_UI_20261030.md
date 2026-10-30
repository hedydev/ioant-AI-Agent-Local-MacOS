# Project tools, project workspaces and removal — 2026-10-30

This operator-approved change supersedes the previous default deny-all policy for
this Mac's registered MCP project Agents. Historical Phase-1 audit restrictions
remain specific to their original browser-audit runtime.

## Permissions and scope

The operator explicitly requested the full tool profile for every ChatGPT-facing
project Agent, including computer access, and asked to see configuration and
actual capability use in the local Web console. ChatGPT's own confirmation policy,
macOS privacy permissions, provider configuration and task authorization remain
independent. Project keys route requests; they do not authenticate different people
or make this Mac public. No runtime credential is included in source or Git.

`scripts/configure-project-agent-access.mjs --dry-run|--apply` validates the local
registered identities, backs up private config and role files, patches only those
Agents and checks disk/live Gateway readback. It selects full profile, wildcard
allow, no denies, full current-user exec and file access. Local inference remains
pinned; normal project tasks do not use paid inference APIs. Unregistered system,
mac-computer and local-chat Agents are unchanged.

A private `project-agent-access.json` operator opt-in makes future dynamically
connected projects inherit full tools. Without that private opt-in, provisioning
retains the no-tools default. MCP callers cannot set this policy themselves.
Project workspaces, conversation keys and receipts remain distinct; full tools
are not an OS sandbox or proof of successful computer control.

Live MCP `openclaw_agent_status` for NetScale returned `ready`, `toolAccess:full`,
`toolsEnabled:true` and `computerControlEnabled:true` after the coordinated Tunnel
reload. Existing independent Chat receipts subsequently recorded successful exec
and computer tool names. These records do not independently validate their
business results. We did not replay a NetScale job or modify its checkout.
Dirty source checkouts still require explicit isolated repository execution for
pinned tests/builds; granting tools does not make local edits safe to overwrite.
The cloud's cached tool schema may need Refresh to expose workspace_mode.

## Web interface

URL: http://127.0.0.1:18489

- Overview owns Tunnel state, transport metrics, communication path and recent
  operations. Lifecycle buttons wrap instead of overflowing at compact widths.
- Sidebar label is Projects / 项目. Selected project has an active style and
  aria-current; project hash routes survive page refresh.
- A project view hides the global Tunnel/metrics area and shows only its Agent,
  repository, branch, actual configured capabilities and project receipts.
- Tasks show confirmed successful capability names. Script steps include runtime,
  tracked script path, state and exit status when recorded. Expanded steps survive
  snapshot updates. Native Agent receipts preserve successfulToolNames from the
  terminal receipt, not a claim made in the model's answer.
- Old receipts without tool evidence remain unknown. Child commands inside a
  script are not individually enumerated. Command stdout is still available via
  finished reports; a streaming terminal UI is not part of this change.

The actual Chrome app was used to verify project selection, hidden global status,
capability badges, refresh persistence, and the removal-dialog cancel path. The
initial in-app-browser attempt was replaced by ordinary Chrome after the user
separately enabled the ChatGPT Computer Use helper. OpenClaw/MCP permissions were
already enabled; these are separate host components.

## Remove generated projects

The loopback-only, same-origin/nonce-protected Web endpoint removes only generated
`repo-*` projects. Built-in workflow/Alice routing is protected. A project with an
active repository lock or unsettled native task cannot be removed by this action.

Removal reserves an operation ID, locks registration/execution, writes a retirement
gate, backs up private config/grants and any existing generated native Agent data,
and calls the supported native `agents.delete` RPC with `deleteFiles:false`.
It checks disk/live absence before publishing the grant removal. Repository files
and durable MCP receipts are retained; native session data is backed up because
native lifecycle deletion can prune session indexes even with deleteFiles:false.
The retained retired marker prevents late admissions. Partial mutations keep
locks for explicit reconciliation rather than automatic retries.

The first actual removal attempt proved that config.patch intentionally refuses
Agent-roster deletion, even though its dry run accepts the candidate schema. Disk,
live roster and grants were independently unchanged. That failed receipt remains.
After exact backup/readback and owned-lock reconciliation, a distinct supported
native-lifecycle operation removed each of the two obsolete acceptance Agents.
No config-write bypass or agents-delete file-pruning CLI was used.

Remaining registrations: workflow, Alice, the user's AWS checkout and NetScale.
The two test repositories and historical receipts remain on disk. Re-registering
an archived identity requires an operator-reviewed restore of its backed-up config
and grant plus retirement reconciliation; the UI does not auto-recreate or delete
old state. Do not restore a whole stale global config over newer unrelated changes.
Restore only the archived Agent entry and matching project grant after review.

## Verification and operations

Full Node regression: **1327 passed, zero failed/skipped/cancelled**. Additional
checks cover private opt-in, targeted config migration, local-only model policy,
route selection, durable removal/cache, active-task refusal, partial mutation
locks, CSRF, locale parity and text-safe UI rendering. Actual native permissions
and both fixture removals were independently read back.

Mac / bash, reusable commands (already run during delivery):

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
bash scripts/tunnel-console-service.sh status
bash scripts/dev-env.sh exec node scripts/configure-project-agent-access.mjs --dry-run
```

If the Web process is stopped, start it with:

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
bash scripts/tunnel-console-service.sh start
```

Web restarts clear the in-memory Runtime Key and stop its owned Tunnel. Enter the
existing key privately in Web → Overview → Start Tunnel; never paste it into chat.
Frontend-only changes use page refresh. Backend/MCP source changes require their
respective process reloads; never kill the stdio child alone or run two Tunnel
clients for the same ID. Gateway configuration hot readback required no service
restart. Existing script jobs survive MCP transport disconnection; query receipts,
not repeat tasks. Rollback of a project permission change uses its private backup
with targeted config patch and verified live readback, not a global stale restore.

Final live readback: the operator privately re-entered the Runtime Key after the
last Web restart. Tunnel returned ready. Actual MCP projects listed only the four
remaining registrations; Alice and NetScale status calls both returned full tools
and computerControlEnabled:true. No further credential entry or permission change
is needed for this delivered runtime. Final full regression:1327/1327 passed.

## Permission label clarification

User feedback identified that runtime/files/browser/repository capability tags used
neutral gray styling even when enabled, making them look unavailable. All labels
now show an explicit enabled/disabled/unverified state and a status symbol. Enabled
capabilities consistently use the success style; unknown state uses a warning style.
This is a frontend presentation correction, not a new permission grant. Existing
Tunnel/Gateway processes and runtime credentials remain untouched; refresh the
Chrome page to load the updated static assets.

This clarification passed the two existing locale/text-rendering checks and was
verified in ordinary Chrome: all six workflow permission labels read Enabled with
the success style. Fresh console data confirmed four registered full-tool Agents
and Tunnel ready. No service restart, credential entry or permission mutation.
