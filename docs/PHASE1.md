# Phase 1 — Local read-only browser audits

## Product scope (2026-10-23)

**Implemented in repository:** explicit watchlist, exact tab matching, sequential OpenClaw snapshot collection, local Ollama analysis, SHA-256 change detection, redacted private Markdown report, correlated JSONL diagnostic events, opt-in watch loop, unit/integration test fixtures. One browser profile per site.

**Not proven on user's Mac:** OpenClaw CLI installation, Gateway lifecycle, Chrome compatibility, Ollama availability at 11435, actual model correctness/latency, authenticated site navigation. Record real output before claiming acceptance.

**Deferred:** ChatDock integration, browser click/fill/action tests, full screenshot/vision audits, automatic navigation/following links, autonomous OpenClaw tool-using agent, Git/project mutation, Mac/Mint shell operations, cloud LLM, concurrent live multi-profile load, notifications and unattended schedules.

## Why stage 1 uses OpenClaw CLI + Ollama directly

We use OpenClaw as the browser transport, but invoke only `browser tabs` and `browser snapshot` in the runtime. Ollama `/api/chat` is called directly on loopback. We intentionally do **not** call `openclaw agent` yet: unrestricted tool-calling by a local model would mix untrusted webpage text with a potentially powerful executor. This is a safer stepping stone toward later agent orchestration.

## Existing environment discovery

Before any install advice, run `node src/environment.mjs scan` and see [Environment Registry](ENVIRONMENT_REGISTRY.md). `scripts/preflight.sh` saves a private snapshot to LunaDrive before checking live services. A missing PATH command is not proof of missing installation. User machine results remain unverified until the Mac runs the scan.

## Bootstrap on Mac

1. Ensure `/Volumes/LunaDrive` mounted and writable. `bash scripts/dev-env.sh check` fails closed if absent or inherited cache paths mention old `/Volumes/MacDev`.
2. The repository's own read-only Node scripts work with Node 20+ and **do not pin a runtime in package.json**. OpenClaw itself has a separate, stricter runtime policy (currently Node 24.22.1+ on 24, or 26.12.1+ on 26). Inspect any existing OpenClaw-managed or version-manager runtime first; do not automatically reinstall Node solely because `cd` activated fnm.
3. Install and onboard OpenClaw **manually** using official instructions at https://docs.openclaw.ai/install and https://docs.openclaw.ai/gateway ; do not use a second Chrome Bridge concurrently with ChatDock.
4. Use an isolated OpenClaw browser profile. For private sites, sign in manually in that profile; do not share credentials, import your normal Chrome cookies, or expose a remote Gateway just to pass phase 1.
5. Existing Ollama is expected at `http://127.0.0.1:11435` (not `/v1`). Use `curl -fsS http://127.0.0.1:11435/api/tags` to verify your installed model id. Default `gpt-oss:20b`; override with `IOANT_OLLAMA_MODEL` if needed. No model download is automated.
6. Start OpenClaw Gateway, then run `openclaw browser --browser-profile openclaw start` and `openclaw browser --browser-profile openclaw open https://example.com` manually. Check `openclaw browser --browser-profile openclaw --json tabs`.
7. Run `bash scripts/dev-env.sh exec node --test` and `bash scripts/preflight.sh`. Run `bash scripts/dev-env.sh exec node src/audit.mjs --once --id example`. Review the local Markdown report path from console.

## Command reference

```bash
# Mac, repo root; tests:
bash scripts/dev-env.sh exec node --test
# Available targets:
bash scripts/dev-env.sh exec node src/audit.mjs --list
# Run a single safe pass:
bash scripts/dev-env.sh exec node src/audit.mjs --once --id example
# Force another report if page is unchanged:
bash scripts/dev-env.sh exec node src/audit.mjs --once --id example --force
# Observe changes only while foreground process runs:
bash scripts/dev-env.sh exec node src/audit.mjs --watch --id example --interval 300
```

Edit `config/sites.json` to explicitly authorize further sites; these edits must be reviewed by the operator. URL rules reject plain HTTP unless loopback, fragments, query strings and embedded credentials. Keep local/private URLs out of commits: make a local config copy `config/sites.local.json` and use `--config config/sites.local.json` (ignored by Git). Only already-open exact URL matches are snapshotted. Reopen a redirected page under an explicitly approved canonical URL after review.

## Acceptance checklist

