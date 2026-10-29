# ChatGPT web ↔ local OpenClaw Agent — current handoff

Updated 2026-10-29, Asia/Shanghai. This is the current direction and evidence
summary for this implementation, superseding conflicting older plans.

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
  passed local seven-tool/dual-project MCP checks. Cloud rollout still requires
  preparing/restarting the foreground tunnel and refreshing its plugin metadata.
- During active work, check usage. At about 10% remaining in an available
  relevant window, notify the user, commit scoped code and `docs` handoff,
  push and verify Git. Do not publish credentials or private runtime artifacts.

## Verified state

| Item | Evidence / boundary |
| --- | --- |
| ChatGPT custom MCP plugin | User created and connected OpenClaw Mac through an actual Platform Tunnel |
| Transport | Official tunnel-client v0.0.18; cloud polls succeeded after explicit existing system HTTPS proxy was configured |
| Text roundtrip from ChatGPT | User called status/message and received exactly `DIRECT_CHATGPT_OPENCLAW_READY`; local Ollama / Gemma; no Worker |
| Per-project routing | Fixed local `--project` binding; workflow → `openclaw-dev`, Alice → `alice-ai`; remote arguments cannot switch Agents |
| Project isolation checks | Distinct expected workspaces, private/canonical workspace admission, project-scoped session digests and separate receipt directories; tests passed |
| Root project permissions | Fixed helper returned `applied`; `openclaw-dev` allows only `computer`; direct exec/elevation/cross-Agent calls disabled |
| Other live config | Whole-config readback matched the expected single-tools-entry change; Alice and other entries unchanged |
| Role / backup | Workflow AGENTS role updated for ChatGPT-led execution; private original role and config saved in `~/.openclaw/backups/` |
| Native local capability | `mac-computer` test Agent invoked one native cursor read, verified from session history and activity audit |
| Actual project Agent through MCP | `openclaw-dev` cursor task passed; saved receipt finished; readback cached; exact-session history contained only `get_cursor_position`; one successful computer audit |
| Regression | Current full suite 1233/1233 passed with concurrency 4; final targeted follow-up passed; shell syntax and whitespace checks passed |
| Remaining web acceptance | User's ChatGPT session still listed only the original two tools. New task/result metadata refresh remains pending |

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

The direct desktop integration remains at the acceptance boundary above:
local project computer-task/readback passed; user-side ChatGPT tool catalog
still showed only the original two tools and needs a verified metadata refresh.
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

The project task store persists privately under the local app-support root,
separately for each project. An unfinished/uncertain receipt means investigate,
not choose another ID to rerun the action. Computer success metadata is not
independent proof that an application's intended visible effect occurred.

## Exact next actions

1. Verify the operator's foreground tunnel is running with successful cloud
   polls, not merely local `/readyz`. Its loopback health port changes on restart.
   Read metrics; never inspect a process's environment or retrieve its runtime key.
2. Prepare the existing private shared profile using the reviewed helper,
   restart ONLY the user's foreground tunnel, privately entering its Runtime Key.
   Do not retrieve that key from the old process environment. See the continuity
   document for exact commands. No new Tunnel is required.
3. In ChatGPT **Plugins**, open OpenClaw Mac details and **Refresh** its tool
   metadata. The `@` composer menu only lists the plugin name, not its internal
   tools. Use a new conversation after refresh. Shared mode advertises seven
   tools; a stale conversation can still show two or four.
4. If a tunnel reload is actually needed, the user presses Ctrl-C in only that
   foreground tunnel and runs the command below, entering the runtime key
   privately. No Gateway/Worker/Coordinator restart is required.
5. Have ChatGPT first call openclaw_projects and the selected project's status,
   then issue one explicitly read-only `openclaw_computer_task` for
   `get_cursor_position`, with a unique operation ID, no screenshots/pointer
   movement/clicks/typing/file changes. Verify the return and query its saved
   receipt with `openclaw_computer_result` instead of rerunning it.
6. Only then move to a harmless user-authorized application task with effect
   readback. Configure further project scopes deliberately; Alice remains
   independently text-only until its own rollout.
7. Save a factual project handoff, then verify a new Chat can resume it without
   invoking a model/desktop action or repeating an old operation. Alice stays
   independently text-only until its own user-authorized rollout.

## Mac Terminal commands

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
# Readiness only; no model invocation:
bash scripts/dev-env.sh exec node scripts/direct-openclaw-mcp-smoke.mjs --status
bash scripts/dev-env.sh exec node scripts/direct-openclaw-mcp-smoke.mjs --status --project alice-ai
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
