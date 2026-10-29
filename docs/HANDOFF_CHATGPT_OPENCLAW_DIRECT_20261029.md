# ChatGPT web ↔ local OpenClaw Agent — current handoff

Updated 2026-10-29, Asia/Shanghai. This is the current direction and evidence
summary for this implementation, superseding conflicting older plans.

Latest checkpoint: at approximately 10% remaining usage, preparation was pushed
and verified as 567dbbd. The user then explicitly approved Alice computer tools.
The fixed Alice-only migration is now applied with private backup and exact
disk/live readback; shell/elevation/delegation remain disabled, other Agents
unchanged. Local Alice shared-MCP cursor and same-ID cached receipt passed;
independent history contained one get_cursor_position. Full regression remains
1244/1244 (no source changes after preparation). Read
`docs/ALICE_COMPUTER_AGENT_ROLLOUT_20261029.md`. Do not replay apply, prior
cursor tests, Tunnel restart or plugin Refresh. Alice web-originated computer
task and arbitrary app effects are not yet accepted.

## Operator's required working model

- Official ChatGPT web chat owns conversation, requirements, reasoning,
  planning, code generation and result assessment.
- OpenClaw Agent executes local tasks and returns evidence. Runtime must not
  depend on Codex Work/Chat inference or paid cloud-model API calls.
- Each project has an independent Agent, workspace/memory, sessions, tool
  policy and task receipts. Local Ollama can serve these independent Agents.
- A Tunnel is a transport to the Mac, not a project identity. One Tunnel may
  carry an explicitly enabled multi-project router. One Tunnel per project is
  not required. Fixed --project mode remains; new --shared-projects mode has
  passed local seven-tool/dual-project MCP checks and actual web acceptance.
  The shared foreground Tunnel and plugin metadata refresh are already deployed.
- During active work, check usage. At about 10% remaining in an available
  relevant window, notify the user, commit scoped code and `docs` handoff,
  push and verify Git. Do not publish credentials or private runtime artifacts.

## Verified state

| Item | Evidence / boundary |
| --- | --- |
| ChatGPT custom MCP plugin | User created and connected OpenClaw Mac through an actual Platform Tunnel |
| Transport | Official tunnel-client v0.0.18; cloud polls succeeded after explicit existing system HTTPS proxy was configured |
| Text roundtrip from ChatGPT | User called status/message and received exactly `DIRECT_CHATGPT_OPENCLAW_READY`; local Ollama / Gemma; no Worker |
| Per-project routing | Fixed and explicit shared modes; workflow → openclaw-dev, Alice → alice-ai. Shared calls select an enabled project_key, never an arbitrary Agent/path |
| Project isolation checks | Distinct expected workspaces, private/canonical workspace admission, project-scoped session digests and separate receipt directories; tests passed |
| Root project permissions | Fixed helper returned `applied`; `openclaw-dev` allows only `computer`; direct exec/elevation/cross-Agent calls disabled |
| Other live config | Workflow rollout preserved Alice; subsequent separately approved Alice-only rollout preserved all other Agent entries |
| Alice computer rollout | Explicit approval; private backup, exact disk/live readback, local shared-MCP cursor and cached receipt passed; history contained one cursor call |
| Role / backup | Workflow AGENTS role updated for ChatGPT-led execution; private original role and config saved in `~/.openclaw/backups/` |
| Native local capability | `mac-computer` test Agent invoked one native cursor read, verified from session history and activity audit |
| Actual project Agent through MCP | `openclaw-dev` cursor task passed; saved receipt finished; readback cached; exact-session history contained only `get_cursor_position`; one successful computer audit |
| Regression | Latest full suite 1244/1244 passed with concurrency 4, including three Alice migration policy tests |
| Shared Tunnel deployment | User restarted the foreground client; actual child argv confirmed shared two-project mode; positive cloud polls and no polling errors |
| Plugin metadata refresh | Authorized native Chrome path Plugins → OpenClaw Mac → Manage → Refresh tools completed once; real cloud initialize/discover/tools-list calls returned 200 |
| Shared local native acceptance | Project-key MCP cursor task plus cached result passed; exact session history contained only get_cursor_position |
| Alice web new-chat acceptance | User returned actual projects/status/resume results: two projects, alice-ai ready, handoff_found revision 1; correlated cloud tools/call count increased from 0 to 3, all 200 |
| Workflow web computer acceptance | User's actual status/task/result passed; web_cursor_accept_20261029_a7c4d9e2 returned with cached:true and computerToolSucceeded:true. Independent history proved one get_cursor_position; cloud tools/call increased 3→6, all 200 |
| Acceptance boundary | Project routing, new-chat handoff read, native cursor task and cached readback passed. Arbitrary app/file effects and Alice computer permissions are not included |