| Check | Evidence required |
| --- | --- |
| Node unit and mocked end-to-end tests | `node --test` all pass |
| OpenClaw Gateway and browser readiness | `openclaw gateway status`, `browser tabs`, `browser snapshot` |
| Ollama local inference | tags returns selected model, one `/api/chat` turn works |
| Capture exact authorized tab | one `example.com` snapshot, no missing/extra tab |
| Report provenance | Markdown SHA/time/run ID plus JSONL correlation |
| Repeat unchanged audit | prints UNCHANGED, no extra inference |
| Security | malicious webpage text never executed; model cannot access shell/browser tools |
| Real-world UI quality | manually compare report against screenshot; phase 1 is not a click-based acceptance test |

## Failure interpretation

- `No matching open tab`: use the exact URL and profile; no automatic navigation.
- `tabs was not JSON`: validate OpenClaw CLI version; do not silently parse ambiguous text.
- Ollama connection failed: inspect local `11435` service; nothing is automatically restarted.
- Invalid model response: record failure, do not fabricate a success report.
- Unknown login/redirect: inspect manually, re-authorize exact final URL.
- LunaDrive missing: reattach and verify APFS mount; no internal disk fallback.

## Known gaps

1. Model cannot see visual layout from accessibility snapshots; screenshots/vision deferred.
2. Read-only snapshots do not prove click paths, authentication or business correctness.
3. Current redaction is best-effort; do not audit pages with secrets/medical/banking content in phase 1.
4. Report/event retention and one-watcher lock are not yet implemented; manually manage only generated outputs after review.
5. No automatic site update notifications while detached, no persistent service or cron setup.
6. A unit/integration mocked test is not proof of live OpenClaw compatibility; real Mac check still required.

Sources: https://docs.openclaw.ai/cli/browser , https://docs.openclaw.ai/providers/ollama/configuration .

## Node runtime separation (2026-10-23)

The initial repository mistakenly placed OpenClaw's latest runtime floor in the **project's** `package.json` `engines.node`. This triggered `fnm --resolve-engines` automatic install prompts even when Node 24.21.0 was already available and sufficient for the stage-1 inventory/audit scripts. The project-wide engine constraint was removed; scripts/preflight.sh now checks the actual stage-1 minimum (Node 20+) and merely warns when the *current shell* Node may not satisfy OpenClaw's separate runtime requirement. OpenClaw compatibility must be verified using the runtime its own launcher actually selects. No installation, `fnm` global-default change, or other project runtime change is authorized by this fix.

## Single-command operator path

When `main` is synchronized, the preferred phase-1 acceptance command is:

```bash
bash scripts/bootstrap-phase1.sh
```

This installs the official **isolated** CLI only when missing and never installs a persistent Gateway service. It checks already installed Ollama models, uses a transient token-authenticated local Gateway only if another healthy Gateway is not found, and shuts down only its own process. Review `README.md` for a one-copy command including Git fast-forward pull. A nonzero result means the live browser acceptance is incomplete; inspect the bounded error and private Gateway log path.

## Real Mac acceptance observation (2026-10-23)

- Successfully installed isolated Node **24.22.1** and **OpenClaw 2026.10.6** (installer output).
- Bootstrap tests ran: **16 pass, 1 fail**, at `test/bootstrap-contract.test.mjs`; static regex matched documentation string `fnm installation` as if it were an `fnm install` command. The assertion was narrowed and regression test added.
- Bootstrap halted before checking Ollama, starting Gateway/browser, or generating a report.
- Next run: `git pull --ff-only origin main`, then `bash scripts/bootstrap-phase1.sh`. It should discover existing private CLI and skip reinstall. Record actual output; no live browser success claimed yet.

## First real browser/AI smoke run — PASS (operator log, 2026-10-23)

The corrected one-command Mac bootstrap succeeded. It opened `https://example.com/` under the OpenClaw browser profile, ran the `example` audit with local Ollama, printed a private Markdown report in the LunaDrive audits directory, and executed temporary Gateway shutdown. Bootstrap also reported passing project tests.

This is **a verified operational smoke run from user-provided terminal output**, not certification of report accuracy or full UX security. The report body is not available here and has not been evaluated. The earlier 16/17 test error in this document refers to a **historical failed attempt** and was corrected before this success.

Remaining optional sign-off:
- Inspect report contents against actual page evidence.
- Re-run an unchanged-page audit and verify SHA-based skip.
- Verify deliberate failure cases on the Mac without exposing sensitive pages.
- Test opt-in foreground watch start/stop if continuous observation will be used.

No Stage-2 browser click/fill/action, model tool execution, unattended agent, ChatDock connection or remote shell access is enabled by this result.
