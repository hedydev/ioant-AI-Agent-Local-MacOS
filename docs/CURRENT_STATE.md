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