Initial computer task receipt:
`cursor_7ad32407-1d7e-4bb1-8a65-b7f9c6da5013`.
No pointer movement, clicks, typing or file edits were part of that read test.
This is not acceptance of arbitrary UI tasks or Alice project actions.

## Latest operator priority: checkpoint, then a separate chat Agent

The operator requested a new independent OpenClaw conversational Agent with
deep-thinking capability and fast everyday responses, then explicitly said to
commit/push code and documentation **first**, before configuring OpenClaw.
The inventory and existing benchmark review are documented in
`docs/LOCAL_CHAT_AGENT_PLAN_20261029.md`. The pre-configuration checkpoint was
pushed and verified as `4cacf91`. Independent `local-chat` (本地聊天) is now
installed with local GPT-OSS 20B, low default thinking and denied action tools.
Gateway multi-turn chat and a reasoning answer passed. Missing GPT-OSS thinking
capability metadata was corrected narrowly; an explicit high-effort request
then succeeded. Existing project Agent entries were preserved. Full tests now
pass 1216/1216 after the Qwen supplement. `qwen3.8:27b-mlx` is additionally
allowed as a session-selected alternative in 本地聊天; GPT-OSS stays the
default. Local API greeting and reasoning probes passed, with slower measured
generation on this Mac. See the model document for Gateway acceptance limits.
User acceptance in the OpenClaw Chat UI remains pending.

The direct desktop integration has passed local shared-project native task/readback
and the actual cloud metadata refresh. A fresh ChatGPT chat must still exercise
the new tools; do not infer that from the successful metadata scan alone.
Shared-Tunnel routing and revisioned project handoffs are now implemented and
locally verified. See `docs/CHATGPT_PROJECT_CONTINUITY_20261029.md`. The operator
requires replacing a full ChatGPT chat without replacing the project Agent:
the new chat uses a fresh conversation_key and resumes the durable project
handoff, then checks old receipts instead of repeating uncertain work. Current
web deployment/acceptance remains pending; do not claim the whole flow complete.

## Code and runtime ownership

Source: `~/Documents/workspace/ioant-AI-Agent-Local-MacOS`.
The direct bridge is `integrations/chatgpt-openclaw/` and runs from source.
The old Worker private runtime remains under
`~/Library/Application Support/ioant-openclaw-ops/runtime`; it was not replaced
or used for the new MCP task. Do not overwrite it or stop Alice Coordinator.

Project registration is local, not automatically inferred from a ChatGPT
Project. Fixed mode remains bound to one project. Shared mode requires an
explicit enabled project_key on all scoped tools; openclaw_projects lists the
registered choices. The key routes but does not authenticate ChatGPT Project
identity. The same private plugin can access the locally enabled projects.

MCP tools in current source (fixed mode retains these four):

- `openclaw_agent_status`: local policy readiness, not proof of cloud connectivity.
- `openclaw_agent_message`: no-tools advisors only. The now computer-capable
  workflow Agent refuses this unreserved route and directs callers to task mode.
- `openclaw_computer_task`: bound project's desktop task; reserve operation ID
  before inference, never automatically replay uncertain work.
- `openclaw_computer_result`: fetch the existing receipt without execution.

