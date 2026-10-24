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


## `watch.lock` conflict and verified orphan recovery (2026-10-24)

The operator's Mac trial authenticated the Gateway, started the isolated `openclaw` browser, and created exactly one authorized ChatGPT conversation tab (browser target `92B4BF9F43325BA3806F52BD50DF87F6`). The foreground worker then stopped on `EEXIST: watch.lock`. **That means a lock file existed, not that the other watcher was definitely still alive, and not that the ChatGPT page successfully loaded/sent anything.**

Root cause: Stage 2 previously created `watch.lock` with exclusive `wx`, but never checked if its owner PID was still running after an abnormal crash. An old lock therefore blocked every subsequent launch. Additionally, reading `state.json` before the cleanup `try/finally` could leave a lock behind if the state was unreadable.

Stage 2 now uses a standalone lock module. On an existing lock, it opens an exclusive recovery guard in the same private per-chat directory, requires a regular private same-user bounded JSON lock file with a trustworthy PID and timestamp, and checks `kill(pid,0)`. Only **ESRCH = definite nonexistence** permits stale-lock removal. An alive PID, `EPERM`, unknown process state, unsafe permissions, symbolic links, malformed metadata, a changing file identity, or simultaneous recovery **fail closed**. New locks include a random owner nonce. Cleanup checks the same owner/nonce before unlinking. No process is killed, and state history is not cleared. Old-format lock files (pid/startedAt) are recognized for recovery.

`state.json` load now occurs inside the guarded `try/finally`. This fixes state-load-error lock leakage without relaxing duplicate execution / uncertain-feedback protections.

**Operator steps:** fast-forward the Mac checkout, run full `node --test`, then rerun `bash scripts/chatgpt-loop.sh --chat-url 'EXACT-CHAT-URL' --watch`; add `--initialize --enable-alice-preflight` and locally provided `ALICE_SSH_TARGET` only when intentionally authorizing the Alice sync action. If a previous owner still exists, the worker prints its PID and refuses a second instance—inspect with `ps -p PID -o pid=,command=` before doing anything else. Do **not** blindly `rm watch.lock`, kill unrelated processes, reset state, or remove `watch.lock.recovery` while another recovery might be active.

**Validation:** five focused Node 22 tests of orphan recovery, active lock refusal, invalid/public/symlink lock rejection, safe owner-specific release and recovery contention passed in isolated Linux. Real Mac watch continuity, DOM sign-in, and reply confirmation remain to be tested.


## Proxy-routed managed Chromium blocked by strict SSRF: use existing Chrome (2026-10-24)

**Real Mac evidence:** OneBox/sing-box on `127.0.0.1:6789` is listening; OpenClaw 2026.10.6 accepts `browser.extraArgs: ["--proxy-server=http://127.0.0.1:6789"]` and starts the dedicated `openclaw` browser. But its `browser open <ChatGPT URL>` fails with exactly `Navigation blocked: strict browser SSRF policy cannot be enforced while this browser profile is proxy-routed`. This is OpenClaw's security contract, not a ChatGPT authentication error or proof that OneBox is broken. Do **not** work around it by enabling `dangerouslyAllowPrivateNetwork` just to access ChatGPT.

OpenClaw official browser profiles provide `user` (existing local Chrome via Chrome DevTools MCP, requires an interactive consent prompt) and `chrome` (official Chrome extension relay, suited to unattended work). The Mac loop launcher now honors **explicit** `IOANT_CHATGPT_BROWSER_PROFILE=user` or `chrome`, while `openclaw` remains the default. The worker rejects unknown profiles. When using the existing signed-in Chrome, the launcher **requires exactly one already-open tab with the complete exact authorized chat URL** and does not create a browser tab if missing; it never imports cookies, changes Chrome's global proxy, relaxes browser SSRF policy, or navigates to unapproved URLs.

**Mac read-only existing-Chrome smoke test, after fast-forward and passing tests:**

```bash
REPO="$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
CHAT_URL='https://chatgpt.com/g/g-p-6acaef839af081919426a885b3209f54-ben-di-aigroup/c/6adb7cd3-78fc-83ec-9379-ab1decb687cf'
git -C "$REPO" pull --ff-only origin main && (
  cd "$REPO"
  bash scripts/dev-env.sh exec node --test &&
  IOANT_CHATGPT_BROWSER_PROFILE=user bash scripts/chatgpt-loop.sh --chat-url "$CHAT_URL" --once
)
```

Open the exact target URL in ordinary Chrome first and approve the local Chrome remote-debugging attach when prompted. Chrome MCP typically requires Chrome 144+ with remote debugging enabled at `chrome://inspect/#remote-debugging`. Existing Chrome may access more of the personal session than the selected page even though our worker reads only the exact tab; this is a higher-trust integration. Never attempt to import the personal profile into managed Chromium.

For future unattended automation, install and approve the **official** OpenClaw Chrome extension on the Mac, choose its **Selected tabs** access mode, place only the authorized ChatGPT tab in the OpenClaw tab group, and launch with `IOANT_CHATGPT_BROWSER_PROFILE=chrome`. Do not automatically install a new extension or grant all-tab access without user approval. The extension's live pairing is a separate acceptance checkpoint. Existing `browser.extraArgs` remains relevant only to managed Chromium; switching to `user`/`chrome` does not require disabling or altering it.

**Validation:** profile-routing code and focused tests published; real Mac Chrome attach, page DOM reading and message send/receipt remain unverified. An HTTP 403 response from `curl` over OneBox does not establish the outcome in full signed-in Chrome.


## Signed-in Chrome attach on Mac: `DevToolsActivePort` still inaccessible (2026-10-24)

User enabled remote debugging at `chrome://inspect/#remote-debugging` and retried built-in `user` profile, but OpenClaw 2026.10.6 Chrome MCP existing-session attach still failed with `Could not find DevToolsActivePort` in the default Google Chrome user-data directory. An operator's prior shell test showed the target path exists (`-e`) but is not readable (`-r` false). This is insufficient to distinguish filesystem permissions, macOS TCC, Chrome version or an auto-connect bug. Do not `chmod/chown`, delete or copy Chrome profile files, disable browser security or restart existing Chrome without evidence.

