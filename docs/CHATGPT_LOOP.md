# Phase 2 (opt-in) — ChatGPT ↔ Mac command-feedback loop

> Status: **implemented as a bounded foreground prototype and tested with simulated OpenClaw browser behavior**. Not yet accepted against the user's real signed-in ChatGPT browser/DOM. This phase is independent of and does not change the Phase-1 read-only website auditor.

## Requested workflow

A selected ChatGPT conversation issues an explicit structured task. The local Mac worker checks the latest **assistant** turn, validates a fixed action, executes only an allowlisted project check, saves a private report, sends the result into the *same* ChatGPT conversation, and remains open waiting for another task until Ctrl-C. Unrelated ChatGPT tabs are never scanned. The worker does not parse ordinary shell commands out of prose or accept `cwd` / `argv` from ChatGPT.

```text
Selected exact chatgpt.com/c/... conversation (one tab)
       | explicit JSON task in latest complete assistant turn
       v
OpenClaw isolated browser profile: read DOM with static evaluate
       | exact origin + tab check + stable two polls
       v
Schema validator: task id, action only; shell/argv rejected
       | exact allowlisted action name
       v
Spawn safe fixed argv with shell:false (Mac; repo cwd)
       | first persist execution/receipt state on LunaDrive
       v
Desktop Markdown report; bounded/credential-redacted ChatGPT reply
       | send via OpenClaw textbox/Enter; check user-message receipt
       v
Wait for next distinct task ID
```

## Allowed actions (v1)

| Task action | Actual fixed command (project root) | Authorization |
|---|---|---|
| `project-tests` | `node --test` | Automatic in opt-in loop |
| `project-status` | `git status --short --branch` | Automatic |
| `project-head` | `git rev-parse HEAD` | Automatic |
| `environment-scan` | `node src/environment.mjs scan` | Automatic |
| Any other action (`audit-example` included) | Not executed | Report `approval_required` to ChatGPT |

The first action runs the repository's existing test files; inspect changes to code/tests before enabling continuous automation. This prototype does not support arbitrary commands, scripts proposed in untrusted webpages, project modification, process killing, deployments or ChatGPT-origin shell interpolation. Higher-risk tasks require a separately designed human authorization workflow. **Approval-required** feedback is not approval and triggers no host command.

## One-time Mac setup and launch

1. Already installed: OpenClaw managed CLI at `~/.openclaw/bin/openclaw`, existing Node 20+ and mounted `/Volumes/LunaDrive`. No installation, profile import or daemon setup is performed here. Isolated browser login is distinct from ordinary Chrome and ChatDock.
2. From the repository, first list ChatGPT tabs that exist in the **isolated** OpenClaw browser profile:

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
bash scripts/chatgpt-loop.sh --list
```

3. Copy the exact ChatGPT conversation URL from the browser address bar (it must be `https://chatgpt.com/c/UUID` or `https://chatgpt.com/g/<id>/c/UUID`). Then launch:

```bash
bash scripts/chatgpt-loop.sh --chat-url 'https://chatgpt.com/c/REPLACE_WITH_REAL_CONVERSATION_ID' --initialize --watch
```

The launcher starts a temporary authenticated localhost-only Gateway **only if necessary**, then starts the isolated OpenClaw profile and opens **only that explicitly supplied ChatGPT URL** if no matching tab exists. If ChatGPT asks for sign-in, complete it directly in this separate profile; do not import ordinary Chrome cookies or grant arbitrary browser tools. The watcher prints an idle/waiting status until that exact conversation and input are ready. It sends the one-time protocol instruction *as a normal user message* once, then waits for ChatGPT's next structured assistant task.

- Stop: `Ctrl-C` in the running Mac Terminal. Only a temporary Gateway started by this script is stopped. Other services, browser tabs and ChatDock remain untouched.
- If no ChatGPT task is issued, the watcher keeps waiting, not executing anything.
- `--once` probes the selected DOM once (no initialize); `--interval 15` is default; allowed 10–3600 seconds.
- Do **not** launch two workers for the same conversation: a dedicated private lock rejects duplicates.

## Required ChatGPT task format

When ChatGPT wants the worker to run a check, the assistant sends **one independent JSON code block** with exactly these keys, a never-reused task ID and one allowlisted action:

```json
{"protocol":"ioant-mac-ops-v1","id":"test-20261024-001","action":"project-tests"}
```