Shared mode additionally exposes openclaw_projects, openclaw_project_resume and
openclaw_project_handoff, for seven tools. Private immutable handoff revisions
use expected_revision conflicts and fresh referenced receipts. An actual local
save followed by a fresh-process resume passed; Alice remained independently
empty. These are local MCP tests, not actual ChatGPT web new-chat acceptance.

Latest: workflow handoff revision 4 and separately seeded Alice connection-only
revision 1 resume in new local MCP processes. Shared private profile is deployed,
the user-entered key remains private, and native plugin Refresh tools completed.
Native setup scripts were exercised without model inference, screenshots,
browser Relay/CDP, permission changes, plugin version changes or chat sends.
Source validation details and the genuine local-vs-web boundary are in the
continuity document. Alice's actual web new-chat result is now confirmed by
the user and three successful cloud tools/call requests. The subsequent workflow
web computer-task/readback also passed, corroborated by cloud tools/call 3→6,
the exact local receipt and an independent one-action session history. No more
installation or acceptance probes need to be replayed.

The project task store persists privately under the local app-support root,
separately for each project. An unfinished/uncertain receipt means investigate,
not choose another ID to rerun the action. Computer success metadata is not
independent proof that an application's intended visible effect occurred.

## Exact next actions

1. The shared profile, foreground restart and native Refresh tools step are
   already done. Do not replay them as a health check. If checking health, use
   positive recent cloud polls, not just /readyz; the loopback port is dynamic.
   Never inspect a process environment or retrieve its Runtime Key.
2. Alice new-chat projects/status/resume acceptance passed: actual Agent/project
   alice-ai, ready, revision 1, matched to three successful cloud calls. Do not
   rerun it merely because an older asynchronous result question remains open.
3. Correlate genuine ChatGPT tool results with the tunnel's tools/call count.
   initialize/tools/list 200 from metadata refresh alone does not prove a chat
   invoked a tool. Do not send messages into Alice Chat on behalf of its owner
   or replay the old Coordinator handshake.
4. Workflow web cursor acceptance also passed. Do not reuse completed local or
   web operation IDs. A new actual user task needs its own explicit scope,
   project key and operation ID; application effects need separate readback.
5. Use factual handoff/save and new-chat resume during normal work; a fresh
   chat uses a new conversation_key and current expected_revision. Unsaved old
   chat context cannot be reconstructed automatically.
6. Alice's separately approved computer-only rollout is now applied and passed
   local native cursor/cached-receipt acceptance. The Alice project Chat can
   resume its latest handoff and issue a fresh explicitly scoped task. Direct
   exec, elevation, cross-Agent sends, skills and subagents remain disabled.
   The advisor message route now refuses; use computer_task/result. This does
   not authorize Alice Chat writes, Mint/SSH or Minecraft/server operations.

## Mac Terminal commands

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
# Readiness only; no model invocation:
bash scripts/dev-env.sh exec node scripts/direct-openclaw-mcp-smoke.mjs --status
bash scripts/dev-env.sh exec node scripts/direct-openclaw-mcp-smoke.mjs --status --project alice-ai
# Shared-mode readiness and persisted Alice handoff, also no model/desktop:
bash scripts/dev-env.sh exec node scripts/direct-openclaw-shared-smoke.mjs --status
bash scripts/dev-env.sh exec node scripts/direct-openclaw-shared-smoke.mjs --resume alice-ai
# Only when restarting the user's foreground tunnel is needed:
bash scripts/direct-openclaw-tunnel.sh
```

The user privately enters a restricted runtime key with Tunnels Read + Use.
The script does not save it, echo it, put it on argv or send it to an Agent.
Only transport control-plane traffic uses the existing host HTTPS proxy;
local Gateway/MCP/Ollama traffic is unaffected. Do not put the key in Git or chat.

Do not replay `configure-workflow-computer-agent.mjs --apply` after an ambiguous
result. This rollout is already applied and readback-verified. Preserve the
private before-images and compare current state before any future recovery.
