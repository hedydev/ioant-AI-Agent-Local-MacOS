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

## Evidence-linked audit v2 (committed, Mac rollout pending)

Following the first live report, its assertions could not be reconciled against quoted source lines. Evidence protocol v2 introduces deterministic `L0001`-style IDs for **redacted, bounded** accessibility-snapshot lines. Ollama observations must specify `claim` and `evidence_line_ids`; a pure local validator resolves exact IDs to source excerpts and moves missing/invalid citations into an explicit unverified section. Model-provided quote text is ignored. The report includes counts, the evidence protocol, truncation status and model-assessment disclaimer.

Validation design: the model never executes page content; citations do not certify claim-to-evidence entailment, visual appearance, link functionality, page semantics or accessibility standards. The source remains best-effort redacted; never scan secret-bearing pages in Phase 1. The full raw browser snapshot is not written to disk, only brief redacted excerpts of lines the model cites in the final report.

The persisted state now includes `evidenceSchemaVersion: 2`. The first audit after this update creates a fresh evidence report even when its bounded snapshot SHA matches a v1 report. Later unchanged captures return `UNCHANGED` before Ollama inference. `--force` deliberately requests a new report.

`scripts/bootstrap-phase1.sh` now:
1. Reuses a unique existing `https://example.com/` browser tab, or opens the page if none is present; fails visibly on duplicates.
2. Runs the real audit once (new report or unchanged skip), immediately runs it again and **requires `UNCHANGED example`**; this checks the unchanged-page path on the user's Mac without persistent monitoring.
3. Stops only the Gateway it started.

**Status:** code and mocked tests prepared; user has not yet run v2 on Mac. Successful v1 smoke proof remains valid, but v2 evidence quality and Mac dedup still need evidence.

## Report location acceptance — Mac Desktop (2026-10-24)

Human-facing Markdown reports: `~/Desktop/Ioant-AI-Agent-Reports/<site-id>/<timestamp>.md`. Private audit state, SHA hashes and diagnostics still live under the LunaDrive `audits/<site-id>` directories. New reports are written straight to Desktop; existing Markdown reports can be copied there without overwriting or deleting their LunaDrive originals via `bash scripts/dev-env.sh exec node scripts/export-reports.mjs`.

The unchanged-snapshot skip requires the referenced previous report to exist at its Desktop destination. If the report is absent, it is regenerated instead of silently skipping. Unit and mocked end-to-end tests cover the new behavior.

**Mac acceptance:** verify the file appears on the Desktop, old reports copied safely, new owner-only permissions and repeat unchanged behavior. This is not yet verified on the user's Mac. Desktop/iCloud sync may transmit private report excerpts depending on Mac settings; use only approved non-sensitive pages.

## Desktop permission regression: corrected test, Mac rerun pending

Actual Mac test result: `28/29` pass, with a test-fixture-only failure on supposedly public directory permission. The developer wrapper enforces `umask 077`, so requesting `0o755` during `mkdir` was insufficient to produce a world-readable directory. The safety checker correctly accepted the actual private `0o700` directory.

The test now first creates the fixture, explicitly `chmod(0o755)`, checks mode bits, verifies the safe rejection, then resets permissions to `0o700` and verifies success. This behavior was reproduced under `umask 077` using a local Node 22 test snippet; **full Mac tests have not yet been rerun**.

To finish rollout, fast-forward `main`, run all tests, export older `.md` files to `~/Desktop/Ioant-AI-Agent-Reports`, and open that folder. The export is intentionally after tests in a `&&` chain. It preserves original LunaDrive reports and never overwrites Desktop reports.


## Report severity calibration and evidence-based review (2026-10-24)

Real-file acceptance evidence: pre-evidence and evidence-v2 Markdown reports for the same browser snapshot hash produced `info` versus `warning` severity. The second report's accessibility concerns described missing *test evidence*, not observed broken functionality; that distinction needs to be visible.

The analysis policy now treats model `severity` as an unverified opinion. Model output may include `issues: [{claim, severity, evidence_line_ids}]`. Exact numbered-line IDs are resolved from the redacted snapshot and invalid references are kept as uncited proposals. Only cited issue candidates affect **Review priority** (info/warning/critical), and every such candidate remains `manual verification required`. A valid citation does not confirm the interpretation. Lack of heading/contrast/keyboard/screenreader evidence is an uncertainty and should not elevate priority.