OpenClaw official alternative is the built-in `chrome` extension profile, using the official browser extension's native bootstrap. It does not depend on Chrome MCP `DevToolsActivePort`; before installing, inspect `openclaw browser extension status --json` or `openclaw browser extension setup --action inspect --json`. With operator approval, `openclaw browser extension install` registers the native host and requests the official Chrome extension; Chrome still requires the user to approve/enable it. In extension Settings, choose **Selected tabs**, then put ONLY the explicitly approved ChatGPT tab in its OpenClaw tab group. `IOANT_CHATGPT_BROWSER_PROFILE=chrome` activates this already-supported mode, and the launcher requires exactly one matching authorized tab. No arbitrary navigation and no SSRF relaxation.

**Safety correction:** older docs described `--once` as read-only, but its control flow actually reached pending-feedback handling and `extractAction`, so an existing structured task could be executed. The new `--once` now exits immediately after the exact-tab readPage check, before extracting/executing any task, writing reports or sending messages. A focused mock-browser test provides an actionable JSON task and verifies only `tabs` and `evaluate` were called. Use this corrected version for future read-only Chrome smoke tests; `--watch` continues to be the explicitly enabled execution mode.


## Existing Chrome extension: a matching tab but no composer; then missing tab (2026-10-24)

The Mac operator used the *renamed project* URL:
`https://chatgpt.com/g/g-p-6acaef839af081919426a885b3209f54-ai-mc-alice/c/6adb7cd3-78fc-83ec-9379-ab1decb687cf`.

In the first real trial with `IOANT_CHATGPT_BROWSER_PROFILE=chrome --once`, the launcher found exactly **one** authorized tab matching the full URL and the worker acquired its lock, but refused to continue: `ChatGPT conversation input not ready. Sign in within isolated OpenClaw profile first.` That error message was misleading in extension mode: the page parser only recognized `#prompt-textarea` and did not show DOM readiness or alternate composer evidence. It does **not** prove a sign-out. On the next fresh temporary Gateway run, the extension no longer listed that exact URL. This means the target tab was absent from the **authorized list at that moment**, not necessarily absent from the Chrome browser. Official OpenClaw extension docs distinguish connected relay from eligible tabs. In `Selected tabs` mode, only tabs in its OpenClaw Chrome tab group are available; tab-group changes, pauses and reconnections may revoke visibility. Previous versions have published MV3/relay reconnection issues.

Diagnostics now recognize narrow ChatGPT composer variants: `#prompt-textarea`, `[data-testid="composer-input"][contenteditable="true"]`, `[data-testid="prompt-textarea"][contenteditable="true"]`, form-scoped role=textbox contenteditable and narrowly labeled form textarea. The empty check handles textarea `value`, not just `textContent`. When absent, failure reports only current browser profile and safe structural flags: `readyState`, presence of `main` and prior assistant turns, generic login form and number of editable nodes. It **never** prints page text, cookies or other tab URLs. Read-only `--once` waits up to three read attempts (1.2s apart) for initial SPA hydration and still cannot execute/sent tasks. A focused test simulates multiple composer variants.

If the tab is not listed, the launcher now prints only counts of authorized tabs, ChatGPT tabs and same conversation-ID variants. It distinguishes zero authorized tabs (check Selected tabs OpenClaw group and pause), a different project path with the same conversation ID (open the **exact** user-selected URL; do not auto-follow), and a genuinely absent target among other authorized tabs. No auto-navigation, SSRF relaxation or extension permission broadening was introduced.

**Real Mac acceptance still needed:** with Chrome target tab visibly loaded, extension Settings -> Selected tabs, tab in the OpenClaw tab group and not paused, launch the read-only `--once` using the current exact URL; confirm `Read-only ChatGPT probe passed`. Since the launcher starts and stops a temporary Gateway on each run, extension relay reattachment can be transient; long-running stable Gateway remains a separately scoped future improvement, not something claimed done by these diagnostics.


## Regression fix: stale launcher assertions and duplicate read-only probe (2026-10-24)

Real Mac `node --test` found two failures after the tab visibility diagnostics change:

- `test/chatgpt-browser-profiles.test.mjs` still asserted legacy `/TAB_COUNT=/` and old "No matching ChatGPT tab" wording. The launcher's current implementation correctly uses `TAB_COUNTS=` to compute count-only metadata before assigning `TAB_COUNT TAB_VISIBLE TAB_CHATGPT TAB_SAME_ID`. Updated static test assertions to match the actual current interface, including renamed-project diagnostics; runtime tab authorization was not modified.
- `test/chatgpt-loop-once-readonly.test.mjs` expected one `tabs` plus one `evaluate` operation, but the read-only worker performed one pair during its initial page readiness check and a second pair inside the main watch-loop body before exiting. The extra read is unnecessary and increases transient Chrome extension relay exposure. The worker now returns straight from `--once` after the **first successful exact-tab DOM read**, inside the lock cleanup `try/finally`. It still performs up to three bounded `evaluate` attempts only when the first page has not hydrated, and it still never runs tasks, sends messages or performs an implicit `--initialize`.

A Node 22 isolated reproduction with a mock OpenClaw CLI verified that the earlier control flow produced `tabs, evaluate, tabs, evaluate` and failed the one-read assertion; after early return, the same read-only mock test passed with `tabs, evaluate` and no mutation. All revised launcher contract regex checks were verified against the committed launcher candidate. These are local fixture tests, **not** Mac OpenClaw/browser or full repository-suite acceptance. Ask the operator to fast-forward `main`, run `node --test`, then continue their `chrome --once` smoke test once the test suite passes.

## 2026-10-24: Fix malformed line delimiter in --once read-only mock test

The user ran the full Mac Node v24.21.0 suite: 70/71 passed; `test/chatgpt-loop-once-readonly.test.mjs` failed to parse because a source string contained an actual newline between single quotes in `.trim().split('...')`, where it needed the two-byte escaped delimiter `'\\n'`. Fixed this single malformed test expression and made `.map(line => JSON.parse(line))` explicit. Isolated Node 22 `node --check` and a targeted 1/1 mock-browser test pass; the Mac full-suite still needs verification. This change is limited to test source/docs, not the Chrome extension, browser automation, execution authorization, or Gateway auth.


