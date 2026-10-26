# Local Mac terminal and UI text bridge (2026-10-27)

This is an **operator opt-in** extension for the existing, already bound ChatGPT Project Worker. The browser relay, service, repo and agent permissions otherwise remain unchanged. Do not give any Agent an unrestricted tool grant; these actions only execute after explicit local Mac terminal enrollment.

## What is allowed

- Protocol `mac-terminal` takes `{protocol,id,action,cwd,command}`. The `cwd` alias is one of `workspace` (`~/Documents/workspace`), `desktop` (`~/Desktop`) or `downloads` (`~/Downloads`), and `command` is a bounded terminal command run with `/bin/zsh -f -c`; timeout 300 seconds, output maximum 2,400 chars. No `sudo` is conferred, but **zsh is NOT sandboxed**: a command can access anything its logged-in macOS user can access, *including outside the three selected working directories*. The user explicitly asked to permit this. Protect backups and important data separately. Command execution must be independently reviewed by ChatGPT and carries no success guarantee beyond process exit.
- Protocol `mac-window-text` takes `{protocol,id,action,app,text,submit}`; `app` is the locally enrolled alias, `text` is a bounded single-line string, `submit` is an explicit boolean. Before any keystroke the AppleScript verifies the exact currently frontmost process **name AND bundle ID**, at least one window, and that the focused UI element has a known editable text role. **It does not activate an app, select a window, or click an input**. The operator must bring the app window forward and click the intended input. `submit:true` presses Return after typing; this may send the message depending on the app. A successful AppleScript exit proves only that keystrokes were generated, *not* that the app received/processed a message. On a failure after partial typing, never automatically retry.
- No machine-wide accessibility privileges are granted programmatically. macOS may require the user to approve terminal/osascript automation in System Settings > Privacy & Security > Accessibility and Automation, and Files and Folders permissions for background access to Desktop, Documents and Downloads. When denied, the command reports an inconclusive/blocked result rather than weakening TCC protections.
- The text sent by GUI task is written into an AppleScript script sent to `osascript -` over stdin, **not** exposed in a command-line argument; its quoted literal is escaped. No clipboard changes. Non-ASCII text may depend on macOS keyboard/input system and needs real-world acceptance.
- Neither action accepts arbitrary command options, app bundle IDs or file paths from protocol fields beyond the above. `mac-terminal` does accept full shell text by design.
- Both grant files are private (mode 0600), under local `~/Library/Application Support/ioant-openclaw-ops` and bound to the current installed LaunchAgent conversation ID. Rebinding the conversation invalidates old grant. The browser cannot enable/revoke grants. Enrollment requires a **local, interactive Mac TTY**, with the exact existing managed launchd plist confirmed.

## Local operator setup

After new Runtime is deployed and the running Worker reloaded:

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS" || exit 1
bash scripts/dev-env.sh exec node stage2/mac-terminal-access.mjs enable
bash scripts/dev-env.sh exec node stage2/mac-terminal-access.mjs status
```

For UI text, first open the desired application (for example OpenClaw). You must use the exact running macOS app process display name. It will be discovered and bound to its current bundle ID:

```bash
bash scripts/dev-env.sh exec node stage2/mac-window-text.mjs enable "OpenClaw"
bash scripts/dev-env.sh exec node stage2/mac-window-text.mjs status
```

If the OpenClaw interface is only in a browser tab, this app process enrollment may fail; in that case use the appropriate browser automation instead, not a forged app name.

Revoke independently:

```bash
bash scripts/dev-env.sh exec node stage2/mac-terminal-access.mjs disable
bash scripts/dev-env.sh exec node stage2/mac-window-text.mjs disable
```

## Example ChatGPT commands

```json
{"protocol":"ioant-mac-ops-v1","id":"terminal-20261027-01","action":"mac-terminal","cwd":"workspace","command":"pwd && ls -la"}
```

```json
{"protocol":"ioant-mac-ops-v1","id":"gui-20261027-01","action":"mac-window-text","app":"openclaw","text":"你好，请介绍当前 Agent 模型。","submit":false}
```

Use `submit:false` for the first UI smoke test. The operator can inspect the typed text and decide when to send. Never send secrets or untrusted content to arbitrary third-party apps.

## Acceptance and rollback

1. Existing Project Worker remains bound to the same conversation; all other launch flags unchanged.
2. Run the candidate's full `node --test --test-reporter=tap` suite through `project-update-verify`. Any failure blocks Runtime update and reload.
3. After update, terminal without grant => `approval_required`. With local interactive grant => `pwd` command succeeds and produces the canonical chosen directory path.
4. GUI without local app grant => `approval_required`. With approved app and accessibility, foreground it and focus the composer; test `submit:false`, manually confirm contents before any `submit:true` call.
5. Disable both grants; tasks then return `approval_required`. Changing conversation leaves old grants invalid.
6. Existing updates, local AI models and AliceAI are not changed.
