# Alice independent computer Agent — prepared rollout

Updated 2026-10-29, Asia/Shanghai. **Applied with explicit user approval; local and actual web native acceptance passed.**

Actual web acceptance subsequently passed with
`web_alice_cursor_20261029_262d997ddf7c`, conversation
`alice_web_probe_262d997ddf7c`. The user returned ready/revision 2/not_found,
then one successful task and same-ID cached:true. Independent local receipt
confirmed returned/alice-ai/workerUsed:false; exact chat.history contained one
computer/get_cursor_position and native coordinates x=1295,y=684 matching the
web report. Cloud tools/call increased 11→16, all 200. Verification read existing
state only; no cursor or other desktop action was repeated. Do not resubmit.

The user explicitly instructed “启用 Alice 电脑工具”. The reviewed helper returned
applied, backupSaved:true, computerOnly:true, shellEnabled:false,
otherAgentsChanged:false and explicitServiceRestart:false. Whole-config disk
comparison and live Gateway layers passed. Shared Alice readiness passed.

One local shared-MCP cursor task then passed with operation ID
`shared_cursor_33ef7232-7c1b-449c-8a13-60de34210ee5`; the same-ID read returned
cached:true. Independent exact-session chat.history contained exactly one
`computer` call with `action:get_cursor_position`. No screenshots, enumeration,
mouse movement, clicks, input or task replay occurred. This is local Alice MCP
acceptance, not a new ChatGPT web Alice computer-task acceptance. The existing
web routing/resume acceptance remains valid; arbitrary application effects remain
unverified. Keep effectIndependentlyVerified:false in the original receipt.

The shared ChatGPT web MCP route has already passed Alice project-resume and
workflow native cursor/cached-receipt acceptance. Alice now allows its native
`computer` tool after the approved rollout, while
preserving its independent project workspace, sessions and receipt namespace.

## Concrete change for approval

`scripts/configure-alice-computer-agent.mjs` changes only
`agents.entries.alice-ai.tools` and Alice's private workspace `AGENTS.md`.
It changes the tool profile from minimal/deny-all to full/allow-computer-only.
Direct exec remains denied, code mode remains false, elevation remains disabled,
cross-Agent sends and subagents remain empty, and no skills are added. Existing
model/provider routing, owner, local-chat, workflow and other Agents are preserved.
Computer permission is not an operating-system sandbox: an authorized UI action
can affect the shared Mac, so each task must still specify its exact scope.

The new executor role leaves reasoning/planning/code generation with ChatGPT.
It does not authorize screenshots, focus/pointer changes, messaging, credentials,
Mint/SSH/Minecraft/BDS/world operations or replaying the Alice Coordinator handshake.
Those require their own applicable task authorization. The Coordinator is unchanged.

The helper requires the exact existing private advisor policy and role, canonical
independent workspace, local Gemma provider and no cloud fallback. Native CLI
dry-run validates the patch and checks neither config nor role changed. Apply
saves private before-images, checks the inputs again, writes the role and submits
the single-Agent patch, compares the entire resulting disk config and checks live
Gateway config layers. It never explicitly restarts a service or reads a key.
On partial/uncertain failure, inspect state and backups; do not blindly replay.

## Validation at this checkpoint

| Acceptance item | State | Evidence |
| --- | --- | --- |
| Policy isolation / unexpected privileges / cloud and workspace rejection | Passed | Three focused tests |
| Full regression | Passed | 1244 tests, 0 failures, concurrency 4 |
| Native config dry-run on this Mac | Passed | validated, configurationWritten:false, roleWritten:false |
| Actual Alice permission change | Applied | User approval, private backup, exact disk/live readback |
| Alice native computer task | Passed locally | One cursor call in independent history; same-ID cached receipt |
| Alice computer task from ChatGPT web | Passed | Actual user web result, exact receipt/history/coordinates and five correlated cloud calls |

Private test log: LunaDrive project cache `verification/alice-computer-preparation-tests.log`.
No private configuration, transcripts or secrets are part of this Git checkpoint.

## Operator / next-agent commands

No operator command is required now; the approved rollout and local validation
are complete. Do not replay apply or cursor tests as a health check. A status
query is sufficient for readiness (no model or desktop action):

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
bash scripts/dev-env.sh exec node scripts/direct-openclaw-shared-smoke.mjs --status alice-ai
```

Historical rollout command, **already executed successfully; do not rerun**:

```bash
bash scripts/dev-env.sh exec node scripts/configure-alice-computer-agent.mjs --apply
bash scripts/dev-env.sh exec node scripts/direct-openclaw-shared-smoke.mjs --status alice-ai
```

The seven MCP tool schemas stay the same. Do not restart the foreground Tunnel,
reenter its key, refresh plugin metadata or repeat the completed workflow cursor
test merely for this policy change. Alice's no-tools `openclaw_agent_message`
route will then refuse; use `openclaw_computer_task` with fresh project-scoped
operation/conversation IDs and read back the same ID with `openclaw_computer_result`.
Legacy Worker advisor preflight also fails closed after this migration; do not
weaken its guard or silently deploy/change that Worker.

The Alice project Chat owns subsequent actual development tasks and acceptance.
It should resume the latest Alice handoff and use a fresh conversation_key.
A new explicitly scoped task needs a new operation_id, followed by same-ID
computer_result. If uncertain, read the existing receipt instead of resubmitting.
Do not infer arbitrary application/file effects from this cursor-only test.
