# Ioant AI Agent — Local macOS

Phase 1: **human-controlled, read-only website audits** using the OpenClaw browser CLI for *snapshots* and a local Ollama model for *analysis*. No ChatDock dependency, cloud API, browser clicking, shell actions proposed by pages, or unattended account mutation.

> Status: first real Mac **read-only smoke audit passed** (2026-10-23 operator log): OpenClaw opened example.com, local Ollama produced a private Markdown report, and temporary Gateway cleanup ran. Report quality, unchanged-page deduplication and ongoing monitoring remain to be individually accepted.

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
Markdown report on Desktop; private JSONL diagnostics on LunaDrive
```

The model receives a bounded, redacted accessibility snapshot. The model is **not** given tool access and its output is **never** treated as a command. Stage 1 opens no tabs automatically: the operator opens an authorized page in the selected OpenClaw profile first.

## Node version policy

This stage-1 project's local inventory, test and audit scripts support **Node 20+**; the repository intentionally has **no `package.json` `engines.node` pin**, so `fnm --resolve-engines` does not prompt to install a new Node merely on entering the project. OpenClaw is a separate tool, with its own (currently stricter) runtime/security policy. Inspect the existing OpenClaw launcher and managed Node before deciding whether anything needs upgrading. This repository never installs or switches Node.

## One-command Phase-1 Mac bootstrap (recommended)

With the repository already cloned, paste **only one command** into Mac Terminal:

```bash
git -C "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS" pull --ff-only origin main && bash "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS/scripts/bootstrap-phase1.sh"
```

The script also copies existing Markdown reports from LunaDrive to the Desktop report folder without overwriting or deleting originals. New reports are written directly to Desktop; state and diagnostics remain on LunaDrive. The script reuses an existing OpenClaw executable when found. Otherwise it downloads the **official HTTPS** `install-cli.sh`, syntax-checks it, and installs the CLI plus its **private compatible Node runtime** using `--runtime-only --no-onboard` under `~/.openclaw`. It then runs Node tests, checks your existing Ollama service on `127.0.0.1:11435` and the installed `gpt-oss:20b` model, starts (only if required) a temporary authenticated loopback Gateway, opens an isolated OpenClaw browser profile to `https://example.com/`, and runs one read-only local audit.

It never changes fnm defaults, installs a system-wide Node, installs a Gateway daemon, downloads models, imports Chrome cookies, or starts unattended monitoring. When complete, it stops only the Gateway process it started; other services are preserved. If the browser or Gateway cannot initialize it fails visibly with a private log location. This is an automation of the **first local acceptance attempt**, not proof that the live Mac will pass before testing.

## 📁 Where to find your reports (macOS)

All user-facing Markdown reports now go to **`~/Desktop/Ioant-AI-Agent-Reports/<site-id>/<timestamp>.md`**. For example, `~/Desktop/Ioant-AI-Agent-Reports/example/`. Internal SHA-state and diagnostic logs remain in `/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos/audits/`.

To copy **older reports** to Desktop without overwriting desktop files or deleting the LunaDrive originals (no OpenClaw or Gateway needed):

```bash
bash scripts/dev-env.sh exec node scripts/export-reports.mjs
open "$HOME/Desktop/Ioant-AI-Agent-Reports"
```

The export is repeatable. Files and folders use owner-only permissions; the Desktop may be synced via iCloud if that feature is enabled on the Mac. **Do not audit sensitive/private sites until privacy protections are stronger.**

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

## Evidence-linked reports and unchanged-page verification

Audit v2 numbers redacted accessibility snapshot lines as `L0001`, `L0002`, etc. The model returns claims with source line IDs; the report renderer adds **actual source excerpts** from those lines. Missing/invalid references are shown separately as **uncited** and are never silently treated as evidence. A cited line is only a source pointer, not proof the model interpreted it correctly; claims about visual styling, actual clicks or accessibility behavior still require human/functional tests.

On first run after updating from the original report schema, the program deliberately creates a **new evidence-v2 report** even if the page text has not changed. From then on, matching snapshots with the same SHA are skipped unless `--force` is used. The one-command bootstrap now performs a second same-page capture and requires `UNCHANGED` to confirm no repeat inference. It reuses an existing unique `example.com` tab instead of opening duplicates.

Local audits can contain short excerpts of page text despite best-effort credential redaction; avoid sensitive/private pages for stage 1. No full raw snapshot is persisted.

## Environment discovery before installing anything

The Mac may already have OpenClaw, Ollama, ADB, etc. A missing shell command does not prove an app is absent. Use the [read-only environment registry](docs/ENVIRONMENT_REGISTRY.md) first:

```bash
node src/environment.mjs scan
bash scripts/dev-env.sh exec node src/environment.mjs save
node src/environment.mjs check
```

A sanitized, private JSON snapshot is saved on LunaDrive, **never pushed to this public repository**. OpenClaw and other local AIs may read it with explicit local file permission; cloud ChatGPT cannot read it automatically.

## Stage-1 boundaries