## Default private, persistent diagnostics for the Mac ChatGPT feedback loop (2026-10-24)

The operator has now confirmed real Mac read-only acceptance of the exact `ai-mc-alice` ChatGPT conversation through the `chrome` extension profile: `Read-only ChatGPT probe passed: exact conversation and composer detected; no task executed or message sent`. The next explicitly requested feature is local diagnostic writing so that future Chrome relay, Gateway, DOM and Alice preflight failures can be investigated without relying on screenshots of terminal output.

The foreground launcher now **automatically** creates a new 0600 JSONL file per run under:
`/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos/logs/chatgpt-loop/`.
The directory is 0700. Each filename includes a UTC timestamp, process ID, and random nonce to avoid collisions during rapid reruns. The script prints `[loop] Diagnostic log: <path>` at startup and continues showing normal terminal messages. No cloud upload, daemon, cron, data reset, Gateway config change, or Chrome permission modification. If this private log cannot be created, launcher startup stops rather than silently writing to an untrusted path.

Events capture only allowlisted metadata: timestamps, phase markers, chosen browser profile, Gateway state (existing/temporary/stop/error), exact-tab success/failure, page readiness, initialization attempt/confirmation, action type and validated task ID, status/exit code/elapsed time, report-created marker, feedback pending/confirmed, a roughly two-minute heartbeat, error class and clean termination. **Not logged:** Gateway tokens/passwords, ChatGPT message bodies, DOM snapshots, other tab URLs, terminal or SSH stdout/stderr, raw error strings, report JSON contents, cookies, or browser page HTML. Error codes are coarse (auth, tab, composer, proxy SSRF, connection, timeout, uncertain send, lock or unexpected). Existing bounded Desktop per-task reports remain available for detailed command failure output. Do not upload original Gateway raw logs without separate review.

Storage is bounded to four 2 MiB segments (maximum 8 MiB per run). On new launch, same-owner private regular files older than 30 days are pruned; suspicious symlinks or inaccessible files are left untouched. The old logs are not retroactively reconstructed. A long-running session reaching the cap continues normal execution but stops appending diagnostics; this is a deliberately documented upper bound, not infinite retention.

**Mac operator commands**, no credentials or browser session required:

```bash
REPO="$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
cd "$REPO"
bash scripts/chatgpt-loop-logs.sh latest   # Print newest log path
bash scripts/chatgpt-loop-logs.sh tail     # Show last 80 timestamped safe events
bash scripts/chatgpt-loop-logs.sh bundle   # Create private diagnostics ZIP on Desktop
```

The exported ZIP contains at most 10 newest private JSONL event segments; it deliberately excludes Gateway raw logs, browser content and AliceAI report payloads. Inspection does **not** start Gateway or touch the Chrome extension.

**Local test evidence:** six Node 22 diagnostic-module tests passed in an isolated container after fixing a same-second filename collision; four additional launcher/reader contract tests are included. The complete Mac suite, real live `--watch` logging, send/receipt and Alice sync execution are **not yet accepted**.


## 2026-10-24: Chrome extension connected but reported zero authorized tabs at startup

Real Mac foreground `--watch` after a previously passing `chrome --once` showed a new default private diagnostic log path and `[loop] Chrome extension is connected but exposes 0 tabs`, then closed only its temporary Gateway. This is **not** proof that Chrome is closed or the target conversation is invalid. The OpenClaw extension reports *eligible, explicitly shared* tabs only. Official docs distinguish extension pairing from authorized tab visibility; in `Selected tabs` mode Chrome's **OpenClaw tab group** is the access-control boundary and **Pause on this tab** can also hide the target. A Gateway/relay reconnect can temporarily retire debugger attachments before reattachment.

To reduce false negatives when starting a new temporary Gateway, the launcher now retries **only when the `chrome` profile initially reports zero authorized tabs**: eight reads spaced two seconds apart, for at most ~16 seconds of waiting. It reuses the existing Gateway of that run. It does **not** restart Chrome, recreate Gateway, open pages, move tabs, broaden to All tabs, disable SSRF protection, or override user permission. After any tab becomes visible, the original exact full-URL and uniqueness checks still gate execution. If none becomes visible, it fails closed with the existing Selected-tabs instructions. Empty lists are not incorrectly reinterpreted as successful authorization, and malformed retry responses abort rather than proceeding.

The private event stream now includes `tab_retry_started`, `tab_retry_recovered`, `tab_retry_timeout`, `tab_retry_error`, without storing tab titles, URLs or page content. Review through `bash scripts/chatgpt-loop-logs.sh tail`; ZIP export through `... bundle`. This retry is a workaround for *transient* reconnects only. Persistent zero tabs requires the operator to confirm that the target ChatGPT tab is in the Chrome **OpenClaw** tab group and the extension popup says **Allow on this tab** / not paused. An old or renamed project tab URL still fails strict matching and needs explicit navigation to the user-selected correct URL. No real Mac acceptance of this new bounded retry yet.

See official OpenClaw Chrome extension documentation for exact Selected tabs ACL and connection details: https://docs.openclaw.ai/tools/chrome-extension


### Screenshot correction: Access All tabs and Relay unavailable

User screenshot from the exact `ai-mc-alice` ChatGPT Chrome tab clearly displayed **Access: All tabs**, **Pause on this tab** and **OpenClaw relay unavailable**. Therefore the prior generic failure text about a missing OpenClaw Selected-tabs group did **not** apply to the user's current configuration: **All tabs** does not require an OpenClaw tab group; **Pause on this tab** indicates the tab is not session-paused. The relevant question is whether the relay is connected while Gateway is running. In the current launcher, closing a **temporary** Gateway on failure can legitimately leave the extension popup showing **Relay unavailable**; a screenshot taken *after* `[loop] Stopping only our temporary local Gateway` cannot prove the relay was down when `tabs` returned an empty list.

Current short-term fix: on **chrome profile + zero eligible tabs**, retry eight times at 2-second intervals without adding permissions, changing extension settings or restarting Gateway. Diagnostic `tab_retry_started/recovered/timeout/error` events identify this stage. The failure message now distinguishes All tabs from Selected tabs, says explicitly that zero tabs does not establish a healthy relay, and tells the operator to inspect the popup **while the launcher is running**, not after it shuts down. Persistent relay unavailability requires inspecting the local Gateway/browser extension connection through supported OpenClaw read-only doctor/verify flows in the same session; a later, separately scoped improvement may use an operator-managed stable local Gateway and shared credentials to avoid relay churn.

