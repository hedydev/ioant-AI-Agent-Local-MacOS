# Current Project State — 2026-10-23

## Objective
Stage 1 local AI website audit: OpenClaw **read-only snapshot** of one explicitly approved page, then local Ollama analysis, evidence/provenance and private report. No ChatDock integration.

## Delivered to GitHub
- Repo initialized, auditable CLI/source/config/scripts/test suite added.
- Hero Skills governance pinned to the current main revision.
- Phase-1 security and environment contracts documented.
- Fixed browser commands are `tabs` and `snapshot`; untrusted page text is never executed.

## Validation evidence
- GitHub remote tree/HEAD and AI commit trailers checked with GitHub connector.
- Source compilation check (imports stripped) and a six-case direct pure-logic V8 smoke run passed.
- Container-to-GitHub clone failed on DNS resolution; full Node tests and live Mac browser/Ollama tests **not executed by this conversation**.
- User's Mac environment, OpenClaw version, running Gateway, and installed Ollama model remain unverified this turn.

## Acceptance still required on Mac
1. `bash scripts/dev-env.sh check` against mounted LunaDrive.
2. `bash scripts/dev-env.sh exec node --test` and `bash -n scripts/*.sh`.
3. `bash scripts/preflight.sh` checks Gateway and local models.
4. Open an authorized page manually under OpenClaw managed browser.
5. `bash scripts/dev-env.sh exec node src/audit.mjs --once --id example`, inspect report.
6. Repeat run: UNCHANGED and no duplicate inference; `--force` should create a new report.
7. Verify privacy/security with non-sensitive test pages only.

## Known limitations
Snapshot text cannot audit visual overlap; reports are model assessments, not confirmed UX functional tests. Redaction best-effort; do not inspect secret-bearing pages. Single-writer runtime, no retention automation, no autonomous agent, no service daemon, no browser clicking.

## Next milestone (not authorized for this phase)
After user acceptance, decide visual screenshot audit and a local dashboard. GitHub/doc/project actions and any browser interaction require separate permission and evidence.

## Environment Registry addition (2026-10-23)

The first-stage project now also provides `src/environment.mjs` (`scan`, `save`, `check`) and `docs/ENVIRONMENT_REGISTRY.md`. It discovers on-PATH/off-PATH binaries and probes known local Ollama ports, so AI assistants can avoid recommending redundant installs. Private data is written only on explicit save/preflight to LunaDrive, not GitHub. Four environment-tool tests were run in a Linux Node 22 container against the same discovery logic and passed; **Mac installation state and complete repository tests remain unverified**. Cross-AI automatic consumption/cloud access is not implemented.

## Node version-manager integration correction (2026-10-23)

User reported that entering newly cloned repository triggered a `fnm` install prompt for `>=24.22.1`, while system Node v24.21.0 and project-specific Node runtimes already existed. Cause: the `package.json` `engines.node` mistakenly copied OpenClaw's requirement. Removed the project-wide engines requirement and separated the CLI script Node 20+ check from OpenClaw's stricter requirements. **Awaiting real Mac validation:** `cd` should no longer trigger this specific fnm prompt; Node 24.21.0 should run inventory/tests without installing a second Node. OpenClaw may still need its own patched runtime when launched; inspect it separately.

## Single-command installer and smoke audit

Added `scripts/bootstrap-phase1.sh` which safely reuses/installs an isolated OpenClaw CLI, tests the repository, checks Ollama, launches a temporary loopback-only token-protected Gateway if needed, starts a separate browser profile, opens a public test page, and attempts one real report. No global Node upgrade, daemon installation, credential import, or cloud model changes. Script shell syntax and static contract tests are part of verification; actual installer + Gateway + browser behavior **requires Mac acceptance**.

## One-command bootstrap acceptance: false positive fixed (2026-10-23)

Operator log: isolated Node 24.22.1 and OpenClaw 2026.10.6 (fe06181) were installed successfully. Bootstrap then stopped after **16/17** project tests passed; the only failure was a misleading static-test regex `/fnm install/` matching the narrative `fnm installation` in `scripts/bootstrap-phase1.sh`. No evidence of an actual unwanted install command; browser/Gateway/Ollama inference were **not yet exercised** by this bootstrap attempt.

Corrected `test/bootstrap-contract.test.mjs` to check command-shaped lines, with a regression test for the exact false-positive case. On next Mac execution, existing `~/.openclaw/bin/openclaw` will be reused: do not repeat the first-time installation.

## First successful live local browser audit (2026-10-23, operator evidence)