The state file keeps `evidenceSchemaVersion: 2` and now also `analysisPolicyVersion: 2`. This avoids silently skipping the first new-policy report based on unchanged SHA. Thereafter, repeated unchanged captures skip inference.

This change neither adds browser actions nor introduces visual/interaction accessibility testing. Real Mac rollout/test output and confirmation of the report's judgment remain pending.


## Phase-1 report semantic consistency patch (policy v3, 2026-10-24)

New evidence: the third on-Mac Markdown report, timestamp 2026-10-23T16:35:00Z, has the same snapshot SHA as prior reports and correctly returns `info` review priority. Nonetheless, the model cited `L0002-L0005` (separate language paragraphs) while saying *a paragraph with multilingual content*, and its unchecked remediation said *Add a clear heading* despite explicit uncertainty about whether any heading exists.

The deterministic guard now checks this specific, generalizable *structural* contradiction (singular multilingual-paragraph claim vs two or more distinct cited paragraph nodes); it sends the claim to the insufficient-evidence section. It deliberately does **not** claim to verify all semantics or accessibility. Other observations still need human review.

The report renderer now withholds raw proposed webpage edits when there are no cited issue candidates, and substitutes an explicit `verify uncertainties first; no changes established` notice. When there are cited issue candidates, model recommendations are labelled unverified and must be manually confirmed before any change.

The state now distinguishes `analysisPolicyVersion: 3` so the first run after this policy update generates a new report even if the underlying snapshot hash has not changed. Existing Desktop output and strict OpenClaw `tabs`/`snapshot` restrictions remain intact. Five additional pure-function checks passed; full macOS tests and real runtime confirmation remain outstanding.


## Policy-v3 test-suite correction

Operator Mac output after latest update: **38 total / 37 pass / 1 fail**. The sole failure was an obsolete report-heading assertion in `test/evidence.test.mjs`; this test expected `Model claims without valid line citations` after the report had deliberately renamed its section to `Model claims with insufficient evidence (unverified)`. The same test output demonstrated correct source-linked claims and the three invalid/uncited observations. Changed the assertion only; production code and semantic guard are unchanged.

A targeted code-path reproduction passed. Full-suite pass, dedup proof (`UNCHANGED example`), and new v3 Desktop report still require Mac execution. Use the standard one-command bootstrap after fast-forwarding `main`.


## Fourth report: complete evidence references for enumerated paragraph languages (2026-10-24)

Fourth real local report shows the intended `info` triage, separate multilingual paragraphs, and conditional-only manual checks. Its same SHA-256 confirms no detected change in bounded page text since earlier reports. However one observation explicitly lists six languages while the report quotes source lines only for English, Arabic, Chinese, and French (four citations).

Root cause: static per-observation citation truncation to four in `parseAnalysis` and `attachEvidence`, plus an equivalent model system-prompt limit. In `analysisPolicyVersion: 4`, all three limits become eight. A structural evidence-count rule prevents a claim listing several separately presented paragraph languages from appearing fully cited if the number of distinct paragraph source lines is lower than the number of languages named. A full six-line citation passes; a four-line citation for six claimed paragraph languages is explicitly moved to unsupported evidence.

This is a limited structural consistency rule; it does not independently recognize each language and does not validate translation fidelity, visual appearance, keyboard navigation or accessibility. Old reports are preserved on the Mac Desktop. The first v4 run creates a new report even when the SHA is unchanged, then another identical run should return `UNCHANGED`.

**Mac acceptance pending:** run project Node tests and the one-command bootstrap if another live sample is desired; record actual test output and the second `UNCHANGED` log. No reinstallation or other-device operations required.


## Fifth report evidence/content sign-off — sample site (2026-10-24)

The fifth actual local report `2026-10-23T17-07-25-282Z-3b628081.md` demonstrates the revised model's six separate language paragraph descriptions with six separate citation excerpts (`L0002-L0007`) plus IANA link label and target citations (`L0008-L0009`). The report's two risk fields are both `info`, with no unsupported claims and no unsolicited page-modification instructions. The browser snapshot hash is identical to the four prior sampled reports.

**Accepted from operator evidence:** report content shape and evidence alignment on the simple `example.com` case. **Not yet accepted:** independently confirmed full test count, unchanged-page second pass, more complex multi-page audits, visual accessibility and functional interaction. Stage 1 remains read-only, with Desktop Markdown output and LunaDrive-only diagnostic state.

No code change is necessary for this simple example based on the fifth report; prioritize real-site evaluation after the remaining runtime checks.