Official reference: https://docs.openclaw.ai/tools/chrome-extension; "Relay unavailable" troubleshooting distinguishes local Gateway `/browser/extension` pairing from standalone loopback `/extension`.


## 2026-10-24: First real ChatGPT send confirmed by conversation, but old worker stopped

**Real user evidence:** with `--initialize --enable-alice-preflight --watch`, the Chrome extension relay recovered after retry 4, exposed 11 tabs, and selected exactly the intended `ai-mc-alice` chat. The worker tried the initial Alice protocol message and exited with `Message send could not be confirmed`. The operator then shared the exact **user** initialization message plus an actual ChatGPT assistant response. Therefore initial delivery **did** occur at least once, while the old worker's one-second, latest-five-user-turn DOM check did not confirm it. This is **a send-confirmation false negative**, not proof that the browser failed to press Enter; do not automatically retry the same message.

The responding AI **correctly did not emit executable JSON**. It identified that the previous pending work involved `alice-mac.sh sync` then **`witness-lab-startup-probe` on experimental BDS 17880**, not `witness-preflight`. The allowed `alice-witness-preflight` action is NOT an alias for an experimental BDS startup probe. This authorization boundary remains unchanged.

**Fix:** page extraction now returns only deterministic **user-role receipt prefixes** instead of the previous raw snippets from the last five user messages. It examines up to the last 100 rendered user turns, finds the exact allowed Alice/basic initialization marker or `[IOANT-MAC-OPS RESULT ...]`, and returns no user message body. After typing and before the first potentially submitting Enter, initialization persists a private `initPending: "alice"|"basic"` state. After Enter, the worker performs eight read-only confirmation attempts with 1.5-second spacing, re-verifying the exact target URL each time. A user-role receipt—not merely a reply from the AI, a cleared composer, or an unrelated quoted string—is required for a positive confirmation. No Enter retries or report resends occur during these checks. All other fixed-action authorization, Chrome permissions, Gateway lifetime, and watcher controls are unchanged.

**Recovery:** when started again, any existing `initPending` is reconciled first from visible user-role receipts. If verified, it records `initSent` / `aliceInitSent`, clears pending, logs `initialization_reconciled`, and continues watch **without reposting**. If not verified, it logs `initialization_uncertain` and stops rather than guessing. For **legacy runs** (including this real Mac run) that failed before `initPending` existed, initialization likewise first checks the existing conversation's user-role receipts, and skips sending if the exact marker is present. Existing `feedbackPending` still retains its independent no-duplicate-send guard. An AI response with no structured JSON leaves the watcher idle, not executed or stopped.

**Verification:** executed a direct mock DOM evaluation of the actual embedded OpenClaw page function: it correctly retained only the two permitted user-role receipt prefixes and did not return sample private message bodies. New isolated simulated integration tests cover delayed DOM commit, recovery of an already delivered pending init, fail-closed unresolved pending, and browser DOM receipt privacy. This is *not yet* a full Mac Node suite or a verified production send/receipt loop. Do not report AliceAI witness-preflight as completed.


## 2026-10-24: Separate explicitly authorized 17880-only startup probe

The operator approved integration of the existing Alice `witness-lab-startup-probe` into the Mac ↔ ChatGPT automation after observing the watcher remain idle: the receiving AI correctly identified that its earlier pending experiment is `alice-mac.sh sync → witness-lab-startup-probe`, *not* the previously authorized read-only `witness-preflight`. The Mac-side executor now registers an entirely separate allowlisted action `alice-lab-startup-probe` gated by the **separate** `--enable-alice-lab-startup-probe` opt-in and `ALICE_SSH_TARGET`. The old `--enable-alice-preflight` does not authorize it.

Initialization with `--initialize` plus the new lab flag sends a one-time prompt to the **same selected ChatGPT conversation** to request exactly one structured task, with fields `protocol,id,action` and action `alice-lab-startup-probe`; it never directly executes on initialization. If the target AI decides not to issue that JSON, the watcher stays idle.

For one received, complete and twice-stable structured lab task, the worker first durably saves `labProbeAttempted={id,at}` in its private LunaDrive per-conversation `state.json` BEFORE ANY Git, SSH or BDS operation. This prevents repeated lab startup after browser disconnect, uncertain send, crash, repeated task ID or new task ID; it also consumes authorization if a pre-step fails (conservative). On success or failure the one-shot barrier remains. Do **not** manually remove this barrier or Mint's clone process locks/one-shot backup markers; further attempts need separate human review and scoped reauthorization.

Fixed plan (no shell-provided commands or model-supplied args):

1. Verify exactly `hedydev/ioant-AI-Minecraft-Alice`, `main`, clean tracked worktree; Git fetch and `pull --ff-only`; re-check cleanliness.
2. Execute Alice's maintained `alice-mac.sh sync` with its own Mac/Mint tests. No Alice client or production BDS restart.
3. Execute the read-only `witness-lab-startup-check`; require unique fresh private Mac Desktop report `AliceAI-BDS-Lab-Startup-check-TIMESTAMP.json`, schemaVersion 1, `state=ready_for_isolated_lab_probe`, `reason=none`, and all production-safety booleans false.
4. Execute the reviewed Alice `witness-lab-startup-probe` once, within a bounded child command timeout. The upstream script does its own 17880 clone/port/process isolation checks, backs up cloned config and instrumentation, launches only cloned BDS, requests graceful stop, and reports enum-only status. It does NOT restart or write the production 17879 world/BDS. Existing Mint scripts use `ssh -tt` and can require local operator `sudo` for *read-only* /proc cwd verification; the automated child cannot submit a sudo password or bypass this requirement, so a permission failure must be reported as a stop.
5. Accept `passed` only if the **new, unique, owned/private** `AliceAI-BDS-Lab-Startup-probe-TIMESTAMP.json` schemaVersion 1 report has `state=lab_module_imports_observed`, `serverReadyObserved=true`, `verifiedScriptModuleLoaded=true`, `scriptLoadErrorObserved=false`, `isolatedBdsExited=true`, all production mutation flags false. This is evidence of BDS imports, NOT Alice player login/movement, world witness or real gameplay.

