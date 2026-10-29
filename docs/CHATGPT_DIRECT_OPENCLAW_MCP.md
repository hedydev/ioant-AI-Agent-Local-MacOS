# ChatGPT directly calling the local OpenClaw Agent

The operator selected this direction on 2026-10-29: ChatGPT web chat is the
project lead; OpenClaw Agent is the local execution participant. The existing
Ops Worker is preserved for transition, not a mandatory part of the new path.

## Per-project ownership (operator clarification)

Each ChatGPT Project needs its own OpenClaw Agent, workspace, memory/session
history, permissions and task receipts. A shared global computer Agent must not
become every project's brain. The bridge code is shared, but each local MCP
launch profile pins a project. Remote tool arguments cannot switch Agents.

| Local project binding | OpenClaw Agent | Current scope |
| --- | --- | --- |
| `openclaw-workflow` | `openclaw-dev` | Actual ChatGPT text roundtrip accepted |
| `alice-ai` | `alice-ai` | Local status checked; separate ChatGPT connection not provisioned here |

The current implementation uses a fixed project per MCP launch/connection
profile. This does **not** mean the platform requires one Tunnel per project.
A shared-Tunnel project router is possible but not yet implemented here. The
current OpenClaw Mac plugin is the workflow project only; do not enable that
same fixed plugin in unrelated Projects and assume automatic isolation. Launches use:

```text
node integrations/chatgpt-openclaw/server.mjs --project openclaw-workflow
node integrations/chatgpt-openclaw/server.mjs --project alice-ai
```

No argument defaults to the existing workflow binding for the accepted installed
profile. Unregistered names fail. Workspace checks reject unexpected paths,
overlapping project workspace roots and explicitly shared Agent state dirs.
Session keys include project identity even if callers reuse a conversation key;
computer-task receipts use separate private per-project directories and include
project/Agent identity in the request digest. Tests cover same-key and same-ID
cross-project cases. This is application/session isolation, not a separate OS
user or sandbox. Physical desktop and local model compute remain shared; native
execution leases must coordinate access without releasing another actor's lease.

```text
ChatGPT custom MCP tool
  -> OpenAI Secure MCP Tunnel
  -> local stdio MCP adapter
  -> existing OpenClaw Gateway Agent turn
  -> local Ollama model and approved OpenClaw tools
  -> tool result returned to the originating ChatGPT invocation
```

The adapter translates the supported MCP request into an Agent turn. It does
not watch browser messages, type replies into ChatGPT, call Codex or make
OpenAI model API requests. It does not replace the Agent's execution logic.

## Current acceptance boundary

The initially accepted adapter deliberately targets the existing **no-tools**
`openclaw-dev` Agent and pinned local `ollama/gemma4:26b-a4b`. Its two MCP tools
are `openclaw_agent_status` and `openclaw_agent_message`. It accepts a bounded
message and conversation key; the caller cannot select agents, backend models,
remote channels, shell arguments or filesystem paths.

On this Mac, the real MCP protocol initialization, tool discovery, local Agent
call and exact response `DIRECT_MCP_READY` passed. Full regression: 1200 tests
passed, 0 failed. The local Agent receipt identified Ollama and the expected
model. No Worker was used. A local-model turn still processes tokens and uses
Mac compute; it is not a paid cloud-model call or Codex inference call.

**Current boundary:** the actual ChatGPT text roundtrip is accepted as recorded
below. Project computer control, file edits and background ChatGPT delivery are
not yet accepted. The advisor reply is explicitly
untrusted analysis, not execution evidence. This text-only initial scope is
intentional: an uncertain request cannot replay a desktop action. Broader
execution needs a separate configured tool policy and persistent operation
identity/receipts before enabling actions. Do not grant tools to this advisor
silently or equate successful communication with computer-control acceptance.

### Project computer-task admission (source implementation)

Two additional tools are implemented: `openclaw_computer_task` and
`openclaw_computer_result`. They use the **bound project's own Agent**, never
the global `mac-computer` test Agent. A task requires an explicit computer-only
policy on that project Agent; current no-tools workflow/Alice Agents reject it
until project-specific permissions are configured. This update does not change
those live permissions.

The local private ledger reserves an operation ID before inference. A repeat
returns the saved result; conflicting content under the same ID is blocked.
Crash/timeout/uncertain receipts never trigger a retry. Receipt reads do not
execute actions. Each project's ledger is bounded at 500 entries and refuses
new admissions when full; it does not delete history automatically. Responses
are bounded/redacted; raw prompts and transport secrets are not stored.
Computer tools are labeled mutating in MCP. Returned model text and successful
tool names are not independent proof of the intended application effect.