Do not submit multiple tasks in the same assistant turn. The local worker examines only the **most recent** assistant turn, ignores user text and previous turns, and checks that the DOM is not generating. Shell code blocks (including `bash`, `zsh`, `curl`, `npm install`, `sudo`, `git reset`) never become executable tasks. When no action is required, ChatGPT replies normally without this JSON block.

The worker sends `[IOANT-MAC-OPS RESULT <id>]`, status, exit code and a small redacted output excerpt back to the same conversation and waits. ChatGPT can use that result to decide whether to issue the next distinct task ID.

## Storage and durability

- `LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos/chatgpt-loop/<sha-of-chat-url>/state.json` holds private task state and pending receipt; `watch.lock` prevents concurrent workers. No ChatGPT cookies or full transcripts are stored. No state is pushed to GitHub.
- Desktop output: `~/Desktop/Ioant-AI-Agent-Reports/chatgpt-loop/<timestamp>-<taskId>.md`, containing bounded, best-effort-redacted output. Desktop may sync to iCloud, depending on Mac settings.
- **Execute-once guarantee across restarts:** a task ID is persisted as `feedbackPending` before sending. If ChatGPT send confirmation fails, the worker stops; it never automatically reruns the command or blindly re-posts uncertain feedback. The operator must inspect the selected chat and state before recovery. A crashed worker may also leave a lock; never remove it while a worker is still running.
- Logs and terminal outputs can still contain secrets not caught by regex redaction. No confidential pages, account data, tokens or customer records should be processed in this prototype. Report output is deliberately limited.

## Real-Mac acceptance checklist (not yet verified)

1. `node --test` all pass in existing Mac checkout.
2. Isolated OpenClaw profile has one exact signed-in ChatGPT conversation tab, with a detectable textbox and assistant code block; no duplicate tabs.
3. One `project-head` task is executed exactly once and acknowledged in the same chat; the worker then idles.
4. A second task with a new ID produces one result; repeating a previous ID is ignored, including after worker restart.
5. A disallowed action returns `approval_required` **without** shell execution.
6. A changed ChatGPT URL, missing field, ambiguous JSON, UI selector mismatch or uncertain send stops rather than touching another chat or duplicating a command.
7. Ctrl-C stops the foreground worker and its own temporary Gateway without disturbing existing services.

## Security and current limitations

See OpenClaw browser CLI, prompt-injection and exec-approvals docs. Page text and any ChatGPT message may contain untrusted input, and local models are not approval authorities. No automatic unrestricted agent privileges have been granted. Frontend DOM selectors and OpenClaw `evaluate` JSON wrappers are version-dependent: **the browser send and receipt path is not considered real-Mac-proven until operator testing passes.** This script does not attach to the existing browser connector used by this chat; it drives only the Mac's separate OpenClaw profile.


## AliceAI repeated preflight workflow (scoped opt-in, 2026-10-24)

This capability is built from the operator's actual AliceAI exchange: ChatGPT asks the human to fast-forward `hedydev/ioant-AI-Minecraft-Alice`, run `alice-mac.sh sync` and `witness-preflight`, then upload the resulting Desktop JSON. A failed `unittest` import requires ChatGPT to fix code and then repeat the same sequence. **The operator does not need to paste that shell block for each iteration.**

Opt-in adds exactly one action (`alice-witness-preflight`) to one exact selected ChatGPT conversation. ChatGPT must issue a JSON code block like:

```json
{"protocol":"ioant-mac-ops-v1","id":"alice-preflight-0001","action":"alice-witness-preflight"}
```

The worker runs only these preconfigured commands on the Mac, never commands or hostnames supplied inside the ChatGPT page:

1. Verify canonical Alice repository remote origin, branch `main` and clean tracked worktree.
2. `git fetch origin main`, then `git pull --ff-only origin main`; verify clean again.
3. With the **locally supplied** `ALICE_SSH_TARGET`, run `bash games/minecraft-ai/scripts/alice-mac.sh sync`. Its maintained entrypoint performs Python tests, a tracked-only backed-up Mint copy and Mint tests. **This stage changes Mint project source files, but does not restart BDS/Alice or modify a world.** If tests fail, stop and return the final traceback/error text.
4. Only after successful sync run `bash games/minecraft-ai/scripts/alice-mac.sh witness-preflight`; accept solely the Desktop path printed by this invocation, with the exact timestamped filename (never a `(1)` duplicate), regular-file and freshness checks, `schemaVersion: 2`, `audit: ALICE_BDS_SILENT_WITNESS_READ_ONLY`, expected read-only flags, allowed beta experiment value and observed timestamp.
5. Post a bounded redacted execution result **and the validated, allowlisted JSON contents** into the *same* ChatGPT conversation, with an idempotent receipt. The original `.json` stays on the Mac Desktop. **This version transfers the report data in chat text, not as a literal file attachment.** If the DOM send is uncertain, do not re-run or blindly repost.