On failure, produce bounded enum/status information and a sanitized validated JSON report if one exists. Raw SSH/sudo output is **not** copied into the ChatGPT response. If shutdown is unverified or the child times out, do NOT automatically rerun or conclude that the 17880 BDS is stopped; inspect it manually. In particular, a local timeout or lost SSH response cannot independently guarantee Mint process termination. The worker still confirms message receipt before proceeding, with the prior `feedbackPending` duplicate-send guard.

**Mac commands** (stop the current foreground watcher via Ctrl+C before starting a new one):

```bash
cd ~/Documents/workspace/ioant-AI-Agent-Local-MacOS
git fetch origin main
git pull --ff-only origin main
bash scripts/dev-env.sh exec node --test

IOANT_CHATGPT_BROWSER_PROFILE=chrome \
ALICE_SSH_TARGET="tedz@192.168.0.104" \
bash scripts/chatgpt-loop.sh \
  --chat-url "https://chatgpt.com/g/g-p-6acaef839af081919426a885b3209f54-ai-mc-alice/c/6adb7cd3-78fc-83ec-9379-ab1decb687cf" \
  --initialize \
  --enable-alice-lab-startup-probe \
  --watch
```

Use `bash scripts/chatgpt-loop-logs.sh tail` and `... bundle` for private event-only diagnostics. The new one-shot claim is recorded as `lab_probe_claimed`; never infer execution from an initialization receipt alone. **Real Mac Node-suite pass, sudo readiness, real Mint 17880 start/stop and ChatGPT round-trip are NOT YET VERIFIED.** No existing Alice source code, BDS world or Mint process was modified in this integration commit.


## 2026-10-24 — Opt-in read-only Mint BDS process identity (Stage-2)

The new **`mint-bds-process-identity`** action adds a reusable fixed-diagnostic pattern to the existing same-chat feedback loop. It is *not* in the default automatic allowlist: the operator must launch the exact authorized conversation with `--enable-mint-diagnostics` and locally set `ALICE_SSH_TARGET`. The ChatGPT protocol remains three exact fields (`protocol`, `id`, `action`); the assistant cannot specify a PID, host, shell command, path or argv. The foreground worker sends a bounded read-only JSON result to the same conversation, which may issue a distinct next task ID. This action does not automatically run on startup merely because a port was previously blocked; `--initialize` requests a decision from the selected ChatGPT conversation.

The fixed command plan queries UDP 17879/17880/17881 using `sudo -n /usr/bin/ss` (no password prompt), selects a unique **fresh** 17880 `bedrock_server` PID, checks `ps` process metadata and `/proc/PID/cwd` and `/proc/PID/exe` with fixed `sudo -n /usr/bin/readlink`, then rechecks process birth and socket PID. Reports only bounded PID, parent PID, birth hash, process name, classification (`production_port_owner`, `production_directory`, `isolated_lab_directory`, `other_or_unverified_directory`), and production-port relation. No raw socket text, full paths, process argv or credential strings are returned to ChatGPT. PID changes, missing visibility, unexpected executable and ambiguous results never count as proof. This is point-in-time identity evidence, **not** authority to kill anything or retry a one-shot lab probe.

If `sudo -n` is not permitted in this noninteractive SSH context, the result is `approval_required` with no password entry, no sudoers modification and no fallback to privileged scripting. Previous interactive sudo validation is NOT proof that noninteractive SSH has cached credentials. A least-privilege Mint configuration would require a separate review and operator approval; do not request password sharing.

**Mac Terminal, selected ChatGPT conversation must already be available in the approved OpenClaw Chrome relay:**

```bash
REPO="$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
cd "$REPO"
git fetch origin main && git pull --ff-only origin main
bash scripts/dev-env.sh exec node --test
IOANT_CHATGPT_BROWSER_PROFILE=chrome ALICE_SSH_TARGET='tedz@192.168.0.104' \
  bash scripts/chatgpt-loop.sh \
  --chat-url 'PASTE_THE_EXACT_SELECTED_CHATGPT_CONVERSATION_URL' \
  --initialize --enable-mint-diagnostics --watch
```

Do not copy the literal placeholder URL; use the conversation already authorized in the browser. `Ctrl-C` stops only this watcher and its owned temporary Gateway. It does not restart Chrome, BDS, Alice, MCSManager, VPN or the production 17879 world. Tests added under `test/mint-diagnostics.test.mjs` exercise live-PID rediscovery, production collision classification, invalid SSH targets, missing owner, sudo refusal, mid-sample PID churn, restricted port parsing and explicit protocol authorization. **Only isolated local mock tests have run so far; real Mac/Gateway/SSH/sudo and same-chat roundtrip remain unverified.**


## 2026-10-24 — Delivered Mint initialization, but read-back timed out

Operator confirmed that OpenClaw successfully sent the `Ioant Mac Mint read-only diagnostics ioant-mac-ops-v1` initialization into the exact selected ChatGPT conversation. The watcher nonetheless stopped with `Message send could not be confirmed after bounded read-only checks`. This is **message delivery without local confirmation**, not proof of Mint diagnostic execution. The specific DOM visibility cause is unverified. Do not repost, reset state, bypass the pending receipt, or launch any one-shot lab probe.

The watcher now extracts anchored allowlisted receipts from user-role message-content children when present, with a role-container fallback. Only receipt prefixes, never raw user message text, leave the browser. Its shared read-only verifier makes eight bounded exact-chat checks after Enter and during recovery of a persisted `initPending`; no Enter retries, command reruns, or automatic sudo/password changes occur. An exhausted check logs one sanitized `receipt_unconfirmed` reason (`user_receipt_not_visible` or `page_unavailable`) on private LunaDrive, without DOM/text/URLs.

Run full Mac Node tests after fast-forward. Relaunch the existing exact conversation with `--enable-mint-diagnostics --watch` and the same local SSH target (no `--initialize` needed to reconcile `initPending`). Require `Previous initialization found in ChatGPT user messages; no duplicate sent.` before expecting a new diagnostic task. If not confirmed, leave state untouched and inspect `bash scripts/chatgpt-loop-logs.sh tail`; actual Mac Chrome UI remains unverified until this operator check.


