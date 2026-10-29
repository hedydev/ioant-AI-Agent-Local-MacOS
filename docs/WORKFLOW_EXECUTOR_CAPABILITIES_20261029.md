# ChatGPT-led local execution: capabilities and acceptance

The operator's intended workflow is ordinary conversation, reasoning and code
generation in official ChatGPT web chat, with the existing Worker/OpenClaw stack
performing local operations and returning evidence. The deployed workflow must
not depend on Codex Work/Chat usage or paid model API calls. Development in this
Codex conversation is a separate, acknowledged use of its account allowance.

## Passive capability inventory

From the Mac source checkout:

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
bash scripts/dev-env.sh exec node scripts/workflow-capabilities.mjs
```

This command reads the exact recognized installed Ops LaunchAgent, current
service state, existing per-chat terminal/window grants, bound pending-feedback
state and private Agent configuration. It emits only fixed categories and
booleans. There is no model request, browser access, screenshot, desktop input,
chat send, permission change or service restart. Other platforms, unknown
LaunchAgents and unavailable evidence remain unverified. A running service is
not proof that ChatGPT is currently readable or that a reply can be sent.

The report distinguishes:

| Capability | Executor | Model needed? |
| --- | --- | --- |
| Fixed project checks | Worker child processes | No |
| Authorized terminal operations | Worker `/bin/zsh` | No |
| Separately granted window text input | Worker window adapter | No |
| Native Computer Use | OpenClaw Gateway and paired Mac node | No, for direct commands |
| Technical Agent discussion | OpenClaw Agent with local model | Yes |
| Model inference smoke actions | Local model or Agent | Yes |

The terminal grant uses working-directory aliases, not an OS sandbox; an
authorized command retains the current user's filesystem permissions. This
report does not broaden that grant. The existing no-tools `openclaw-dev` Agent
can provide advice but cannot itself inspect/edit projects or run tests.

The current recognized launcher binds `--dev-agent openclaw-dev`. Removing that
flag would disable that discussion path but would not by itself remove all
inference smoke routes. This change inventories those routes; it does not alter
model configuration or disable other users of the local model service.

## Explicit terminal execution acceptance

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
bash scripts/dev-env.sh exec node scripts/workflow-terminal-smoke.mjs --run
```

This explicit command uses the existing terminal authorization for the installed
Ops conversation. It asks the same terminal executor to run a reviewed fixed
child script, writes one new private UUID-named fixture under the LunaDrive
project verification directory, then independently reads its ownership, mode,
content and operation ID. Zero exit status alone cannot pass the check. It
overwrites/deletes no previous fixture and does not execute arbitrary supplied
paths or commands. Missing authorization fails without running the child.

The fixture contains only a fixed test marker, random operation ID, schema,
arithmetic result and model-call flag; no project code or private conversation
text. The command emits one bounded result. It leaves the fixture for evidence.
Exit zero means the write/readback passed; other states exit nonzero. Re-running
creates a distinct test operation and does not replay an old one.

This proves **terminal executor → file → independent readback**, not a full
ChatGPT message roundtrip. It intentionally reports `chatRoundtripVerified:false`.
No ChatGPT message or Alice Coordinator handshake is sent. Background ChatGPT
composition and delivery remain unverified, consistent with the native CUA
direction and single-writer boundaries.

## Validation and delivery boundary

On the actual Mac, 2026-10-29:

- New targeted tests: 8 passed, 0 failed.
- Passive inventory: recognized local binding, running service, terminal
  authorized, window-text grant absent and no pending feedback observed.
- Explicit terminal acceptance: passed with operation
  `803fc605-1c7b-48df-ab4f-a1c669494b9d`; write and independent readback verified.
- Complete native Mac regression: 1194 passed, 0 failed; all `scripts/*.sh`
  passed `bash -n`. Evidence is also recorded in the task event ledger.

These additive scripts run from the source checkout. They do not require a
Gateway, Worker or Alice Coordinator restart, and are not new Worker protocol
actions. The running private runtime is unchanged. For later Worker deployment,
retain the existing protected candidate-test/update/confirmed-feedback/reload
procedure; do not replace its files or clear its locks to deploy these scripts.

Next acceptance is a user-authorized project task through the actual ChatGPT
transport, followed separately by native window interaction where necessary.
No new MCP service, cloud API account, extension installation or model download
is introduced by this work.