Once configured, the one-time initialization message asks ChatGPT to issue the first structured task if its preceding AliceAI conversation has a pending preflight command. After ChatGPT receives an import failure report, it can fix its repository, emit a new unique task ID, and the foreground worker loops again.

### Launch on the Mac (one-time per foreground session)

```bash
REPO="$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
git -C "$REPO" pull --ff-only origin main &&
cd "$REPO" &&
bash scripts/dev-env.sh exec node --test &&
ALICE_SSH_TARGET='tedz@192.168.0.104' \
  bash scripts/chatgpt-loop.sh \
  --chat-url 'https://chatgpt.com/c/REPLACE_WITH_THE_REAL_ALICE_CONVERSATION_ID' \
  --initialize --enable-alice-preflight --watch
```

**Use the specific AliceAI ChatGPT conversation URL; the example above is a placeholder.** This uses the operator's previously supplied Mint SSH destination as a sample, not a new discovered address. If your target changed, replace it locally. The launcher does not install anything or configure SSH keys; use your existing SSH configuration. Log in to ChatGPT in the **separate OpenClaw browser profile** once if needed. The opt-in is scoped to this foreground process; do not run the Alice workflow from another conversation without deliberately selecting it. `Ctrl+C` stops the watcher.

Automatic permissions do **not** include `alice-mac.sh deploy`, `restart`, world backup restoration, behavior pack installation, Beta API enabling, Minecraft admin operations, arbitrary shell commands or AI-proposed paths. Other actions return `approval_required`.

### Test coverage and limitations

Six new isolated Alice-workflow tests pass: local opt-in, exact argv/order, source/SSH filtering, stop on Python import failure, rejection of copied `(1)` files, and schema/timestamp privacy filtering. Existing Stage-2 protocol and simulated browser tests also pass (15/15 for this targeted subset on Node 22 Linux). This is **not** Mac real-site acceptance. OpenClaw's browser DOM selectors, sending the structured result and the full ChatGPT reasoning/repair loop still need one Mac trial. Remote Git commits will only be picked up by fast-forward on each new task; no autonomous repo commit or code edit is performed by this Mac worker.


## Existing Gateway authentication recovery (2026-10-24)

Real Mac diagnostics showed that `openclaw gateway health` and `openclaw browser ... status/tabs` returned `requires credentials before opening a websocket`. A local `sing-box` proxy was listening on TCP 6789; a ChatGPT direct `curl` request timed out, while proxy CONNECT succeeded with an eventual HTTP 403. These do **not** prove browser connectivity or Cloudflare/login acceptance; the observed browser failure occurs earlier at Gateway authentication.

The foreground `scripts/chatgpt-loop.sh` launcher now distinguishes an already-running local Gateway with missing CLI credentials from an unoccupied Gateway port. With a listener on TCP 18789 and that specific authentication-required error, it **requires an interactive Mac Terminal** and asks for the operator's **existing** Gateway token/password using hidden input. The auth mode is read from `~/.openclaw/openclaw.json` (only the mode is printed); if missing, the operator must explicitly select token/password. In token mode, the official `~/.openclaw/bin/openclaw gateway auth-token --show` command may be run in a *separate trusted terminal* to view the existing secret; **never paste it into ChatGPT or logs**. The token/password is used only in memory for that foreground session, is not written into config, and is checked by `gateway health` before any browser action. Invalid credentials fail closed: no Gateway restart, disabling authentication, config edits, or browser profile reset.

The task subprocess launcher now deletes `OPENCLAW_GATEWAY_TOKEN`, `OPENCLAW_GATEWAY_PASSWORD`, and `OPENCLAW_GATEWAY_URL` from inherited environments before spawning a project/Alice task, preventing inadvertent leakage into tests or SSH sync scripts. This is independent from the existing read-only Stage-1 audit.

If Gateway auth succeeds but ChatGPT still shows 403 or fails to load, investigate the isolated browser's proxy routing and interactive login separately; do not switch off NetScale, Tailscale, sing-box, or system proxy from this script. Existing browser sessions do not automatically share Chrome sign-in.

**Validation:** source patch and regression tests are published, but a real Mac Gateway token/password and isolated Chrome sign-in remain to be verified by the operator. The loop is **not** claimed active in this ChatGPT conversation.
