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
