# ChatGPT directly calling the local OpenClaw Agent

The operator selected this direction on 2026-10-29: ChatGPT web chat is the
project lead; OpenClaw Agent is the local execution participant. The existing
Ops Worker is preserved for transition, not a mandatory part of the new path.

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

The initial adapter deliberately targets the existing **no-tools**
`openclaw-dev` Agent and pinned local `ollama/gemma4:26b-a4b`. Its two MCP tools
are `openclaw_agent_status` and `openclaw_agent_message`. It accepts a bounded
message and conversation key; the caller cannot select agents, backend models,
remote channels, shell arguments or filesystem paths.

On this Mac, the real MCP protocol initialization, tool discovery, local Agent
call and exact response `DIRECT_MCP_READY` passed. Full regression: 1200 tests
passed, 0 failed. The local Agent receipt identified Ollama and the expected
model. No Worker was used. A local-model turn still processes tokens and uses
Mac compute; it is not a paid cloud-model call or Codex inference call.

**Not yet verified:** actual ChatGPT-to-tunnel call, computer control, project
file edits or background ChatGPT delivery. The advisor reply is explicitly
untrusted analysis, not execution evidence. This text-only initial scope is
intentional: an uncertain request cannot replay a desktop action. Broader
execution needs a separate configured tool policy and persistent operation
identity/receipts before enabling actions. Do not grant tools to this advisor
silently or equate successful communication with computer-control acceptance.

The status tool only reads local policy, not live Gateway availability.
The message tool validates the local-only config before invoking and checks
the backend identity in the returned Agent receipt. Failure is reported once
without automatic retry or routing to another model.

## Local checks (Mac Terminal)

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
bash scripts/dev-env.sh exec node scripts/direct-openclaw-mcp-smoke.mjs --status
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