## 2026-10-24 — Persistent false-negative initialization receipt; operator-only recovery

Real Mac evidence after 113/113 tests passed: the initialization was delivered to the exact ChatGPT conversation, but a later watcher failed with `Previous initialization send remains unconfirmed; no automatic resend`. This establishes that the page extraction proof path did not confirm; the actual live DOM condition has not yet been independently captured. Do not call this an SSH or UDP issue; no Mint BDS identity query ran. No number of simulated passes can prove the live Chrome DOM selector.

The browser evaluator now returns `receiptEvidence` containing ONLY bounded user-role node count, matching message-body node count and two booleans for the known Mint initialization prefix. On exhausted read-only confirmation, the foreground worker prints those bounded fields once, enabling diagnosis of missing role nodes vs wrapper/prefix mismatch. No raw browser text, full DOM, token, URL or unrelated content is retained. It does not widen automatic receipt acceptance or resend anything.

For a message the **human operator has positively observed in the exact user-role ChatGPT conversation**, there is now a separately invoked manual recovery utility: `bash scripts/dev-env.sh exec node stage2/acknowledge-mint-init.mjs --chat-url EXACT_URL`. It requires an interactive terminal, validates the exact chat-scoped private LunaDrive state, enforces the existing conversation lock and confirms `initPending==='mint'` with no unresolved feedback. It asks the operator to type `ACKNOWLEDGE MINT INIT`, then atomically marks only Mint initialization as **operator-acknowledged, not browser-verified**. This is a declared manual override, not a silent inference from a ChatGPT assistant reply; it NEVER changes `labProbeAttempted`, task IDs, SSH configuration, sudo authorization, BDS processes or worlds. It will not accept another type of pending init. If it fails, preserve the original state and inspect the new read-only `receiptEvidence` output.

After acknowledgement, run the regular exact-conversation watcher with `--enable-mint-diagnostics --watch`, and omit `--initialize`. The current assistant must emit one **new** unique structured task to drive the Mint read-only diagnostic. The SSH `sudo -n` permission may still fail closed separately. Full Mac Node test and real Chrome closed-loop acceptance are still required.


## 2026-10-24 — New ChatGPT Chat/Work layout selector incompatibility

A real operator Mac Chrome run produced `userRoleNodes=0, bodyNodes=0, mintPhrasePresent=false` with a valid exact ChatGPT tab and working composer. External browser integrations have documented a 2026 Chat/Work layout that drops `data-message-author-role` and uses explicit user/assistant content unit attributes; this is a supported hypothesis, not yet proof of the operator's exact DOM. Source: https://github.com/steipete/oracle/issues/517 and https://github.com/miuuyy/codex-chatgpt-web/blob/main/src/chatgpt-session.ts .

The Stage-2 DOM reader now selects **only role-marked** message units: legacy `data-message-author-role=user|assistant`; otherwise `data-content-search-unit-key$=':user'|':assistant'`; with separate explicit user bubble `data-user-message-bubble=true` and assistant `data-conversation-role=assistant` fallbacks. **User-role text is never searched for executable task JSON**. The assistant code parser sees only assistant-marked `pre code` snippets. Existing finished-assistant and twice-stable-action safety gates remain. Browser extraction exports only bounded user-receipt prefixes and code candidates from assistant elements. It never dumps conversation text or cookies.

The `receiptEvidence` output now includes new/old role element counters and a fixed `assistantSource` enum, so if the exact user receipt still fails it is possible to distinguish `legacy`, `content_unit`, `role_unit` or `absent` without dumping DOM. No state file removal, repeated initialization, automatic sudo escalation or BDS startup is permitted. Mock regressions verify user-only command text cannot reach the assistant action queue. **Real Mac testing and new-layout role recognition still require operator validation.**

## 2026-10-24: Operator-approved least-privilege Mint BDS diagnostic

**Approval and measured need:** The real ChatGPT → OpenClaw → Mac → Mint request `mint-20261024-identity-006` returned `approval_required` because arbitrary `sudo -n ss` was not permitted. The operator explicitly approved deploying a *separate, narrow, read-only helper*. This is not authorization to stop processes or start any experimental BDS.

**Fixed privilege:** `scripts/mint-bds-diagnostics.py` is installed root-owned at `/usr/local/libexec/ioant/mint-bds-diagnostics.py`. The only non-interactive root invocation allowed for `tedz` is exactly `sudo -n /usr/bin/python3 -I -S /usr/local/libexec/ioant/mint-bds-diagnostics.py`. Its `/etc/sudoers.d/ioant-mint-bds-readonly` rule contains no command wildcards and grants no generic root shell, no `sudo ss`, no `sudo readlink`, and no caller-chosen PID or paths. The installed helper and its parent directory must be root-owned, unreadjustable by `tedz`, and sudoers mode 0440.

**Data contract:** The helper reads only UDP 17879/17880/17881 with an absolute `/usr/bin/ss`, selects one visible BDS process owner from current 17880 socket evidence, reads its `/proc/PID/stat`, `comm`, `cwd` and `exe`, double-checks the Linux PID start tick and socket owner, and emits compact schemaVersion 1 JSON. It never exposes absolute paths, raw socket lines, credentials or command lines. `production_port_owner`, `production_directory`, `isolated_lab_directory`, `other_or_unverified_directory` are classifications, **not authority to stop**. Missing or changing evidence becomes `inconclusive`. The Mac validator rejects malformed, stale, contradictory or oversized responses and never forwards failed sudo stderr to ChatGPT.