- One or more explicitly configured sites, sequential read-only captures. Matching uses **exact URL**; unexpected redirects and missing tabs fail closed.
- Manual `--once`; optional `--watch --interval 60+` while terminal remains open. Unchanged snapshots are skipped in watch mode.
- Human-readable Markdown reports are stored in a private folder on the Mac Desktop; SHA state and structured diagnostic events remain in the private LunaDrive directory (see `docs/DEVELOPMENT_ENVIRONMENT.md`).
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


## Calibrated review priority (analysis policy v2)

The **same source snapshot SHA-256** can generate different model assessments after a prompt or report-format update; this is not evidence the website changed. The first two real reports from example.com showed exactly that: the original report said `info`, and evidence-v2 marked it `warning` solely because accessibility checks were *not demonstrated*.

The newer report separates **Model-suggested severity** (unverified) from **Review priority**. Only a distinct `issues[]` model candidate with a valid source line ID can elevate the review priority to `warning` or `critical`; such items are prominently labeled **manual verification required**. No cited issues => `info`, even if the model expresses uncertainty about headings, color contrast, keyboard traversal or link function. A citation confirms only the *source line*, not that a proposed problem is true.

The first run after this policy update writes a new desktop report (`analysisPolicyVersion: 2`) even when the underlying page has not changed. Subsequent identical captures are deduplicated. Legacy reports remain unchanged and are still valid historical records of the model's earlier judgments.


## Evidence consistency and non-actionable AI suggestions (policy v3)

Source line citations establish **provenance**, not general factual truth. A narrow evidence guard now flags one observed model error pattern: an observation describes **one multilingual paragraph**, but its cited source lines are multiple separately typed `paragraph` nodes. Such a claim appears under "Model claims with insufficient evidence" rather than as a supported observation; a true single multiline-language paragraph can still be cited.

The report will **not** display unconditional webpage modifications when no explicit, source-linked issue candidates are present. Instead it prompts manual verification of uncertainties without recommending any page change. If issue candidates exist, the model's proposed follow-up is still marked **unverified** and conditional on review.

The initial run after upgrading to analysis policy v3 regenerates an evidence report on the Desktop even when the page snapshot SHA is identical. Subsequent unchanged captures remain deduplicated. No services, packages, model downloads or filesystem relocations are needed for this update.


## Evidence citation count (analysis policy v4)

A single observation may now cite up to **eight** source lines instead of four. If an observation lists distinct languages of separate paragraph nodes, the number of paragraph citations must cover every language it names, or the claim appears in the report's insufficient-evidence section rather than masquerading as completely sourced. This general count check is **not** a semantic language detector. The v4 policy creates a fresh Desktop report once, then resumes normal unchanged-page deduplication.


## Phase 2 (opt-in): ChatGPT → Mac → ChatGPT command-feedback loop

A **separate experimental foreground worker** can watch one explicitly selected ChatGPT conversation via the already installed isolated OpenClaw browser profile. When the most recent assistant turn contains exactly one structured `ioant-mac-ops-v1` JSON task, the worker can execute a small fixed action allowlist (`project-tests`, `project-status`, `project-head`, `environment-scan`), write a private Markdown report to the Mac Desktop and send a bounded result back to that exact conversation before waiting for the next distinct task ID.

No plain-text shell commands are executed, even if suggested by ChatGPT. Other actions receive `approval_required`, not automatic host access. It does not import Chrome cookies, require a separate agent daemon, enable cross-conversation reading, or modify the Phase-1 audit permissions. State, task IDs and pending feedback receipts live privately on LunaDrive. The worker stops with Ctrl-C.

```bash
# On Mac, after fast-forwarding main and passing node --test:
bash scripts/chatgpt-loop.sh --list
# Supply the EXACT URL of the intended ChatGPT conversation:
bash scripts/chatgpt-loop.sh --chat-url 'https://chatgpt.com/c/REPLACE_WITH_YOUR_ACTUAL_ID' --initialize --watch
```

If ChatGPT is not signed in within the **isolated OpenClaw profile**, complete the one-time login in that profile. **Live Mac acceptance:** the separately opted-in Stage-2 fixed self-update loop completed a 159/159 pretested Git fast-forward, posted a verified ChatGPT response, reloaded under a new session, and processed a new `project-head` task on 2026-10-24. Other browser and AliceAI integrations are not thereby accepted; see [the detailed canary record](docs/SELF_UPDATE_CANARY_20261024.md). Do not use `--initialize` when restarting an already initialized conversation.

See [complete Phase-2 architecture, security, setup and validation](docs/CHATGPT_LOOP.md).


## Opt-in ChatGPT ↔ AliceAI automatic command/report loop

For a recurring ChatGPT discussion that asks you to update AliceAI, run Mint tests and generate BDS witness-preflight reports, see [ChatGPT command feedback loop](docs/CHATGPT_LOOP.md). After explicit `--enable-alice-preflight` startup, the bounded worker handles Git ff-only sync, tests, read-only witness generation, and posting the sanitized JSON result back to the **same** ChatGPT conversation without repeated manual copying. It never accepts raw shell commands from the page and does not restart BDS or edit a world. The Stage-2 **self-update** live workflow is verified, but this separate AliceAI witness-preflight workflow is not covered by that specific acceptance; see [the canary evidence](docs/SELF_UPDATE_CANARY_20261024.md).