Separate actual Mac capability evidence: the pre-existing `mac-computer` Agent
completed one local `get_cursor_position` call through the native computer tool.
Exact-session history showed that action, and activity audit recorded computer
tool success. This proved the local Agent/tool path without moving the pointer
or typing. It was a capability test, not permission for every project or proof
of a ChatGPT-originated desktop task.

After a planned adapter reload/ChatGPT metadata refresh, the catalog contains
four tools. Existing tunnel processes may retain the accepted two-tool catalog.
Do not restart an active tunnel just to expose disabled project permissions;
stage the catalog update with the next project's permission rollout.

The status tool only reads local policy, not live Gateway availability.
The message tool validates the local-only config before invoking and checks
the backend identity in the returned Agent receipt. Failure is reported once
without automatic retry or routing to another model.

## Local checks (Mac Terminal)

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
bash scripts/dev-env.sh exec node scripts/direct-openclaw-mcp-smoke.mjs --status
# Check the separate Alice binding without contacting its ChatGPT conversation:
bash scripts/dev-env.sh exec node scripts/direct-openclaw-mcp-smoke.mjs --status --project alice-ai
# Explicit local-model text inference; no computer tools:
bash scripts/dev-env.sh exec node scripts/direct-openclaw-mcp-smoke.mjs --message-test
```

The adapter reuses MCP SDK 1.32.0 bundled in the installed OpenClaw Node 24.22.1
package. No npm package installation is performed. If that installation moves,
inspect the actual OpenClaw runtime and update the loader before reconnecting;
do not silently install a second runtime. Neither check restarts services.

## Tunnel setup

Official flow: [connect ChatGPT](https://developers.openai.com/plugins/deploy/connect-chatgpt)
and [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).

1. In [Platform Tunnels](https://platform.openai.com/settings/organization/tunnels),
   create/reuse a tunnel associated with both the personal Platform organization
   and the actual target ChatGPT workspace. Obtain its genuine `tunnel_...` ID.
2. The runtime-key principal requires Tunnels Read + Use; creation/editing needs
   Read + Manage. Obtain a restricted runtime key in Platform; never paste it
   into ChatGPT, repository files, command arguments or screenshots. The runtime
   key authenticates the transport and does not select an OpenAI inference model.
3. The official latest client was downloaded outside the repository to the
   private LunaDrive tools cache and verified against SHA256SUMS.txt. Installed
   version during this setup: v0.0.18, darwin-arm64. The runbook's download source
   remains [official latest release](https://github.com/openai/tunnel-client/releases/latest).
4. Configure a private stdio profile and run it in an operator-controlled
   foreground terminal. Do not use nohup/disown or replace the running Ops
   Worker. Do not expose the OpenClaw Gateway directly to the internet.
5. While the tunnel client is ready, ChatGPT Plugins -> Add -> Add custom MCP
   server -> Tunnel: select/paste that ID. Name it `OpenClaw Mac`. For this stdio
   adapter there is no upstream OAuth server; the tunnel account/workspace
   restriction provides the transport boundary. Select the UI's no-upstream-auth
   option if available, rather than entering fabricated OAuth credentials.
6. In a new ChatGPT conversation, enable the custom plugin, call status first,
   then send the fixed text challenge. Only an actual response there establishes
   ChatGPT integration. Keep the existing Worker until this result is verified.

The user supplied a real tunnel ID and its private local profile has been
created at `~/Library/Application Support/ioant-openclaw-ops/direct-tunnel/`.
The ID and account credentials are not committed. To enter the runtime key
privately and start the checked profile in **Mac Terminal**:

```bash
bash "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS/scripts/direct-openclaw-tunnel.sh"
```

The script reads a hidden key only in an interactive terminal, uses an environment
reference rather than argv/config text, runs the official doctor, and then runs
the foreground client. Leave that terminal open; Ctrl-C stops this tunnel only.
It does not save the key, install a launch service or restart existing services.
No account API key has been read or configured by the assistant. Tunnel readiness
and account permissions remain prerequisites. This setup does not establish
pricing or availability beyond what the account UI and official service expose.

### Network diagnosis during initial connection

The first foreground client's local `/healthz` and `/readyz` returned 200, but
its counters showed zero successful cloud polls and repeated 30-second polling
failures. **Local readiness alone is not proof of a connected tunnel.** The
ChatGPT setup also displayed a rate-limit error; do not infer its exact cause
from that UI message alone or repeatedly retry app creation.

Independent network probes on this Mac found direct `api.openai.com:443`
connection timeout, while the already configured macOS HTTP(S) proxy
`127.0.0.1:7897` returned an HTTP response in about half a second. The launcher
now passes the official `--control-plane.http-proxy` flag for doctor and run.
It does not change the system proxy or proxy local Agent/MCP/Ollama requests.
This is an explicit host transport configuration, not a silent fallback.

After updating the launcher, stop only its existing foreground process with
Ctrl-C and run the same command again, entering the key privately. Verify a
positive `commands_poll_last_successful_timestamp_seconds` and successful poll
counts, then an actual ChatGPT discovery/call before reporting connection.

## Delivery and later execution

These are additive source files; no existing Agent, Gateway, Worker or Alice
Coordinator was modified/restarted. The stdio MCP process starts only when a
client explicitly launches it. Stopping that client closes the adapter.

Once actual ChatGPT communication is proven, configure a separately scoped
execution Agent and test one harmless local action plus independent readback.
Preserve the current native CUA consent and exact-window/noninterference gates.
Do not use the Ops path as a second AliceAI Chat writer or replay its pending
Coordinator handshake.

Actual post-restart evidence: two completed cloud polls labeled `error=false`,
a positive last-successful-poll timestamp, and no poll-error series observed.
This resolves the measured cloud connectivity failure. ChatGPT app creation
and an actual tool response remain independent acceptance steps.

## Actual ChatGPT web acceptance (2026-10-29)

The operator enabled OpenClaw Mac in ChatGPT web and reported successful
`openclaw_agent_status` followed by `openclaw_agent_message`, receiving exactly
`DIRECT_CHATGPT_OPENCLAW_READY`. The returned backend was local Ollama /
`gemma4:26b-a4b`, with Worker unused and tools/computer control disabled.
The tunnel independently showed successful cloud polls and forwarded commands.
This accepts the direct **communication** path; it does not accept computer use.
The status tool's initial hard-coded `chatgptConnectionVerified:false` is a
conservative local-check marker and does not negate an observed caller roundtrip.

Per-project implementation validation: full native Mac regression 1210/1210
passed, shell syntax passed, and separate Alice local MCP readiness passed.
No project Agent tool policy was expanded by these source changes.

## Current workflow project's computer rollout

The operator then explicitly requested continuing execution setup. The fixed
`scripts/configure-workflow-computer-agent.mjs` now provides `--dry-run` and
`--apply` for **openclaw-workflow only**. It validates the existing no-tools
policy and distinct private workspace, uses OpenClaw's own config dry run,
saves private before-images of config and role text, checks prewrite state,
and changes only `openclaw-dev.tools` plus its project role description.
The granted allowlist is exactly `computer`; exec, elevation and cross-Agent
calls remain disabled. Other project entries, model routes and Gateway settings
must be unchanged on readback. An unexpected or uncertain write is reported,
never retried. Existing local backups are the recovery evidence.

Once this policy is applied, generic `openclaw_agent_message` refuses calls for
that capable Agent: use `openclaw_computer_task` with an operation ID, including
for plain messages to that Agent. Status reports the preferred tool. This keeps
desktop-capable requests behind durable task admission. The old text-only
Worker discussion guard is expected to reject the newly capable Agent; the
direct MCP path is its intended replacement. The old Worker transport and fixed
command actions are not reconfigured here.

Mac commands (only the explicit apply command changes configuration):

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
bash scripts/dev-env.sh exec node scripts/configure-workflow-computer-agent.mjs --dry-run
bash scripts/dev-env.sh exec node scripts/configure-workflow-computer-agent.mjs --apply
bash scripts/dev-env.sh exec node scripts/direct-openclaw-mcp-smoke.mjs --status
# One explicit local-model native cursor-read test, no pointer movement or input:
bash scripts/dev-env.sh exec node scripts/direct-openclaw-mcp-smoke.mjs --computer-read-test
```

After local acceptance, refresh the MCP adapter and ChatGPT plugin tool catalog
at a controlled point. If a foreground tunnel restart is required, Ctrl-C only
that tunnel and run `scripts/direct-openclaw-tunnel.sh` again with private key
input. No OpenClaw Gateway, existing Worker or Alice Coordinator restart is
requested. Actual ChatGPT computer-task acceptance remains a separate test.

Actual current-project rollout: 1212/1212 regressions passed; the fixed helper
returned `applied` with private backup and role update, explicit service restart
false, shell disabled and Alice unchanged. Local MCP computer task
`cursor_7ad32407-1d7e-4bb1-8a65-b7f9c6da5013` passed, and querying its saved
receipt did not execute it again. Audit and exact-session history independently
confirmed one successful computer action: `get_cursor_position`. The workflow
Agent is now computer-capable; use its operation-ID task tool. Alice remains
text-only. Final ChatGPT-originated desktop acceptance awaits adapter reload
and plugin metadata refresh by the operator.