**One-time interactive Mac install** (only the approved `tedz@192.168.0.104`, an exact clean Git `main`; no server restart):

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
git fetch origin main && git pull --ff-only origin main
bash scripts/dev-env.sh exec node --test
bash -n scripts/install-mint-bds-readonly-mac.sh scripts/mint-bds-setup.sh
ALICE_SSH_TARGET="tedz@192.168.0.104" bash scripts/install-mint-bds-readonly-mac.sh
```

The Mac installer securely stages only its three owned helper/config/install files under a newly created private Mint directory. Mint setup prompts for local sudo authentication, validates sudoers syntax before/after installation, ensures root ownership, refuses to overwrite a differing installed helper/rule, then runs a read-only smoke check. It does not change existing services, worlds, VPN, ports or MCSManager. A failed prerequisite does not authorize widening permissions. Installation is **not** complete until the operator reports the smoke check and tests.

**Runtime:** Start the existing foreground ChatGPT watcher with `--enable-mint-diagnostics --watch`, `ALICE_SSH_TARGET` locally defined, and the already-authorized exact ChatGPT conversation URL; omit `--initialize`. A new ChatGPT `mint-bds-process-identity` task runs one fixed SSH command, no arbitrary sudo and no command from the page. Fresh JSON returns to the same chat. **No automatic root grant bootstrapping or recurring privilege changes**.

**Rollback:** After separate explicit approval and identity/ownership verification, an operator can remove only `/etc/sudoers.d/ioant-mint-bds-readonly` and `/usr/local/libexec/ioant/mint-bds-diagnostics.py`, and revalidate `/etc/sudoers`. Do not remove broad sudoers directories, stop BDS, clear Alice lab one-shot locks, or alter production 17879. Existing differing files are not overwritten by installer; re-review is required for upgrades.


## 2026-10-24 — Read-only BDS 17880 parent/cwd lineage action

The live `mint-bds-process-identity` action **passed** on Mint without another sudo password. Process PID 1712655, parent PID 1712650, birth tag `060b5f8fe3cd`, 17880 listener is distinct from 17879's owner; nevertheless the root helper reported `other_or_unverified_directory`. That means only that the actual cwd did not exactly match either known directory. It is *not* permission to stop or restart any process.

New action `mint-bds-process-lineage` is included under the existing separate `--enable-mint-diagnostics` opt-in. It does **not** change Mint's root-owned helper or sudoers and does not write/install any remote file. Mac first invokes the fixed root helper to dynamically learn a fresh PID and PPID. It runs **only** unprivileged, integer-derived, fixed `ps -p pid,ppid -o pid=,ppid=,comm=,lstart=` and `readlink /proc/pid/cwd` (plus parent cwd when readable), re-reads ps, then invokes the same fixed helper to independently verify the original kernel birth tag, PID, PPID and classification. No task can supply a PID, host, path, arbitrary `argv` or shell fragments. All shell-transported arguments except fixed commands are validated integers from the root witness, not ChatGPT.

Only bounded process classifications, a parent process allowlist label, parent process start hash, and a SHA-256 prefix for the current cwd are sent to ChatGPT; **raw paths, user commands/args, full proc data and remote errors are not returned**. A child cwd permission failure or changed parentage returns `inconclusive`, never automatically widens sudo. Inaccessible parent cwd is explicitly labeled `unavailable`. The same existing ChatGPT no-duplicate task/feedback rules and lab one-shot barriers remain. A successful lineage result is point-in-time investigative evidence, never permission to kill or launch the isolated 17880 server.

**Mac commands:** `git fetch origin main && git pull --ff-only origin main`, then `bash scripts/dev-env.sh exec node --test` and `bash scripts/chatgpt-loop.sh --chat-url EXACT_SELECTED_URL --enable-mint-diagnostics --watch` with the same Chrome profile and local `ALICE_SSH_TARGET`. Restart only the foreground OpenClaw watcher after stopping it with Ctrl-C; do not restart Mint, BDS, MCSManager or Alice. A new unique structured task `mint-bds-process-lineage` is required. **Live SSH readlink permission and parentage are not yet accepted**, despite successful original identity diagnosis.


### 2026-10-24 — Live lineage failure: unprivileged child cwd inaccessible

The end-to-end task `mint-20261024-lineage-001` ran through OpenClaw and returned `inconclusive/unprivileged_child_cwd_unavailable`. This proves Linux Mint's ordinary user could not read the 17880 BDS `/proc/PID/cwd` through the fixed SSH operation. It is **not** evidence of a foreign process, and no sudo scope change is authorized.

The lineage action now treats denied unprivileged cwd as an **explicit partial result**. It still reads the parent cwd when available, repeats the fixed `ps` process/parent snapshot, and repeats the installed root-owned fixed helper to ensure the BDS PID, PPID, kernel birth token and port identity were unchanged. If independent parentage is confirmed but child cwd is unreadable, it reports `status=inconclusive`, `state=partial`, `reason=unprivileged_child_cwd_unavailable`, `childCwdCategory=unavailable`, `childCwdHash=null`, `parentSameCwd=null`, and verified bounded parent process classification/start tag. It does **not** mark cwd or full lineage as verified. A changed PID or parent discards all partial fields. The root helper and sudoers stay untouched and the action still never accepts any task-supplied PID or path.

**Operator refresh:** Stop only the foreground OpenClaw watcher with Ctrl-C; update clean `main` and run Node suite. Restart the same watcher with `--enable-mint-diagnostics` and the same fixed chat/SSH target. Use a **new task ID** for `mint-bds-process-lineage`; never reuse the previous ID. No Mint install or sudo authorization is needed. The fix has not yet been exercised on real Mac or Mint at the time of this commit.


## 2026-10-24 — Opt-in project self-update and feedback-then-reload

**Operator intent:** Keep OpenClaw in one foreground Mac terminal while ChatGPT reviews fixes in GitHub `main` and issues a fixed `project-update-verify` task. OpenClaw should update itself, run tests, send the sanitized result back to this exact ChatGPT conversation, and only load the new code after feedback has been durably confirmed. No user-supplied Git ref, repository, shell command or PID is ever accepted in ChatGPT JSON: exactly `protocol,id,action` only.

**Prerequisite:** This feature was absent from previously deployed watch versions. Once, the Mac operator must stop the old watcher with Ctrl-C, `git fetch origin main && git pull --ff-only origin main`, run `bash scripts/dev-env.sh exec node --test`, and restart `scripts/chatgpt-loop.sh` with the existing `IOANT_CHATGPT_BROWSER_PROFILE=chrome`, `ALICE_SSH_TARGET=tedz@192.168.0.104`, exact chat URL, `--enable-mint-diagnostics --enable-self-update --watch`. This preserves the existing 17880 one-shot marker, Mint read-only sudo policy, original BDS processes and local ChatGPT conversation state. Never repeat `--initialize`.

**When triggered:** The updater must confirm literal approved Git origin and clean local `main`, fetch `origin main`, verify `HEAD` is ancestor of fetched commit, validate the candidate tree has only regular/executable blobs, extract the exact commit to a private staging folder in LunaDrive, and run `node --test` there. If the tests fail or status changes, abort **without** updating local main. If tests pass, re-check local HEAD and origin/main, execute only `git pull --ff-only origin main`, verify applied HEAD is exactly the pretested commit, and emit bounded JSON `IOANT_PROJECT_SELF_UPDATE` including `from`, `to`, `tests` and whether a reload is needed. No forced update, branch switch, reset, clean, stash, arbitrary remote URLs, automated Mint changes or shell from the page. Temp staging is removed only within its own newly created folder. A remote branch racing the pull must not be called success unless the pinned tested SHA actually applies.

**Watcher reload gate:** A successful, changed update alone does not stop the worker. The worker first writes a report, durably marks `feedbackPending`, sends the result, confirms its exact ChatGPT user-role receipt, and clears it with a persisted `lastTaskId`. Only then can it exit 75; the existing foreground shell launcher re-spawns one worker in the same loop/profile, preserving all state. At most three consecutive reloads; any error, no update or uncertain feedback leaves the process stopped or waiting and never replays the task. No background daemon, recurring remote polling or unattended startup.

**Scope limitation:** Trust in code on GitHub origin/main is assumed. Candidate tests execute checked-out repository code in a private user-owned folder and **are not a hardened malware sandbox**; do not treat updates from unknown/malicious maintainers as safe. Existing repository/tests are the trusted release channel. The Mac app source update is distinct from updating OpenClaw's own global installation or changing the Mint diagnostic helper/sudoers, which remain explicitly out of scope. Real live Mac Git fast-forward and automatic process relaunch require acceptance after bootstrap.

## 2026-10-24 — Real Mac self-update bootstrap observed; canary for first auto-update

The Mac operator reported `tests 143; pass 143; fail 0` after pulling the self-update implementation, then restarted the **existing foreground** watcher with `--enable-mint-diagnostics --enable-self-update --watch`. Its output showed exactly one authorized Chrome ChatGPT conversation, both read-only Mint actions, `project-update-verify (clean main, pretested fast-forward only)`, and `Waiting for a structured ChatGPT task`. This confirms the new launcher and parser are loaded, but **does not yet prove** automatic fetching, the isolated candidate tests, feedback confirmation or a worker reload.

This **documentation-only commit** is a deliberately benign canary update. The next ChatGPT task must contain exactly `{"protocol":"ioant-mac-ops-v1","id":"self-update-20261024-canary-001","action":"project-update-verify"}`. The watcher must safely detect the new `origin/main`, verify the candidate revision and run `node --test` against the isolated archive, fast-forward only after all tests pass, send bounded results, confirm the user-role feedback receipt, and then reload the worker through the existing foreground launcher. If any step fails, leave the current watcher, Git state and conversation markers intact or fail closed according to the recorded result; **never manually bypass the gate or repeat the same task ID**.

Acceptance requires an OpenClaw report with the exact canary target SHA, `state=updated`, `reloadRequired=true`, full passing tests, plus a launcher log showing the worker actually restarted. An `up_to_date` response validates only the no-op path. Neither the Mac diagnostics helper/sudoers nor the Linux Mint server/world, PID, Lab one-shot marker, browser authentication or OpenClaw global installation is part of the canary.


## 2026-10-24: Canary failed at Chrome snapshot, before feedback typing

The real operator ran `--enable-self-update` with 143/143 tests. OpenClaw detected `self-update-20261024-canary-001`, wrote a Desktop report, then aborted on `openclaw browser --browser-profile chrome snapshot --target-id t3 --interactive`, CDP timeout 4824ms. Since snapshot happens **before browser type/press**, no message submission occurred in this execution path; the persisted `feedbackPending` may contain a successful or failed Git-update report, but the Git outcome is **unknown from console logs alone**. Do not replay the Git action or presume whether local HEAD advanced; operator may inspect the existing private Desktop report. The Git update stage and browser delivery are distinct.

### Durable send phases and no-duplicate recovery

New tasks persist `feedbackPending.phase=prepared` before attempting to send feedback. A failed read-only snapshot is retried at most twice with an exact-tab and empty-composer recheck. The durable `press_intent` state is persisted **before** `browser press Enter`. A pending prepared task is never reexecuted: on the next iteration / watcher restart, the worker checks the exact user-role receipt, then may retry sending the **saved feedback only** if the composer remains empty and no assistant generation is underway. If typing left a draft, it waits for safe empty-composer state rather than deleting text. If `press_intent` exists, delivery may have happened and all recovery remains strictly read-only; absence of a visible receipt never authorizes another press. The watcher keeps monitoring instead of terminating on recoverable browser/CDP errors. New actions never execute while prior feedback remains pending. For a self-update, automated reload still requires confirmed feedback before exit 75.

### One-time legacy recovery for the snapshot timeout already reported

The old runtime persisted `feedbackPending={id,feedback}` without a send phase, so it cannot be safely auto-resubmitted on restart. After verifying that the user-provided terminal logs **specifically show the `snapshot` failure before typing/Enter**, and verifying the result for `self-update-20261024-canary-001` is *not* already posted as a user message in the exact chat, the operator may run interactive `stage2/recover-canary-feedback.mjs --chat-url EXACT_CHAT_URL` and type `SNAPSHOT FAILED BEFORE TYPE`. This script checks private state ownership, exact single historical task ID, known action/feedback prefix, and takes the existing conversation lock. It only converts that stored legacy feedback to `phase=prepared`, preserving lastTaskId, all task state, one-shot lab markers, and the original saved result. It never calls Git, SSH, browser, Mint sudo or BDS and cannot run twice. Restart the updated foreground watcher normally; it will send the saved feedback with the new protected state machine. No `--initialize` and no reused task ID.

This is not a blanket operator override to mark an uncertain message sent. For any future unclear post-press outcome, maintain the `press_intent` barrier and require user-role receipt or a separately reviewed recovery; do not repurpose this historical recovery script.
