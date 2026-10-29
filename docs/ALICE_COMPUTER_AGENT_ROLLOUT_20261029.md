# Alice independent computer Agent — prepared rollout

Updated 2026-10-29, Asia/Shanghai. **Prepared and validated; not applied.**

The shared ChatGPT web MCP route has already passed Alice project-resume and
workflow native cursor/cached-receipt acceptance. Alice itself still has denied
tools. The next optional rollout enables its native `computer` tool while
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
| Actual Alice permission change | Not applied | Awaiting explicit scoped rollout approval |
| Alice native computer task | Not performed | Test only after approved configuration and live readiness |

Private test log: LunaDrive project cache `verification/alice-computer-preparation-tests.log`.
No private configuration, transcripts or secrets are part of this Git checkpoint.

## Operator / next-agent commands

No operator command is required now; the validated script is prepared for review.
To repeat only the configuration validation (no model or desktop action):

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
bash scripts/dev-env.sh exec node scripts/configure-alice-computer-agent.mjs --dry-run
```

**Only after explicit Alice rollout approval**, the implementing agent may run:

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

After live readiness, one separately scoped Alice cursor-only test can establish
its native route and cached receipt. Check exact history for one cursor call;
do not infer arbitrary application/file effects from that test. Save a factual
Alice handoff using its latest expected_revision, preserving any newer user state.
The Alice project Chat owns subsequent actual development tasks and acceptance.
