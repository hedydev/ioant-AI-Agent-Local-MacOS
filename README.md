# Ioant AI Agent — Local macOS

Phase 1: **human-controlled, read-only website audits** using the OpenClaw browser CLI for *snapshots* and a local Ollama model for *analysis*. No ChatDock dependency, cloud API, browser clicking, shell actions proposed by pages, or unattended account mutation.

> Status: implementation committed; live Mac/OpenClaw/Ollama validation is required on the operator's machine. Do not mistake unit tests for a live-browser acceptance test.

## Architecture

```text
Explicit watchlist (exact URL, browser profile)
             |
OpenClaw CLI: tabs -> snapshot --target-id   [read-only]
             |
sanitize / SHA-256 / change detection
             |
Ollama native /api/chat on 127.0.0.1:11435 [local-only]
             |
private Markdown report + JSONL diagnostics
```

The model receives a bounded, redacted accessibility snapshot. The model is **not** given tool access and its output is **never** treated as a command. Stage 1 opens no tabs automatically: the operator opens an authorized page in the selected OpenClaw profile first.

## Quick start (Mac Terminal)

```bash
cd "$HOME/Documents/workspace"
git clone https://github.com/hedydev/ioant-AI-Agent-Local-MacOS.git
cd ioant-AI-Agent-Local-MacOS
bash scripts/dev-env.sh check
bash scripts/dev-env.sh exec node --test
bash scripts/preflight.sh
```

Install OpenClaw **separately** if missing, following https://docs.openclaw.ai/install (review installer first). Start/onboard Gateway following official documentation; do not overwrite an existing configuration. This project does not install software, restart services, change firewall/proxies, or edit OpenClaw configuration automatically.

```bash
# After OpenClaw Gateway is healthy:
openclaw gateway status
openclaw browser --browser-profile openclaw start
openclaw browser --browser-profile openclaw open https://example.com
openclaw browser --browser-profile openclaw tabs

# The example watchlist contains only https://example.com.
bash scripts/dev-env.sh exec node src/audit.mjs --once --id example
# Private report location is printed. Watch mode is opt-in:
bash scripts/dev-env.sh exec node src/audit.mjs --watch --id example --interval 300
```

To audit another page, copy/edit `config/sites.json` with **exact** page URL and profile, open that same URL yourself using `openclaw browser --browser-profile ... open ...`, then run `--once --id YOUR_ID`. If a logged-in tab is required, first sign in manually in the **isolated** OpenClaw browser profile; browser profiles are not automatically shared with ordinary Chrome.

## Stage-1 boundaries

- One or more explicitly configured sites, sequential read-only captures. Matching uses **exact URL**; unexpected redirects and missing tabs fail closed.
- Manual `--once`; optional `--watch --interval 60+` while terminal remains open. Unchanged snapshots are skipped in watch mode.
- Reports and structured diagnostic events are stored in a private directory on the selected LunaDrive development volume (see `docs/DEVELOPMENT_ENVIRONMENT.md`).
- No clicking, form filling, posting comments, subprocess execution derived from webpage contents, code editing, Mint SSH, or automatic ChatGPT feedback.
- Only the OpenClaw **browser CLI** is used by stage 1; we do not run an unrestricted OpenClaw autonomous agent. Later stages may add constrained agent tool permissions after separate approval.

## References

- [Phase 1 setup, acceptance and limitations](docs/PHASE1.md)
- [Security and trust model](docs/SECURITY.md)
- [Development storage contract](docs/DEVELOPMENT_ENVIRONMENT.md)
- [Operator and AI governance](AGENTS.md)
- Official docs: https://docs.openclaw.ai/cli/browser and https://docs.openclaw.ai/providers/ollama/configuration

AI-Agent: ChatGPT
AI-Session: k8b2q5nt