User-reported Mac terminal output after corrected bootstrap:
- `opened: https://example.com/`, `tab: t1` with a browser target ID; proves OpenClaw opened the explicitly allowed public test page.
- `[phase1] Running one real read-only website audit with local Ollama`.
- `REPORT example: .../audits/example/2026-10-23T15-27-58-766Z-b6fc7a9f.md` under the private LunaDrive project cache; proves the program emitted a report path after its local model analysis.
- `[phase1] Success. OpenClaw is installed, project tests passed and a report path was printed.`
- Temporary Gateway cleanup was invoked on exit; no persistent Gateway installation is claimed.

**Status:** phase-1 initial real-Mac smoke workflow **passed** based on operator logs; local runtime/browser/model integration is no longer merely theoretical. Report content and accuracy were not inspected in this conversation; unchanged-page skip behavior, independent report quality, security of actual browser state, and opt-in watch lifecycle remain unverified.

**No extra installation required for recheck:** reuse isolated OpenClaw in `~/.openclaw`, existing Ollama on `127.0.0.1:11435`, and original fnm Node for the project scripts. Run `node --test` or `scripts/bootstrap-phase1.sh` only as needed.

**Next acceptance evidence:** open/review the single local Markdown report for grounded observations and uncertainty; run a second `--once` against the same unchanged page while a Gateway/browser is available and verify an `UNCHANGED` log with no second model inference. Keep model output and private diagnostic files local.

## Current work: Phase-1 evidence grounding and repeat-scan acceptance (2026-10-23)

The initial live report demonstrated inference but provided only free-text model claims and no source excerpts. Evidence-v2 changes:
- New `src/evidence.mjs`: bounded/redacted numbered browser source lines and deterministic citation resolution.
- `src/core.mjs`: parse structured citation IDs; Markdown report separately labels line-linked interpretations and invalid/uncited model claims.
- `src/audit.mjs`: feed numbered source, record v2 schema and evidence counts; regenerate once on schema transition, otherwise skip unchanged SHA.
- `scripts/bootstrap-phase1.sh`: reuse a unique open example tab; a second same-session capture must print `UNCHANGED`.
- Add evidence/force/dedup/invalid citation tests; adjust existing mocked integration test.

**Verification boundary:** existing v1 real-Mac smoke was successful. v2 changes have not yet been executed against user's Mac/OpenClaw/Ollama, so do not mark v2 accepted or presume model citation quality. Use the single copy-paste Mac command from README, review the new report, confirm `UNCHANGED` and no unwanted environment changes. Keep credential-bearing pages out of audits.

## Desktop reports preference and implementation (2026-10-24)

User wants **all readable audit reports visible on the Mac Desktop**. Code changes introduce a default report output directory `~/Desktop/Ioant-AI-Agent-Reports/<site-id>/`. Only Markdown reports move to Desktop; SHA deduplication state and event diagnostics remain on LunaDrive under `DeveloperCache/projects/ioant-ai-agent-local-macos/audits/`.

The new `src/report-storage.mjs` validates private output folders and report names, detects whether the existing report is present on Desktop before returning `UNCHANGED`, and safely copies legacy reports. `scripts/export-reports.mjs` performs an idempotent, non-overwriting copy of old `.md` reports, leaving originals intact; `scripts/bootstrap-phase1.sh` invokes it automatically. Tests cover report destination, file permissions, repeat export and report-absent regeneration.

The change is committed to GitHub but requires Mac execution to copy the user's historical report and validate the actual Desktop location. Do not claim the Mac Desktop has already been modified remotely.

## Mac Desktop report test correction — 2026-10-24

Operator ran the Desktop rollout tests: `29` total, `28` passed, `1` failed at `test/report-storage.test.mjs:64` (`Missing expected rejection`). The fixture called `mkdir({mode:0o755})` while `scripts/dev-env.sh` sets `umask 077`; the directory actually had private `0700` permissions, so correctly no rejection occurred. This was a **test fixture error**, not a failed security guard.

Corrected the test to `chmod(0o755)` explicitly and assert the resulting mode before expecting `privateReportDir` to reject it, then `chmod(0o700)` to verify acceptance. A separate local Node reproduction of `umask 077` and the corrected positive/negative behavior passed. Production report paths and permission validation are unchanged.

**Rollout state:** the operator's previously supplied terminal sequence stopped at the failing test (it used `&&`), so old reports were **not yet copied to Desktop** by that sequence. Mac full-suite pass and actual Desktop export remain to be verified by the operator. Use one command from the updated handoff; no OpenClaw, Ollama or Node installation needed.
